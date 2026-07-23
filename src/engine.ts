// Fuzzy search engine — PRD §5. Architecture: alias-prefix-primary,
// per-token typo correction secondary (§5.1). Corrections generate ADDITIVE
// candidate queries and never outrank literal matches (§5.5).

import { normalize, tokenize, queryVariants } from './normalize'
import type { Kind } from './types'

export interface IndexEntry {
  n: string //  normalized alias
  k: Kind
  id: string // record id
  d: string //  original alias display text ('' when it equals the record name)
}

export interface RecordMeta {
  name: string
  confidence: 'h' | 'm' | 'l'
}

export interface SearchHit {
  id: string
  kind: Kind
  /** Alias text to show in the "matched → name" explainer, or null when the
   *  match was on the display name itself. */
  matchedAlias: string | null
  corrected: boolean
}

// Match-quality tiers (§5.5). Corrected matches sit strictly below all
// literal tiers via the +10 offset.
const TIER_EXACT = 0
const TIER_PREFIX = 1
const TIER_TOKENS = 2
const CORRECTED_OFFSET = 10

const CONF_RANK: Record<string, number> = { h: 0, m: 1, l: 2 }
const MAX_RANGE_SCAN = 6000
const MAX_QUERY_TOKENS = 8
const MAX_QUERY_LEN = 80

interface Candidate {
  entry: IndexEntry
  tier: number
  sourceLabel: string | null
}

export class SearchEngine {
  private entries: IndexEntry[] = []
  /** Vocab of alias tokens, sorted, with postings into `entries`. */
  private vocab: string[] = []
  private postings = new Map<string, number[]>()
  /** first letter + length buckets bound the edit-distance scan (§5.2). */
  private buckets = new Map<string, string[]>()

  constructor(entries: IndexEntry[], private meta: Map<string, RecordMeta>) {
    this.entries = [...entries].sort((a, b) => (a.n < b.n ? -1 : a.n > b.n ? 1 : 0))
    for (let i = 0; i < this.entries.length; i++) {
      for (const tok of new Set(this.entries[i].n.split(' '))) {
        let list = this.postings.get(tok)
        if (!list) {
          list = []
          this.postings.set(tok, list)
        }
        list.push(i)
      }
    }
    this.vocab = [...this.postings.keys()].sort()
    for (const tok of this.vocab) {
      const key = tok[0] + tok.length
      let b = this.buckets.get(key)
      if (!b) {
        b = []
        this.buckets.set(key, b)
      }
      b.push(tok)
    }
  }

  search(raw: string, limit = 10): SearchHit[] {
    if (raw.length > MAX_QUERY_LEN) raw = raw.slice(0, MAX_QUERY_LEN)
    const tokens = tokenize(raw)
    if (tokens.length === 0 || tokens.length > MAX_QUERY_TOKENS) return []

    const candidates: Candidate[] = []
    const variants = queryVariants(tokens)
    for (const v of variants) {
      this.collect(v.tokens, v.sourceLabel, 0, candidates)
    }

    // Typo-correction pass — only when the literal + market-name layers came
    // up short (§5.1: "when a token finds no/few prefix hits").
    const literalRecords = new Set(candidates.map((c) => c.entry.id))
    if (literalRecords.size < 3) {
      for (const corrected of this.correctedQueries(tokens, literalRecords.size > 0)) {
        for (const v of queryVariants(corrected)) {
          this.collect(v.tokens, v.sourceLabel, CORRECTED_OFFSET, candidates)
        }
      }
    }

    // Dedupe by record (many aliases → one result), keep the best candidate.
    const best = new Map<string, Candidate>()
    for (const c of candidates) {
      const prev = best.get(c.entry.id)
      if (!prev || this.compare(c, prev) < 0) best.set(c.entry.id, c)
    }

    const ranked = [...best.values()].sort((a, b) => this.compare(a, b))
    return ranked.slice(0, limit).map((c) => {
      const name = this.meta.get(c.entry.id)?.name ?? ''
      const aliasText = c.sourceLabel ?? (c.entry.d || null)
      return {
        id: c.entry.id,
        kind: c.entry.k,
        matchedAlias: aliasText && aliasText.toLowerCase() !== name.toLowerCase() ? aliasText : null,
        corrected: c.tier >= CORRECTED_OFFSET,
      }
    })
  }

  /** §5.5 ordering: tier, shorter alias first, confidence, cameras before lenses, name. */
  private compare(a: Candidate, b: Candidate): number {
    if (a.tier !== b.tier) return a.tier - b.tier
    if (a.entry.n.length !== b.entry.n.length) return a.entry.n.length - b.entry.n.length
    const ma = this.meta.get(a.entry.id)
    const mb = this.meta.get(b.entry.id)
    const ca = CONF_RANK[ma?.confidence ?? 'm']
    const cb = CONF_RANK[mb?.confidence ?? 'm']
    if (ca !== cb) return ca - cb
    if (a.entry.k !== b.entry.k) return a.entry.k === 'camera' ? -1 : 1
    return (ma?.name ?? '').localeCompare(mb?.name ?? '')
  }

  private collect(
    tokens: string[], sourceLabel: string | null, tierOffset: number, out: Candidate[],
  ): void {
    const q = tokens.join(' ')

    // Tier 0/1: whole-query prefix over the sorted normalized aliases.
    // Stable under typing — results only refine, never flicker (§5.1).
    const lo = this.lowerBound(q)
    let scanned = 0
    for (let i = lo; i < this.entries.length && scanned < MAX_RANGE_SCAN; i++, scanned++) {
      const e = this.entries[i]
      if (!e.n.startsWith(q)) break
      out.push({
        entry: e,
        tier: tierOffset + (e.n === q ? TIER_EXACT : TIER_PREFIX),
        sourceLabel,
      })
    }

    // Tier 2: order-free token cover — every query token prefix-matches some
    // alias token ("5cm f/2 Nikkor" → "Nikkor 50mm f/2"). Only meaningful for
    // multi-token queries; single tokens are already covered by tier 1.
    if (tokens.length < 2) return
    let acc: Set<number> | null = null
    for (const tok of tokens) {
      const matches = this.entriesWithTokenPrefix(tok)
      if (matches === null) return // token matches nothing — no cover possible
      acc = acc === null ? matches : intersect(acc, matches)
      if (acc.size === 0) return
    }
    if (!acc) return
    for (const idx of acc) {
      const e = this.entries[idx]
      if (e.n.startsWith(q)) continue // already counted in tier 0/1
      out.push({ entry: e, tier: tierOffset + TIER_TOKENS, sourceLabel })
    }
  }

  /** Entry indices whose alias contains a token starting with `tok`. */
  private entriesWithTokenPrefix(tok: string): Set<number> | null {
    const out = new Set<number>()
    const lo = lowerBoundArr(this.vocab, tok)
    for (let i = lo; i < this.vocab.length; i++) {
      const v = this.vocab[i]
      if (!v.startsWith(tok)) break
      for (const idx of this.postings.get(v)!) {
        out.add(idx)
        if (out.size > 30000) return out // extremely broad token; cap the union
      }
    }
    return out.size ? out : null
  }

  /** Per-token bounded Damerau-Levenshtein corrections (§5.1 rule 2):
   *  ≤1 edit for tokens <7 chars, ≤2 for 7+; first letter pinned for <6. */
  private correctedQueries(tokens: string[], hadLiteralHits: boolean): string[][] {
    const out: string[][] = []
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i]
      if (tok.length < 3 || /^\d+$/.test(tok)) continue
      // A token that already prefix-matches vocabulary is probably right —
      // but only trust that when the query as a whole found something.
      // ("Cannon AE-1": "cannon" IS a vocab token via the Wonder Photo Cannon,
      // yet the query has zero hits and canon← correction must still fire.)
      if (hadLiteralHits && this.hasVocabPrefix(tok)) continue
      const maxDist = tok.length < 7 ? 1 : 2
      const pinFirst = tok.length < 6
      const cands: { tok: string; dist: number }[] = []
      const firstLetters = pinFirst ? [tok[0]] : alphabetAround(tok[0])
      for (const first of firstLetters) {
        for (let len = tok.length - maxDist; len <= tok.length + maxDist; len++) {
          if (len < 2) continue
          const bucket = this.buckets.get(first + len)
          if (!bucket) continue
          for (const v of bucket) {
            const d = damerauBounded(tok, v, maxDist)
            if (d > 0 && d <= maxDist) cands.push({ tok: v, dist: d })
          }
        }
      }
      cands.sort((a, b) => a.dist - b.dist)
      for (const c of cands.slice(0, 4)) {
        out.push([...tokens.slice(0, i), c.tok, ...tokens.slice(i + 1)])
      }
    }
    return out
  }

  private hasVocabPrefix(tok: string): boolean {
    const lo = lowerBoundArr(this.vocab, tok)
    return lo < this.vocab.length && this.vocab[lo].startsWith(tok)
  }

  private lowerBound(q: string): number {
    let lo = 0
    let hi = this.entries.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (this.entries[mid].n < q) lo = mid + 1
      else hi = mid
    }
    return lo
  }
}

function lowerBoundArr(arr: string[], q: string): number {
  let lo = 0
  let hi = arr.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (arr[mid] < q) lo = mid + 1
    else hi = mid
  }
  return lo
}

function intersect(a: Set<number>, b: Set<number>): Set<number> {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a]
  const out = new Set<number>()
  for (const x of small) if (large.has(x)) out.add(x)
  return out
}

/** First-letter neighborhood when the pin is off (7+ char tokens): the first
 *  letter can itself be the typo, so allow any first letter — the length
 *  bucketing still bounds the scan. */
function alphabetAround(_c: string): string[] {
  return 'abcdefghijklmnopqrstuvwxyz0123456789'.split('')
}

/** Bounded optimal-string-alignment (Damerau-Levenshtein with adjacent
 *  transposition), early-exit when the running minimum exceeds `max`. */
export function damerauBounded(a: string, b: string, max: number): number {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > max) return max + 1
  const la = a.length
  const lb = b.length
  let prev2: number[] = []
  let prev: number[] = Array.from({ length: lb + 1 }, (_, j) => j)
  for (let i = 1; i <= la; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prev2[j - 2] + 1)
      }
      cur.push(v)
      if (v < rowMin) rowMin = v
    }
    if (rowMin > max) return max + 1
    prev2 = prev
    prev = cur
  }
  return prev[lb]
}

/** Build engine inputs from the published index + catalog files. */
export function buildEngineInputs(
  entries: [string, 'c' | 'l', string, string][],
  catalogRows: [string, 'c' | 'l', string, ...unknown[]][],
  confidences?: Map<string, 'h' | 'm' | 'l'>,
): { entries: IndexEntry[]; meta: Map<string, RecordMeta> } {
  const meta = new Map<string, RecordMeta>()
  for (const row of catalogRows) {
    meta.set(row[0], {
      name: row[2],
      confidence: confidences?.get(row[0]) ?? ((row as unknown[])[5] as 'h' | 'm' | 'l' ?? 'm'),
    })
  }
  return {
    entries: entries.map(([n, k, id, d]) => ({ n, k: k === 'c' ? 'camera' : 'lens', id, d })),
    meta,
  }
}

export { normalize }
