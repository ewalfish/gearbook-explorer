// Batch matcher — link a free-form gear name ("Canon AE-1 Program body,
// chrome") to its gearbook record with a confidence decision. A small trained
// model, not an LLM: normalization → candidate generation (token index) →
// feature vector → logistic-regression score, wrapped in deterministic
// confidence gates (same-core override, RF/SLR + reissue qualifier conflicts,
// lens family rule, specificity tiebreak, ambiguity guard).
//
// This complements the interactive SearchEngine (search.ts): use SearchEngine
// for typeahead (stable under partial tokens), matchOne/matchBatch for bulk
// linking of complete names.

import { matchNormalize as normalize, matchTokens as tokens, digitSeqs } from './match-normalize.js'
import type { Kind, MatchCatalog, MatchEntry } from './gearbook.js'
import { queryVariants, lensVariants } from './variants.js'

/** Trained logistic-regression weights for the feature vector in features(). */
export const DEFAULT_WEIGHTS: number[] = [
  -5.221066853479779,
  2.627068932352563,
  0.5358987618092962,
  2.0065531794467506,
  -0.9401479348182489,
  1.615277122540201,
  0.06833240278679657,
  2.785336213276419,
]

/** Score ≥ AUTO ⇒ confident auto-link; ≥ REVIEW ⇒ worth human review. */
export const AUTO = 0.9
export const REVIEW = 0.45

/**
 * The tunable part of matching — and the ONLY part a consumer should need to
 * change.
 *
 * This split exists because the alternative was a fork: camera-inventory
 * vendored fourteen engine files so that these ten numbers could differ, and
 * everything else in them is a function of the ASSET'S shape, so it had to be
 * edited in two repos every time the asset changed.
 *
 * Mechanism (normalization, candidate generation, features, alias handling)
 * versions with the asset and lives here. Policy is tuned against real
 * inventory that only the consumer has, so it is passed in.
 */
export interface MatchPolicy {
  /** Logistic-regression weights for the 8-feature vector in features(). */
  weights?: number[]
  /** Score at or above which a link is taken without asking a person. */
  auto?: number
  /** Score below which nothing is proposed at all. */
  review?: number
}

export const DEFAULT_POLICY: Required<MatchPolicy> = { weights: DEFAULT_WEIGHTS, auto: AUTO, review: REVIEW }

/** Accepts the legacy bare-weights argument, so existing callers keep working. */
function resolvePolicy(p?: MatchPolicy | number[]): Required<MatchPolicy> {
  if (!p) return DEFAULT_POLICY
  if (Array.isArray(p)) return { ...DEFAULT_POLICY, weights: p }
  return { weights: p.weights ?? DEFAULT_WEIGHTS, auto: p.auto ?? AUTO, review: p.review ?? REVIEW }
}

export type MatchDecision = 'auto' | 'review' | 'no-match'

export interface ScoredEntry {
  entry: MatchEntry
  s: number
}

export interface MatchResult {
  best: ScoredEntry | null
  scored: ScoredEntry[]
  ambiguous: boolean
  decision: MatchDecision
}

// --- string similarity ---------------------------------------------------------

function trigrams(s: string): Set<string> {
  const t = `  ${normalize(s).replace(/ /g, '')} `
  const out = new Set<string>()
  for (let i = 0; i < t.length - 2; i++) out.add(t.slice(i, i + 3))
  return out
}

function dice(a: string, b: string): number {
  const A = trigrams(a), B = trigrams(b)
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const g of A) if (B.has(g)) inter++
  return (2 * inter) / (A.size + B.size)
}

function jaccard(a: string[], b: string[]): number {
  const A = new Set(a), B = new Set(b)
  if (!A.size && !B.size) return 0
  let inter = 0
  for (const x of A) if (B.has(x)) inter++
  return inter / (A.size + B.size - inter)
}

// --- same-core matching (high-precision containment) -------------------------
// Universally-safe filler: corporate suffixes, generic "camera" words, Polaroid
// "Land", descriptors sellers append. NOT model-line words (Super/Varex/New/Mk)
// — those distinguish real models, so they must stay significant.
const FILLER = new Set([
  'co', 'corp', 'corporation', 'inc', 'ltd', 'llc', 'company', 'gmbh', 'ag', 'kg', 'kk',
  'works', 'mfg', 'manufacturing', 'industries', 'optical', 'optics', 'kogaku', 'seiki', 'shokai',
  'camera', 'cameras', 'kamera', 'the', 'genuine', 'vintage', 'original', 'land', 'official',
  'model', 'type', 'version', 'late', 'early', 'and', 'of', 'film',
  // appended lens-maker/lens names are optical notes, not camera-model distinguishers
  'schneider', 'xenar', 'xenon', 'tessar', 'elmar', 'rodenstock', 'heligon', 'ektar',
  'nikkor', 'summicron', 'summitar', 'novar', 'skopar',
])

// true when brand + every model-distinguishing token are IDENTICAL — and in the
// SAME ORDER. Set comparison would let generation/type numerals swap roles:
// "Rolleicord IV Type 2" ({rolleicord,4,2}) would match "Rolleicord II type 4"
// ({rolleicord,2,4}) — different cameras. Requires ≥2 core tokens.
export function sameCore(a: string, b: string): boolean {
  const A = tokens(a).filter((t) => !FILLER.has(t))
  const B = tokens(b).filter((t) => !FILLER.has(t))
  if (A.length < 2 || A.length !== B.length) return false
  return A.every((x, i) => x === B[i])
}

// Mount/system qualifiers that mark materially DIFFERENT versions of the same
// optical name (Jupiter-9 85/2 exists in RF and SLR builds with different
// mounts and focus): a query naming one class must never confidently link to
// the other. Checked on RAW strings — parentheticals are stripped by normalize.
const QUAL_RF = /\b(rf|rangefinder)\b/i
const QUAL_SLR = /\bslr\b/i

export function qualConflict(rawQuery: string, rawTitle: string): boolean {
  const q = String(rawQuery), t = String(rawTitle)
  if ((QUAL_RF.test(q) && QUAL_SLR.test(t)) || (QUAL_SLR.test(q) && QUAL_RF.test(t))) return true
  // generation qualifier: a title-side "New …" / "(20xx reissue)" model is a
  // DIFFERENT product from the unqualified query — "Canonet QL17" must not
  // auto-link the 1969 New Canonet, and a vintage Trioplan must never link a
  // 2015/16 Kickstarter reissue. Condition phrases ("like new", "new in box")
  // and place names ("New York") are not model qualifiers. "reissue" is
  // unconditional; "new" fires only when it qualifies a word the query
  // actually contains — "(New) Sure Shot/AF35M II/Autoboy 2" must stay
  // reachable by an unqualified "Autoboy 2" query.
  const QUAL_NEW = /\b(new|reissue)\b/i
  const qClean = q.replace(/\b(like|brand)[- ]new\b|\bnew\s+(in\s+box|old\s+stock)\b|\bnib\b|\bnos\b/gi, ' ')
  if (QUAL_NEW.test(qClean)) return false
  if (/\breissue\b/i.test(t)) return true
  const tClean = t.replace(/\bnew\s+(york|haven|jersey)\b/gi, ' ')
  const fm = tClean.match(/\bnew\b[\s)/-]*([a-z0-9]+)?/i)
  if (fm) {
    if (!fm[1]) return true // trailing "(new)" qualifies the whole name
    if (new RegExp(`\\b${fm[1]}`, 'i').test(q)) return true
  }
  return false
}

// --- typo tolerance ------------------------------------------------------------
// Seller labels carry real typos ("Canonnet", "Rollieflex", "Targe Brownie").
// Correct query tokens that are UNKNOWN to the catalog vocabulary to their
// nearest known token (bounded Damerau-Levenshtein: ≤1 edit for short words,
// ≤2 for 7+ chars). Corrections only ever ADD a variant — every confidence
// gate (maker conflict, type conflict, nums) still applies to the result.

function dlDist(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  const d = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = 0; i <= a.length; i++) d[i][0] = i
  for (let j = 0; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
      rowMin = Math.min(rowMin, d[i][j])
    }
    if (rowMin > max) return max + 1 // whole row over budget — bail early
  }
  return d[a.length][b.length]
}

function nearestToken(t: string, v: Map<string, number>, max: number, minFreqRatio = 0): string | null {
  const tf = v.get(t) ?? 0
  let best: string | null = null, bestD = max + 1, bestF = 0
  for (const [cand, f] of v) {
    if (cand === t) continue
    if (Math.abs(cand.length - t.length) > max) continue
    if (cand[0] !== t[0] && t.length < 6) continue // short-word typos rarely hit the first letter
    if (minFreqRatio && f < Math.max(50, tf * minFreqRatio)) continue
    const d = dlDist(t, cand, max)
    if (d < bestD || (d === bestD && f > bestF)) { best = cand; bestD = d; bestF = f }
  }
  return bestD <= max ? best : null
}

export function typoFix(query: string, catalog: MatchCatalog): string[] | null {
  const v = catalog.vocab
  const qt = tokens(query)
  const out: string[] = []
  // pass 1: unknown tokens → nearest known token
  let changed = false
  const fixed = qt.map((t) => {
    if (/\d/.test(t) || t.length < 4 || v.has(t)) return t
    const best = nearestToken(t, v, t.length >= 7 ? 2 : 1)
    if (best) { changed = true; return best }
    return t
  })
  if (changed) out.push(fixed.join(' '))
  // pass 2: RARE tokens upgraded to a much more common near-neighbor — a lone
  // "Cannon"-named record must not shield the Cannon→Canon fix.
  // Additive only: the original query still competes.
  let upgraded = false
  const up = qt.map((t) => {
    if (/\d/.test(t) || t.length < 4) return t
    const tf = v.get(t) ?? 0
    if (tf > 3) return t
    const best = nearestToken(t, v, 1, 20)
    if (best) { upgraded = true; return best }
    return t
  })
  if (upgraded) out.push(up.join(' '))
  return out.length ? out : null
}

// --- candidate generation + features -------------------------------------------

export function candidates(
  query: string, catalog: MatchCatalog, kind: Kind | null | undefined, limit = 25,
): { entry: MatchEntry; shared: number }[] {
  const qToks = tokens(query)
  const counts = new Map<number, number>()
  for (const tok of new Set(qToks)) {
    const hits = catalog.tokenIndex.get(tok)
    if (!hits || hits.length > 2000) continue // skip stop-word-like tokens
    for (const i of hits) counts.set(i, (counts.get(i) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([i, n]) => ({ entry: catalog.entries[i], shared: n }))
    .filter((c) => !kind || c.entry.kind === kind)
    .sort((a, b) => b.shared - a.shared || a.entry.norm.length - b.entry.norm.length)
    .slice(0, limit)
}

export function features(query: string, entry: MatchEntry): number[] {
  const qToks = tokens(query), eToks = tokens(entry.title)
  const qDigits = digitSeqs(query), eDigits = digitSeqs(entry.title)
  const qNorm = normalize(query)
  const aliasNorms = entry.aliasNorms
  const bestAliasDice = aliasNorms.length ? Math.max(...aliasNorms.map((a) => dice(qNorm, a))) : 0
  return [
    1, // bias
    dice(qNorm, entry.norm),
    jaccard(qToks, eToks),
    qNorm === entry.norm || aliasNorms.includes(qNorm) ? 1 : 0,
    eToks.length && qToks.includes(eToks[0]) ? 1 : 0, // brand (first title token) present in query
    qDigits.length || eDigits.length ? jaccard(qDigits, eDigits) : 0.5, // model-number agreement
    qNorm.startsWith(entry.norm) || entry.norm.startsWith(qNorm) ? 1 : 0,
    Math.max(dice(qNorm, entry.norm), bestAliasDice),
  ]
}

const sigmoid = (z: number): number => 1 / (1 + Math.exp(-z))
const score = (w: number[], x: number[]): number => sigmoid(x.reduce((s, xi, i) => s + xi * w[i], 0))

// --- matching ------------------------------------------------------------------

/**
 * Sub-queries for a title that names one camera under SEVERAL markets' names.
 *
 * Sellers write "Canon EOS 600D / Rebel T3i", "Minolta Maxxum 7000 (Dynax
 * 7000)", "Olympus Stylus Epic mju-II" — the catalogue holds one record per
 * market, so the combined string overlaps all of them weakly and matches none.
 *
 * Emits the explicit separator splits first, then brand + each 1-3 token window
 * of the tail. Windows are bounded and every candidate keeps the brand, so this
 * cannot wander to another maker.
 */
function marketSplits(query: string): string[] {
  const out = new Set<string>()
  const brand = query.trim().split(/\s+/)[0] ?? ''
  const explicit = query.split(/[/;()|]|\baka\b|\bor\b/i).map((s) => s.trim()).filter((s) => s.length > 2)
  if (explicit.length > 1) {
    for (const e of explicit) out.add(e.toLowerCase().startsWith(brand.toLowerCase()) ? e : `${brand} ${e}`)
  }
  const toks = query.trim().split(/\s+/).filter(Boolean)
  // needs a real tail to be a compound at all; 2 tokens is just "Brand Model"
  if (toks.length >= 4) {
    for (let i = 1; i < toks.length; i++) {
      for (let len = 1; len <= 3 && i + len <= toks.length; len++) {
        const chunk = toks.slice(i, i + len).join(' ')
        if (len > 1 || /\d/.test(chunk)) out.add(`${brand} ${chunk}`)
      }
    }
  }
  out.delete(query)
  return [...out]
}

export function matchOne(
  query: string, catalog: MatchCatalog, kind?: Kind | null, policy?: MatchPolicy | number[],
  depth = 0,
): MatchResult {
  const { weights: w, auto: AUTO_T, review: REVIEW_T } = resolvePolicy(policy)
  // For cameras, also try US/EU/marketing-name aliases + glued-suffix spacing
  // (F3HP→F3 HP, Rebel 2000→EOS 300, Stylus→mju) and keep the best scorer. The
  // original query is always first, so aliasing can only add matches, not lose them.
  const queries = kind === 'lens' ? lensVariants(query) : queryVariants('', query)
  // typo-corrected variant sets: unknown tokens mapped to nearest vocab token,
  // rare tokens upgraded to common near-neighbors — additive candidates only
  const fixedQs = typoFix(query, catalog) ?? []
  for (const fq of fixedQs) queries.push(...(kind === 'lens' ? lensVariants(fq) : queryVariants('', fq)))
  // per-ENTRY max across all variant queries — a variant that rescues the
  // right entry must not be discarded because another variant's LIST peaked
  // higher ("Helios 44-M": the 44M-gluing variant scores Helios-44M well, but
  // the original query's list can top out on the base Helios-44 and win whole).
  const byEntry = new Map<MatchEntry, ScoredEntry>()
  for (const q of queries) {
    for (const c of candidates(q, catalog, kind)) {
      const s = score(w, features(q, c.entry))
      const prev = byEntry.get(c.entry)
      if (!prev || s > prev.s) byEntry.set(c.entry, { entry: c.entry, s })
    }
  }
  let scored = [...byEntry.values()].sort((a, b) => b.s - a.s)
  // specificity tiebreak: among near-top candidates, prefer the one whose token
  // set matches the query most exactly (highest jaccard). Stops a MORE-GENERIC
  // entry from swallowing a subvariant — "Spotmatic F" must not collapse to
  // "Spotmatic" just because the base carries a polluted "Spotmatic F" alias.
  if (scored.length > 1) {
    const qT = tokens(query)
    const top = scored[0].s
    const band = scored.filter((c) => top - c.s <= 0.12)
    if (band.length > 1) band.sort((a, b) => jaccard(qT, tokens(b.entry.title)) - jaccard(qT, tokens(a.entry.title)) || b.s - a.s)
    if (band[0] && band[0] !== scored[0]) scored = [band[0], ...scored.filter((c) => c !== band[0])]
  }
  // RF/SLR + generation qualifier conflict: cap conflicting candidates below
  // the review band so no downstream confidence path can promote them.
  for (const c of scored) if (qualConflict(query, c.entry.title)) c.s = Math.min(c.s, 0.4)
  scored.sort((a, b) => b.s - a.s)
  let best: ScoredEntry | null = scored[0] ?? null
  // same-core override: brand + all model-distinguishing tokens are identical, so
  // this is a confident link even when a filler token (company suffix, "Camera",
  // Polaroid "Land", a duplicated brand word) drags the weighted score below AUTO.
  // sameCore across ALL variants — the original may carry a doubled brand or
  // cruft that a variant already cleaned ("Minolta Minolta-35 Model II")
  const core = scored.filter((c) => !qualConflict(query, c.entry.title) && queries.some((q) => sameCore(q, c.entry.title)))
  if (core.length) {
    core.sort((a, b) => b.s - a.s)
    core[0].s = Math.max(core[0].s, AUTO_T)
    if (!best || core[0].s >= best.s) best = core[0]
  }
  // lens confident rule: identical focal+aperture set AND a shared brand/LINE word
  // AND no conflicting lens-type ⇒ a confident FAMILY match. Generation suffixes
  // (Ai / Ai-S / S.C.) are optically equivalent for enrichment, so ambiguity there
  // shouldn't drop a right match below AUTO; a differing focal OR f-number blocks it.
  // "Shared brand word" must be a REAL maker/line token: generic optics words
  // (auto/MC/zoom/macro…) would let Zuiko link to Topcor and Osawa to Chinar. And
  // two DIFFERENT known makers on the two sides is a hard conflict.
  if (kind === 'lens' && scored.length) {
    const TYPE = /macro|micro|fisheye|soft|shift|tilt|mirror|reflex|zoom/i
    const GENERIC = new Set(['auto', 'mc', 'smc', 'zoom', 'macro', 'micro', 'tele', 'wide', 'af', 'mf', 'ed', 'if', 'os', 'vr', 'is', 'dg', 'di', 'hsm', 'usm', 'ii', 'iii', 'iv', 'new', 'super', 'pro', 'lens', 'compact', 'close', 'focus', 'focusing', 'multi', 'coated'])
    // maker tokens grouped by EQUIVALENCE — Leica≡Leitz, Nikon≡Nikkor,
    // Pentax≡Takumar≡Asahi… a conflict exists only between different GROUPS.
    const MAKER_GROUPS = [['canon'], ['nikon', 'nikkor'], ['minolta', 'rokkor'], ['pentax', 'takumar', 'asahi'], ['olympus', 'zuiko'], ['yashica'], ['konica', 'hexanon'], ['vivitar'], ['tamron'], ['tokina'], ['sigma'], ['soligor'], ['kiron'], ['osawa'], ['chinon'], ['chinar'], ['ricoh'], ['fuji', 'fujica', 'fujinon', 'fujifilm'], ['leica', 'leitz'], ['zeiss'], ['voigtlander'], ['mamiya', 'sekor'], ['topcon', 'topcor'], ['promaster'], ['quantaray'], ['hanimex'], ['makinon'], ['albinar'], ['cosina'], ['samyang'], ['rokinon'], ['kalimar'], ['komine']]
    const MAKER_GROUP = new Map<string, number>()
    MAKER_GROUPS.forEach((g, i) => g.forEach((t) => MAKER_GROUP.set(t, i)))
    const MAKERS = new Set(MAKER_GROUP.keys())
    // number-sets from the original query AND every variant — an inference
    // variant ("Helios 58/2" → "Helios-44 58/2") legitimately ADDS the model
    // number, and the confident rule must see it
    const qNumSets = [...new Set(queries)].map((q) => digitSeqs(q)).filter((s) => s.length >= 2)
    const qCore = new Set(tokens(query).filter((t) => !/^\d/.test(t) && t.length > 1))
    for (const q of queries) for (const t of tokens(q)) if (!/^\d/.test(t) && t.length > 1) qCore.add(t)
    const numsEqual = (cN: string[]): boolean => qNumSets.some((qs) => qs.length === cN.length && qs.every((x) => new Set(cN).has(x)))
    const lensConf = scored.filter((c) => {
      // exclude on the CONFLICT itself, not on raw score — the confident rule
      // exists precisely to promote low-raw-score family matches
      if (qualConflict(query, c.entry.title)) return false
      // a trailing "V" on a lens title is a vintage/version marker, not a
      // numeral — normalize romanizes it to a phantom "5" that would block
      // the family match ("Trioplan 50 mm f/ 2.9 V")
      if (!numsEqual(digitSeqs(c.entry.title.replace(/\s+v$/i, '')))) return false
      const cCore = tokens(c.entry.title).filter((t) => !/^\d/.test(t) && t.length > 1)
      const brandShared = cCore.some((t) => qCore.has(t) && !GENERIC.has(t))
      const qGroups = new Set([...qCore].filter((t) => MAKERS.has(t)).map((t) => MAKER_GROUP.get(t)))
      const cGroups = new Set(cCore.filter((t) => MAKERS.has(t)).map((t) => MAKER_GROUP.get(t)))
      const makerConflict = qGroups.size > 0 && cGroups.size > 0 && ![...qGroups].some((g) => cGroups.has(g))
      const typeConflict = cCore.some((t) => TYPE.test(t) && !qCore.has(t)) || [...qCore].some((t) => TYPE.test(t) && !cCore.includes(t))
      return brandShared && !makerConflict && !typeConflict
    })
    if (lensConf.length) {
      lensConf.sort((a, b) => b.s - a.s)
      lensConf[0].s = Math.max(lensConf[0].s, AUTO_T)
      if (!best || lensConf[0].s >= best.s) best = lensConf[0]
    }
  }
  // exact-alias confident rule: the query IS one of the record's published
  // aliases, character for character after normalization.
  //
  // The scorer alone cannot see this. It compares the query's digits against
  // the record's TITLE, and cross-market names routinely disagree on numbers —
  // "Minolta Freedom Dual C" is the US name of the "Minolta Riva Twin 28", so
  // the exact-alias feature fired at 1 while the missing "28" dragged the total
  // to 0.419, below review. Every market pair whose numbering differs (and the
  // naming tables say that is the normal case: Riva Zoom 70W = Freedom Zoom
  // Explorer 70W = Capios 25) was unreachable by its own published alias.
  //
  // Safe to promote because shipped aliases clear the corroboration rule — a
  // name only reaches the asset when a source or a human attested it. The one
  // real risk is a POLLUTED alias, so the promotion is withheld when the same
  // alias is claimed by more than one record: that is ambiguity, not evidence.
  // Checked against every VARIANT, not just the original query. The variants
  // are the whole point: "Fujifilm Discovery 185 Zoom" is not an alias of
  // anything, but the brand-word variant "Fuji Discovery 185 Zoom" is an exact
  // one — comparing only the raw query left that at 0.503.
  const qns = new Set(queries.map((q) => normalize(q)))
  // qualConflict-capped candidates are excluded here exactly as in the
  // same-core and lens-confident rules above: the cap's contract is that NO
  // downstream confidence path can promote a generation-qualified record for
  // an unqualified query. This path was the one that forgot — after the New
  // Canonet rename (v3.25.0), the record's superseded old title normalized to
  // a plain-name alias and this promotion pushed the capped record to AUTO
  // ("Canonet QL17" auto-linked "Canon New Canonet QL 17").
  const aliasExact = scored.filter((c) => !qualConflict(query, c.entry.title) && c.entry.aliases.some((a) => qns.has(normalize(a))))
  if (aliasExact.length === 1) {
    aliasExact[0].s = Math.max(aliasExact[0].s, AUTO_T)
    if (!best || aliasExact[0].s >= best.s) best = aliasExact[0]
  }
  const runnerUp = scored.find((c) => c !== best)
  // ambiguity guard: two near-identical scores → force review
  const ambiguous = Boolean(best && runnerUp && best.s - runnerUp.s < 0.05 && runnerUp.s > REVIEW_T && !core.length)
  const s = best?.s ?? 0
  const decision: MatchDecision = !best || s < REVIEW_T ? 'no-match' : s >= AUTO_T ? 'auto' : 'review'
  // ── market-compound fallback ──────────────────────────────────────────────
  // Only ever runs when the WHOLE query already failed, so it can add matches
  // and can never change one that already succeeded. Measured on the eBay
  // popularity corpus (1,159 models): recovers 275 of 426 no-matches, taking
  // reachable from 63.2% to 87.0%.
  //
  // A split match is a WEAKER claim than a whole-string one — the part that
  // matched is by construction not the whole title — so it is capped at
  // `review` and never auto-links. `depth` bounds the recursion at one level.
  if (decision === 'no-match' && depth === 0) {
    let alt: MatchResult | null = null
    for (const sub of marketSplits(query)) {
      const r = matchOne(sub, catalog, kind, policy, 1)
      if (r.decision !== 'no-match' && (!alt || (r.best?.s ?? 0) > (alt.best?.s ?? 0))) alt = r
    }
    if (alt?.best) return { best: alt.best, scored: alt.scored, ambiguous: true, decision: 'review' }
  }
  return { best, scored: scored.slice(0, 5), ambiguous, decision }
}

/** Convenience: match many items at once. */
export function matchBatch(
  items: { query: string; kind?: Kind | null }[], catalog: MatchCatalog, policy?: MatchPolicy | number[],
): MatchResult[] {
  return items.map((it) => matchOne(it.query, catalog, it.kind, policy))
}
