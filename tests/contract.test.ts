// The library's half of the three-checkpoint contract check: what we SHIP must
// match what we PROMISE. The forge gates on this same schema before publishing,
// and a consumer validates the dependency it installed — so a shape change goes
// loud in all three places on the same day.

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  validateAsset, formatValidation, ASSET_CONTRACT,
  names, otherMarketNames, buildRedirectIndex, explain, hazards, hasHazard,
  parseJsonl, type AliasLike, type RedirectLike,
} from '../src/engine/index'
import type { GearRecord } from '../src/types'

const DIR = join(__dirname, '..', 'data', 'gearbook')
const read = <T>(f: string) => parseJsonl<T>(readFileSync(join(DIR, f), 'utf8'))

let cameras: GearRecord[], lenses: GearRecord[], aliases: AliasLike[], redirects: RedirectLike[]
beforeAll(() => {
  cameras = read<GearRecord>('cameras.jsonl')
  lenses = read<GearRecord>('lenses.jsonl')
  aliases = read<AliasLike>('aliases.jsonl')
  redirects = read<RedirectLike>('redirects.jsonl')
})

describe('the shipped asset satisfies its own contract', () => {
  it('validates clean', () => {
    const r = validateAsset({ cameras, lenses, aliases, redirects })
    expect(r.ok, formatValidation(r, 'shipped asset')).toBe(true)
    expect(r.contract).toBe(ASSET_CONTRACT)
  })

  it('every record carries recommended_name — the whole point of shipping it', () => {
    // A field present on 62 of 17,000 rows forces every consumer to write
    // `recommended_name ?? name`. Present on all of them, it is a promise.
    const missing = [...cameras, ...lenses].filter((r) => !r.recommended_name)
    expect(missing.map((r) => r.name).slice(0, 5)).toEqual([])
  })

  it('no alias row still uses the pre-v1 gearbook_slug', () => {
    const legacy = aliases.filter((a) => 'gearbook_slug' in (a as object))
    expect(legacy.length).toBe(0)
  })

  it('a market tag only ever appears on a market alias', () => {
    const mislabelled = aliases.filter((a) => a.market && a.via !== 'market')
    expect(mislabelled.slice(0, 5)).toEqual([])
  })
})

// Findings from an external review (Codex, 2026-07-26). Each of these shipped.
describe('only ATTESTED names are published as facts', () => {
  const marketAliasesOf = (id: string) => aliases.filter((a) => a.gearbook_id === id && a.via === 'market').map((a) => a.alias)

  it('a mechanical line rename never invents a model name', () => {
    // Pentax renamed Espio -> IQZoom across the range, but the Espio 80 was the
    // IQZoom *835* and the 80V the *EZY-80*. Publishing the mechanical rewrite
    // asserted two cameras that never existed AND made the real names
    // unfindable. `systematic` now drives query expansion only.
    for (const name of ['Pentax Espio 80', 'Pentax Espio 80V']) {
      const rec = cameras.find((c) => c.name === name)
      if (!rec) continue
      expect(marketAliasesOf(rec.id), `${name} must not assert an IQZoom name`).toEqual([])
      expect(rec.data.market_names ?? []).toEqual([])
    }
  })

  it('keeps the attested exception and drops the mechanical guess beside it', () => {
    // The Espio 115M IS the IQZoom 115V — a per-model row. It used to ship that
    // correct name AND a fabricated "IQZoom 115M" alongside it.
    const rec = cameras.find((c) => c.name === 'Pentax Espio 115M')
    if (!rec) return
    const al = marketAliasesOf(rec.id)
    expect(al).toContain('Pentax IQZoom 115V')
    expect(al).not.toContain('Pentax IQZoom 115M')
  })

  it('Fuji DL-500 keeps its real US name and not the derived one', () => {
    const rec = cameras.find((c) => c.name === 'Fuji DL-500 Wide Date')
    if (!rec) return
    const al = marketAliasesOf(rec.id)
    expect(al).toContain('Fuji Discovery Mini Dual Date')
    expect(al).not.toContain('Fuji Discovery 500 Wide Date')
  })

  it('no market alias is a multi-name label', () => {
    // "Canon Photura/Epoca/Photura" came from rewriting one side of an
    // already-merged name and leaving the rest.
    const bad = aliases.filter((a) => a.via === 'market' && /[/;]/.test(a.alias))
    expect(bad.map((a) => a.alias).slice(0, 5)).toEqual([])
  })

  it('no lens carries a market alias — cross-market naming is camera-only here', () => {
    const lensIds = new Set(lenses.map((l) => l.id))
    const bad = aliases.filter((a) => a.via === 'market' && lensIds.has(a.gearbook_id))
    expect(bad.map((a) => a.alias)).toEqual([])
  })

  it('redirects are a FUNCTION — one stale id, one destination', () => {
    // "Nikon Nikomat" was absorbed by both the Nikkormat EL and the FT, giving
    // one from_id two targets; every resolver is last-writer-wins, so it picked
    // by emission order.
    const bySource = new Map<string, Set<string>>()
    for (const r of redirects) {
      const k = `${r.gearbook_kind}:${r.from_id}`
      if (!bySource.has(k)) bySource.set(k, new Set())
      bySource.get(k)!.add(r.to_id)
    }
    const ambiguous = [...bySource.entries()].filter(([, t]) => t.size > 1)
    expect(ambiguous.map(([k]) => k)).toEqual([])
  })
})

describe('the displayed name speaks the buyer’s language', () => {
  // The corpus is assembled from French and German catalogues and their
  // spelling survived into the names: the Rolleiflex 2.8F shipped as
  // "Rolleiflex 2,8 F" and a Kodak Model 42 as "Kodak Modèle 42". Neither
  // is what a US buyer types. Normalised for DISPLAY only — `name` keeps the
  // source spelling, so nothing is re-keyed and the original stays searchable.
  it('no displayed name carries a decimal comma', () => {
    const bad = [...cameras, ...lenses].filter((r) => /\d,\d/.test(r.recommended_name))
    expect(bad.map((r) => r.recommended_name).slice(0, 5)).toEqual([])
  })

  it('no displayed name carries an accented French common noun', () => {
    const FR = /(modèle|première|évolution|édition|génération|boîtier)/i
    const bad = [...cameras, ...lenses].filter((r) => FR.test(r.recommended_name))
    expect(bad.map((r) => r.recommended_name).slice(0, 5)).toEqual([])
  })

  it('leaves a MODEL name that merely looks French alone', () => {
    // The Heiland Premiere is a camera. Translating the word produced
    // "Heiland First", which is why only ACCENTED forms are translated.
    const rec = cameras.find((c) => c.name === 'Heiland Premiere')
    if (rec) expect(rec.recommended_name).toBe('Heiland Premiere')
  })

  it('the source spelling stays reachable', () => {
    const rec = cameras.find((c) => /Rolleiflex 2,8 F/.test(c.name))
    if (!rec) return
    expect(rec.recommended_name).toMatch(/2\.8 F/)
    expect(aliases.some((a) => a.gearbook_id === rec.id && a.alias === rec.name)).toBe(true)
  })
})

describe('names()', () => {
  it('answers "what else is this called" for a merged record', () => {
    // US-first: the surviving record of the merged pair is the Freedom, and
    // the label leads with it. The Riva name stays reachable and shown.
    const rec = cameras.find((c) => c.name === 'Minolta Freedom Zoom 105i')!
    const n = names(rec, aliases)
    expect(n.canonical).toBe('Minolta Freedom Zoom 105i')
    expect(n.recommended).toBe('Minolta Freedom/Riva Zoom 105i')
    expect(n.markets.map((m) => m.market)).toContain('intl')
    expect(n.spoken).toContain('Minolta Riva Zoom 105i')
  })

  it('leaves punctuation spellings out of what a person is shown', () => {
    // "Olympus MjuII" is a search key, not another name for the camera —
    // offering it as one reads like a mistake.
    const rec = cameras.find((c) => /^Olympus Infinity Stylus Epic$/.test(c.name))!
    const n = names(rec, aliases)
    const punct = aliases.filter((a) => a.gearbook_id === rec.id && a.via === 'punctuation').map((a) => a.alias)
    for (const p of punct) expect(n.spoken).not.toContain(p)
  })

  it('otherMarketNames excludes the record itself', () => {
    const rec = cameras.find((c) => c.name === 'Minolta Freedom Zoom 105i')!
    expect(otherMarketNames(rec).map((m) => m.name)).toEqual(['Minolta Riva Zoom 105i'])
  })

  it('a camera with one name everywhere has no market noise', () => {
    const plain = cameras.find((c) => !c.data.market_names && c.name === 'Pentax K1000')!
    const n = names(plain, aliases)
    expect(n.recommended).toBe(n.canonical)
    expect(n.markets).toEqual([])
  })
})

// The detail page renders `recommended_name` and an "Also sold as" line built
// from `market_names`. Both must survive into the per-record shards the SPA
// lazy-loads, or the page silently falls back to a single-market name while
// search shows the merged one — which is exactly how a buyer who arrived by
// the US name ends up on a page that never mentions it.
describe('what the detail page needs is actually on the record', () => {
  it('a merged record carries both the label and the market list', () => {
    const rec = cameras.find((c) => c.name === 'Minolta Freedom Zoom 105i')!
    expect(rec.recommended_name).toBe('Minolta Freedom/Riva Zoom 105i')
    expect(rec.data.market_names?.map((m) => m.name)).toContain('Minolta Riva Zoom 105i')
  })

  it('the "also sold as" list is never just the record repeating itself', () => {
    const bad = cameras
      .filter((c) => c.data.market_names?.length)
      .filter((c) => !c.data.market_names!.some((m) => m.name !== c.name))
    expect(bad.map((c) => c.name).slice(0, 5)).toEqual([])
  })

  it('every market entry names a market the UI can label', () => {
    const known = new Set(['us', 'intl', 'eu', 'jp'])
    const bad = cameras.flatMap((c) => (c.data.market_names ?? []).filter((m) => !known.has(m.market)))
    expect(bad.slice(0, 5)).toEqual([])
  })
})

describe('buildRedirectIndex()', () => {
  it('resolves a merged-away id to the record that absorbed it', () => {
    const r = redirects[0]
    const idx = buildRedirectIndex(redirects)
    expect(idx.resolveId(r.from_id, r.gearbook_kind)).toBe(r.to_id)
    expect(idx.isRedirected(r.from_id)).toBe(true)
  })

  it('every redirect lands on a live record — a dangling one is worse than none', () => {
    const live = new Set([...cameras, ...lenses].map((x) => x.id))
    const idx = buildRedirectIndex(redirects)
    const dangling = redirects.filter((r) => !live.has(idx.resolveId(r.from_id, r.gearbook_kind)))
    expect(dangling.map((r) => r.from_name)).toEqual([])
  })

  it('leaves an unknown id alone rather than inventing one', () => {
    const idx = buildRedirectIndex(redirects)
    expect(idx.resolveId('0000000000000000')).toBe('0000000000000000')
  })

  it('breaks a cycle instead of hanging a consumer import', () => {
    const idx = buildRedirectIndex([
      { from_id: 'a'.repeat(16), from_name: 'A', gearbook_kind: 'camera', to_id: 'b'.repeat(16), to_name: 'B' },
      { from_id: 'b'.repeat(16), from_name: 'B', gearbook_kind: 'camera', to_id: 'a'.repeat(16), to_name: 'A' },
    ])
    expect(() => idx.resolveId('a'.repeat(16), 'camera')).not.toThrow()
  })
})

describe('explain()', () => {
  it('names the market when an international string found a US-named record', () => {
    const rec = cameras.find((c) => c.name === 'Minolta Freedom Zoom 105i')!
    const hit = aliases.find((a) => a.gearbook_id === rec.id && a.alias === 'Minolta Riva Zoom 105i')!
    expect(explain(rec, hit).text).toBe('matched “Minolta Riva Zoom 105i” — the international name')
  })

  it('says nothing extra when the match was the shown name', () => {
    const rec = cameras.find((c) => c.name === 'Pentax K1000')!
    const self = aliases.find((a) => a.gearbook_id === rec.id && a.via === 'name')!
    expect(explain(rec, self).matchedAlias).toBeUndefined()
  })
})

describe('hazards()', () => {
  it('flags a discontinued film format', () => {
    const h = hazards({ format: '126' })
    expect(h).toHaveLength(1)
    expect(h[0].kind).toBe('discontinued-film')
    expect(h[0].detail).toMatch(/discontinued in 1999/)
  })

  it('flags a mercury cell and explains why a substitute is not enough', () => {
    const h = hazards({ batteries: ['PX625'] })
    expect(h[0].kind).toBe('mercury-battery')
    expect(h[0].detail).toMatch(/1\.35V/)
  })

  it('says nothing about a 35mm camera on a modern cell', () => {
    expect(hazards({ format: '35mm', batteries: ['LR44'] })).toEqual([])
    expect(hasHazard({ format: '120' })).toBe(false)
  })

  it('120 is in full production and must never be called dead', () => {
    expect(hazards({ format: '120' })).toEqual([])
  })

  it('finds a real, non-trivial number of hazards in the shipped asset', () => {
    const flagged = cameras.filter((c) => hasHazard(c.data))
    expect(flagged.length).toBeGreaterThan(500)
  })
})

// ── manufacturer ────────────────────────────────────────────────────────────
// Upstream derives the maker from the FIRST WORD of the record name, which is
// wrong whenever the name opens with a coating prefix ("SMC Takumar" → SMC), a
// series designation ("RE Auto-Topcor" → RE) or half a two-word company
// ("Carl Zeiss Jena" → Carl). Those shipped as browsable brands. The repair
// reads the real maker off the name and returns nothing when it cannot tell —
// an empty manufacturer is a gap, a wrong one is a lie the facet menu repeats.
describe('manufacturer is a company, not a prefix', () => {
  const makers = () =>
    [...cameras, ...lenses].map((r) => (r.data as { manufacturer?: string }).manufacturer).filter(Boolean) as string[]

  it('never ships a coating or series prefix as a brand', () => {
    // Each of these had records under it before the repair: Carl 181, SMC 116,
    // MC 35, Super 14, Auto 13, Ernst 6, HD 6.
    const PREFIX = /^(smc|shmc|mc|мс|ms|sc|hd|re|auto|super|tele|wide|zoom|macro|multi|new|colou?r|reflex|apo|ed|af|mf)$/i
    const bad = [...new Set(makers().filter((m) => PREFIX.test(m.trim())))]
    expect(bad, `prefix values shipped as manufacturers: ${bad.join(', ')}`).toEqual([])
  })

  it('never ships half of a two-word company as a brand', () => {
    const HALF = /^(carl|ernst|voigt|nippon|aus|au|la|as)$/i
    const bad = [...new Set(makers().filter((m) => HALF.test(m.trim())))]
    expect(bad, `truncated makers shipped as manufacturers: ${bad.join(', ')}`).toEqual([])
  })

  it('never ships a placeholder as a brand', () => {
    const JUNK = /^(nanars|unknown|inconnue?|sans marque|n\/a|-+|\?+)$/i
    const bad = [...new Set(makers().filter((m) => JUNK.test(m.trim())))]
    expect(bad, `placeholder values shipped as manufacturers: ${bad.join(', ')}`).toEqual([])
  })

  it('keeps the short brands that are genuinely real', () => {
    // The tempting general fix — "short values are truncated, expand them" —
    // welded models onto makers and invented 144 brands (Ica Halloh, Fed Fed-4,
    // 3M Disc, KW Praktica). These must survive intact.
    const present = new Set(makers())
    for (const real of ['Ica', 'Zeh', 'Sem', 'KW', '3M', 'FED', 'OIP', 'GAF']) {
      expect(present.has(real), `real short brand "${real}" was mangled away`).toBe(true)
    }
  })

  it('resolves the known prefix cases to their actual maker', () => {
    const all = [...cameras, ...lenses]
    const makerOf = (name: string) =>
      (all.find((r) => r.name === name)?.data as { manufacturer?: string } | undefined)?.manufacturer
    expect(makerOf('SMC Takumar 50 mm f/ 1.4')).toBe('Asahi Pentax')
    expect(makerOf('RE Auto-Topcor 58 mm f/ 1.4')).toBe('Topcon')
    expect(makerOf('Carl Zeiss Jena Werra 1e')).toBe('Carl Zeiss Jena')
  })
})
