// The library's half of the three-checkpoint contract check: what we SHIP must
// match what we PROMISE. The forge gates on this same schema before publishing,
// and a consumer validates the dependency it installed — so a shape change goes
// loud in all three places on the same day.

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  validateAsset, formatValidation, ASSET_CONTRACT, BODY_TYPES, TRAITS,
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
    // 'Asahi Pentax' until v3.14.0 — the brand-hygiene pass folded the whole
    // Asahi/Takumar family to the marketed brand (forge docs/brand-cleanup-2026-07-27.md)
    expect(makerOf('SMC Takumar 50 mm f/ 1.4')).toBe('Pentax')
    expect(makerOf('RE Auto-Topcor 58 mm f/ 1.4')).toBe('Topcon')
    expect(makerOf('Carl Zeiss Jena Werra 1e')).toBe('Carl Zeiss Jena')
  })
})

// ── entity hygiene ──────────────────────────────────────────────────────────
// The scrape harvested encyclopedia INDEX pages as products. "Bronica lenses"
// and a lens simply called "Bronica" were, until this was fixed, the only two
// Bronica "lenses" in the asset. They are not rare: 145 lens records and 23
// camera records were index pages, maker pages, lens DESIGNS ("Cooke triplet"),
// mounts ("DKL-mount") or formats ("Carte de Visite"), most carrying a year —
// the company's founding date — which is what made them look like real rows.
describe('every record is a thing you could own', () => {
  it('ships no encyclopedia index pages', () => {
    const bad = [...cameras, ...lenses].filter((r) => /\b(lenses|cameras|lens mounts?)$/i.test(r.name))
    expect(bad.map((r) => r.name), 'category pages shipped as products').toEqual([])
  })

  it('ships no lens that states nothing about a lens', () => {
    const OPTICS = ['mount', 'focal_length', 'focal_min_mm', 'max_aperture', 'min_aperture', 'filter_size', 'elements_groups', 'min_focus', 'lens_type']
    const bad = lenses.filter((l) => !OPTICS.some((k) => {
      const v = (l.data as Record<string, unknown>)[k]
      return v != null && v !== '' && !(Array.isArray(v) && !v.length)
    }))
    // A bare "Carl Zeiss" or "Bronica" is a short, common string that outranks
    // the real lens when the consumer fuzzy-matches an inventory row.
    expect(bad.slice(0, 8).map((l) => l.name), 'lens records carrying no optical fact').toEqual([])
  })
})

// ── Bronica ─────────────────────────────────────────────────────────────────
// Transcribed by hand because the corpora had the bodies but not one single
// Zenzanon. Five incompatible mounts across the system, which is exactly the
// fact a buyer needs and the fact most likely to be got wrong.
describe('the Bronica system is complete and correctly mounted', () => {
  const bronicaLenses = () => lenses.filter((l) => /^Bronica /.test(String((l.data as { mount?: string }).mount ?? '')))
  const byMount = (m: string) => bronicaLenses().filter((l) => (l.data as { mount?: string }).mount === m)

  it('carries every body from the 1958 Z to the 2000 RF645', () => {
    const names = new Set(cameras.map((c) => c.name))
    for (const body of [
      'Bronica Z', 'Bronica D', 'Bronica C', 'Bronica C2', 'Bronica S', 'Bronica S2', 'Bronica S2A',
      'Bronica EC', 'Bronica EC-TL', 'Bronica EC-TL II',
      'Bronica ETR', 'Bronica ETR-C', 'Bronica ETRS', 'Bronica ETRSi',
      'Bronica SQ', 'Bronica SQ-A', 'Bronica SQ-Am', 'Bronica SQ-Ai', 'Bronica SQ-B',
      'Bronica GS-1', 'Bronica RF645',
    ]) expect(names.has(body), `missing body: ${body}`).toBe(true)
  })

  it('has lenses on all five mounts', () => {
    for (const [mount, atLeast] of [['Bronica S/EC', 25], ['Bronica ETR', 25], ['Bronica SQ', 18], ['Bronica GS-1', 9], ['Bronica RF645', 4]] as const) {
      expect(byMount(mount).length, `${mount} lens count`).toBeGreaterThanOrEqual(atLeast)
    }
  })

  it('keeps the GS-1 off the focal-plane mount', () => {
    // The taxonomy had no GS-1 branch, so the 6×7 body and all nine PG lenses
    // fell through to Bronica S/EC — a mount that physically cannot take them.
    const gs1 = cameras.find((c) => c.name === 'Bronica GS-1')
    expect((gs1?.data as { lens_mount?: string })?.lens_mount).toBe('Bronica GS-1')
    for (const l of byMount('Bronica GS-1')) expect(l.name).toMatch(/Zenzanon-PG/)
  })

  it('does not claim a Bronica shot 35mm', () => {
    // The S2A shipped as format "35mm" while carrying frame_size "6×6 cm".
    for (const c of cameras.filter((c) => /^Bronica (Z|D|C|C2|S|S2|S2A|EC|EC-TL|ETR|SQ|GS-1|RF645)/.test(c.name))) {
      const d = c.data as { format?: string }
      if (d.format) expect(d.format, `${c.name} format`).toBe('120')
    }
  })

  it('finds a lens by the names a seller actually types', () => {
    const byId = new Map([...cameras, ...lenses].map((r) => [r.id, r.name]))
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    const idx = new Map(aliases.map((a) => [norm(a.alias), a.gearbook_id]))
    for (const [query, expected] of [
      ['Zenza Bronica Zenzanon-PE 150mm f/3.5', 'Bronica Zenzanon-PE 150mm f/3.5'],
      ['Zenzanon-PE 150mm f/3.5', 'Bronica Zenzanon-PE 150mm f/3.5'],
      ['Nikkor-P 75mm f/2.8', 'Bronica Nikkor-P 75mm f/2.8'],
      ['Bronica ETR-S', 'Bronica ETRS'],
      ['Bronica Deluxe', 'Bronica D'],
    ] as const) {
      const id = idx.get(norm(query))
      expect(id && byId.get(id), `"${query}" should resolve to ${expected}`).toBe(expected)
    }
  })
})

// ── multi-format bodies ─────────────────────────────────────────────────────
// `format` is one string, so a body that takes more than one film could only
// ever declare one of them. `also_takes` carries the rest without changing what
// `format` means, so nothing downstream had to move.
describe('a body that takes more than one film says so', () => {
  it('keeps also_takes to the declared shape', () => {
    const VIA = new Set(['adapter', 'back', 'insert', 'mask', 'respool'])
    for (const c of cameras) {
      const takes = (c.data as { also_takes?: { format: string; via?: string }[] }).also_takes
      if (!takes) continue
      expect(Array.isArray(takes) && takes.length > 0, `${c.name}`).toBe(true)
      for (const t of takes) {
        expect(t.format, `${c.name} also_takes entry needs a format`).toBeTruthy()
        if (t.via) expect(VIA.has(t.via), `${c.name}: unknown via "${t.via}"`).toBe(true)
        expect(t.format, `${c.name} lists its native format as an extra`).not.toBe((c.data as { format?: string }).format)
      }
    }
  })

  it('says every 620 camera will shoot 120 respooled', () => {
    // 620 is 120 emulsion on a thinner spool — a fact about the film, not a
    // guess about any camera. "620 is discontinued" is what stops these selling.
    const six20 = cameras.filter((c) => (c.data as { format?: string }).format === '620')
    expect(six20.length).toBeGreaterThan(300)
    for (const c of six20) {
      const takes = (c.data as { also_takes?: { format: string; via?: string }[] }).also_takes ?? []
      expect(takes.some((t) => t.format === '120' && t.via === 'respool'), `${c.name}`).toBe(true)
    }
  })

  it('knows the Yashica 635 shoots 35mm with its adapter kit', () => {
    const y = cameras.find((c) => c.name === 'Yashica 635')
    expect((y?.data as { format?: string })?.format, 'native format stays 120').toBe('120')
    const takes = (y?.data as { also_takes?: { format: string; via?: string }[] })?.also_takes ?? []
    expect(takes.find((t) => t.format === '35mm')?.via).toBe('adapter')
  })
})

// ── Hasselblad and Mamiya mounts ────────────────────────────────────────────
// Both brands were collapsed to a single mount each, which asserted that
// physically incompatible glass interchanges.
describe('Hasselblad and Mamiya mounts are not one mount each', () => {
  const mountOf = (r: GearRecord) => String((r.data as { mount?: string; lens_mount?: string }).mount ?? (r.data as { lens_mount?: string }).lens_mount ?? '')

  it('keeps H-system lenses off the V bayonet', () => {
    for (const l of lenses.filter((l) => /^Hasselblad HC /.test(l.name))) {
      expect(mountOf(l), `${l.name}`).toBe('Hasselblad H')
    }
    const h1 = cameras.find((c) => c.name === 'Hasselblad H1')
    expect(mountOf(h1!), 'the H1 is an H-system body').toBe('Hasselblad H')
  })

  it('carries a real V-system lens range', () => {
    const v = lenses.filter((l) => mountOf(l) === 'Hasselblad V')
    expect(v.length, 'V-system lenses').toBeGreaterThanOrEqual(50)
    // one per generation, since a C and a CFi of the same focal are different
    // products at very different prices
    for (const gen of ['C', 'CF', 'CB', 'CFE', 'CFi']) {
      expect(v.some((l) => l.name.endsWith(` ${gen}`)), `no ${gen} lenses`).toBe(true)
    }
  })

  it('does not claim RB and RZ lenses interchange', () => {
    const rz = lenses.filter((l) => mountOf(l) === 'Mamiya RZ67')
    expect(rz.length, 'RZ67 lenses').toBeGreaterThanOrEqual(20)
    for (const l of rz) expect(l.name).toMatch(/Sekor/)
    expect(cameras.find((c) => c.name === 'Mamiya RZ67') && mountOf(cameras.find((c) => c.name === 'Mamiya RZ67')!)).toBe('Mamiya RZ67')
  })
})

// ── the hand-transcribed medium-format systems ──────────────────────────────
// Sourced from period Mamiya/Hasselblad/Zeiss/Schneider literature via a
// page-cited research handoff. The handoff's review queue is deliberately NOT
// incorporated — see the assertions at the end.
describe('the Mamiya and Hasselblad system lines', () => {
  const mountOf = (r: GearRecord) => String((r.data as { mount?: string }).mount ?? '')
  const on = (m: string) => lenses.filter((l) => mountOf(l) === m)

  it('covers every Mamiya system, each on its own mount', () => {
    for (const [mount, atLeast] of [
      ['Mamiya 6', 3], ['Mamiya 7', 6], ['Mamiya Press', 10], ['Mamiya TLR', 8],
      ['Mamiya RB67', 33], ['Mamiya RZ67', 25], ['Mamiya 645', 42], ['Mamiya 645 AF', 24],
    ] as const) {
      expect(on(mount).length, `${mount} lens count`).toBeGreaterThanOrEqual(atLeast)
    }
  })

  it('never puts RB, RZ, 645 manual and 645 AF glass on one mount', () => {
    // Each pair is genuinely incompatible, or compatible only one way.
    const seen = new Set<string>()
    for (const m of ['Mamiya RB67', 'Mamiya RZ67', 'Mamiya 645', 'Mamiya 645 AF']) {
      for (const l of on(m)) {
        expect(seen.has(l.name), `${l.name} appears on two Mamiya mounts`).toBe(false)
        seen.add(l.name)
      }
    }
    // and the generic bucket is gone — "Mamiya" alone said nothing
    expect(on('Mamiya').length, 'lenses left on a generic "Mamiya" mount').toBe(0)
  })

  it('keeps Hasselblad F and FE on the V bayonet, with the generation in the name', () => {
    // They are shutterless lenses for the focal-plane 2000/200 bodies — a body
    // restriction, not a different mount.
    const ff = lenses.filter((l) => /^Hasselblad .*\b(F|FE)$/.test(l.name) || l.name === 'Hasselblad FE 60-120mm f/4.8')
    expect(ff.length, 'F + FE records').toBeGreaterThanOrEqual(15)
    for (const l of ff) expect(mountOf(l), `${l.name}`).toBe('Hasselblad V')
    expect(ff.some((l) => l.name.endsWith(' F')), 'no F lenses').toBe(true)
    expect(ff.some((l) => l.name.endsWith(' FE')), 'no FE lenses').toBe(true)
  })

  it('leaves the review queue out until it is properly sourced', () => {
    const names = new Set(lenses.map((l) => l.name))
    // RB67 NB range: dealer photographs only, no factory master list.
    for (const n of ['Mamiya-Sekor NB 65mm f/4.5', 'Mamiya-Sekor NB 90mm f/3.8', 'Mamiya-Sekor NB 127mm f/3.8']) {
      expect(names.has(n), `${n} was incorporated despite being review-only`).toBe(false)
    }
    // The 80/3.7 TLR graduated from the review queue in v3.23.0: KEH stocks
    // the physical lens in both shutter variants (Seiko {40.5} and Copal {46})
    // and the Williams Photographic black-series list carries it — physical
    // retail stock is primary evidence, not collector history.
    expect([...names].some((n) => /TLR/.test(n) && /f\/3\.7/.test(n)), 'the 80/3.7 TLR should now ship').toBe(true)
    // The C 500/8's element count is contradicted by two factory catalogs
    // (6/5 vs 6/6), so it must stay unset rather than pick a side.
    const c500 = lenses.find((l) => l.name === 'Mamiya Mamiya-Sekor C 500mm f/8')
    if (c500) expect((c500.data as { elements_groups?: string }).elements_groups ?? null).toBeNull()
  })

  it('does not invent production years from catalog print dates', () => {
    // A catalog proves a product was on sale that year, not when it launched.
    for (const l of [...on('Mamiya 6'), ...on('Mamiya 7'), ...on('Mamiya Press'), ...on('Mamiya 645 AF')]) {
      expect((l.data as { year_introduced?: number }).year_introduced ?? null, `${l.name}`).toBeNull()
    }
  })
})

// ── what the 2026-07-26 audit found ─────────────────────────────────────────
// Five defects, each of which shipped silently and none of which any existing
// test could see. The properties below are the ones that were violated, not
// the specific rows that violated them — a spot-check on 37 known names would
// pass again the moment the 38th appeared.
describe('a LENS name never doubles its own brand', () => {
  // "Mamiya Mamiya-Sekor Z 50mm f/4.5 W" — the system brand prefixed onto a
  // line name that already carried it. Ids are a hash of the name, so each of
  // these shipped a wrong PERMANENT id, and 37 of them reached v3.5.0.
  //
  // Lenses only, deliberately. The lens lines are named
  // <system brand> <line> <spec> and the brand appears exactly once, because
  // "Mamiya-Sekor" and "Zenzanon-PE" already carry it. Cameras are named
  // <brand> <model> and 207 of them legitimately repeat the word — the Yashica
  // -Mat really is called the Yashica-Mat, and the Fed-4 the Fed-4. Asserting
  // this over both kinds would be asserting something false about cameras.
  const doubled = (n: string) => /^(\p{L}+)[\s-]+\1[\s-]/iu.test(n)

  it('holds for the identity', () => {
    const bad = lenses.filter((l) => doubled(l.name)).map((l) => l.name)
    expect(bad, `lens names repeating their brand: ${bad.slice(0, 5).join(' · ')}`).toEqual([])
  })

  it('holds for the displayed name too', () => {
    const bad = lenses.filter((l) => doubled(l.recommended_name)).map((l) => l.recommended_name)
    expect(bad, `displayed lens names repeating their brand: ${bad.slice(0, 5).join(' · ')}`).toEqual([])
  })
})

describe('renaming a record never orphans the id it already published', () => {
  it('keeps every superseded Mamiya spelling resolvable', () => {
    // The 37 were renamed AFTER v3.5.0 shipped their ids. A redirect is the
    // only thing standing between an existing link and a dead end.
    const from = redirects.filter((r) => /^Mamiya Mamiya-/.test(String(r.from_name)))
    expect(from.length, 'redirects for the doubled-brand names').toBe(37)
    for (const r of from) expect(String(r.to_name), `${r.from_name}`).not.toMatch(/^Mamiya Mamiya-/)
  })

  it('never redirects a record to itself', () => {
    // A rename that does not move the id needs no redirect, and emitting one
    // makes the source both redirected and live — the contract rejects it.
    const self = redirects.filter((r) => r.from_id === r.to_id).map((r) => String(r.from_name))
    expect(self, `self-redirects: ${self.slice(0, 5).join(' · ')}`).toEqual([])
  })
})

describe('the exposure and film-speed facts reach the asset', () => {
  const val = <T>(c: GearRecord, k: string) => (c.data as Record<string, unknown>)[k] as T | undefined
  const populated = (k: string) => cameras.filter((c) => {
    const v = val<unknown>(c, k)
    return v != null && v !== '' && !(Array.isArray(v) && !v.length)
  })

  it('publishes all four, which the publisher used to drop', () => {
    // They were merged and then omitted from cleanCamera's allowlist, so the
    // count that mattered was zero for every one of them.
    for (const [field, atLeast] of [
      ['exposure_modes', 2900], ['iso_manual_range', 1000], ['dx_coding', 1300], ['dx_range', 250],
    ] as const) {
      expect(populated(field).length, `${field} records`).toBeGreaterThanOrEqual(atLeast)
    }
  })

  it('admits no exposure mode outside the declared vocabulary', () => {
    // The merged data carried scene modes ('landscape'), drive modes ('burst')
    // and flash settings under this field. None of them is an exposure mode.
    // `semi-auto` is match-needle metering: the meter reads and YOU move both
    // aperture and shutter until the needle centres. It is a genuine exposure
    // mode and a synonym of nothing else here — not `manual` (a coupled meter
    // drives the decision) and not a priority or `program` mode (the camera
    // sets neither control). The Praktica LTL/LLC/VLC and the Penti II are the
    // classic cases; 340 records carry it. The forge's schema has always
    // allowed it and this vocabulary never learned it — the "rule written
    // twice" trap, where the forge gate passes while the shipped contract
    // rejects the same asset.
    const allowed = new Set(['manual', 'semi-auto', 'aperture-priority', 'shutter-priority', 'program', 'auto', 'bulb'])
    const bad = new Set<string>()
    for (const c of cameras) for (const m of val<string[]>(c, 'exposure_modes') ?? []) if (!allowed.has(m)) bad.add(m)
    expect([...bad], `out-of-vocabulary exposure modes`).toEqual([])
  })

  it('ships no mojibake in a film-speed range', () => {
    // An en-dash mangled at ingest turns "100-400" into an unreadable range.
    const bad = cameras.filter((c) => ['iso_manual_range', 'dx_range'].some((k) => String(val<string>(c, k) ?? '').includes('�')))
    expect(bad.map((c) => c.name), 'records with U+FFFD in a film-speed range').toEqual([])
  })
})

describe('every principal Mamiya body is reachable from its lenses', () => {
  const camMount = (c: GearRecord) => String((c.data as { lens_mount?: string }).lens_mount ?? '')
  const lensMount = (l: GearRecord) => String((l.data as { mount?: string }).mount ?? '')

  it('gives all sixteen a mount', () => {
    // Eleven of sixteen had none, so the hand-transcribed lens lines resolved
    // from nothing — the data was present and unreachable.
    const bodies = cameras.filter((c) => /^Mamiya (6|7II|7|645|M645|RB ?67|RZ ?67)\b/.test(c.name))
    expect(bodies.length, 'principal Mamiya bodies').toBeGreaterThanOrEqual(16)
    const mountless = bodies.filter((c) => !camMount(c)).map((c) => c.name)
    expect(mountless, `Mamiya bodies with no mount: ${mountless.join(' · ')}`).toEqual([])
  })

  it('points each one at a mount that actually has glass', () => {
    const withGlass = new Set(lenses.map(lensMount).filter(Boolean))
    for (const c of cameras.filter((c) => /^Mamiya (6|7II|7|645|M645|RB ?67|RZ ?67)\b/.test(c.name))) {
      expect(withGlass.has(camMount(c)), `${c.name} → mount "${camMount(c)}" has no lenses`).toBe(true)
    }
  })

  it('does not put a 6×7 frame on 35mm film, or a lens mount on a fixed-lens body', () => {
    const m7ii = cameras.find((c) => c.name === 'Mamiya 7II')
    expect((m7ii!.data as { format?: string }).format, 'Mamiya 7II format').toBe('120')
    const afd = cameras.find((c) => c.name === 'Mamiya 645 AFD')
    expect((afd!.data as { fixed_lens?: unknown }).fixed_lens ?? null, 'the 645 AFD is interchangeable-lens').toBeNull()
  })
})

// ── the type axes ───────────────────────────────────────────────────────────
// `camera_type` collapsed four independent questions into one field, so it
// could not say "folding SLR" and 26 records said `folder` with folding=0.
// body_type answers one question (the finder), traits answer the others, and
// the contract's job is to stop the two from disagreeing the way the old field
// disagreed with itself.
describe('body_type + traits', () => {
  const rec = (data: Record<string, unknown>) => ({
    id: '0123456789abcdef', name: 'X', recommended_name: 'X',
    gearbook_version: '2026-07-28', confidence: 'high', data,
  })
  const check = (data: Record<string, unknown>) =>
    validateAsset({ cameras: [rec(data)], lenses: [], aliases: [] })
  const codes = (data: Record<string, unknown>) => check(data).issues.map((i) => i.code)

  it('accepts a folding rangefinder — the shape the old model could not express', () => {
    const r = check({ body_type: 'rangefinder', traits: ['folding'], folding: 1 })
    expect(r.ok, formatValidation(r, 'folding rangefinder')).toBe(true)
  })

  it('rejects a value outside either vocabulary', () => {
    expect(codes({ body_type: 'folder' })).toContain('body_type.enum')
    expect(codes({ traits: ['instant'] })).toContain('traits.enum')
  })

  it('keeps the finder and the automation on separate axes', () => {
    // An Olympus Mju-II is both: its source NAMES a fixed internal finder, and
    // it is a snapshot camera. While point-and-shoot was a body_type the two
    // competed for one slot and the finder lost on 1,262 records.
    const r = check({ body_type: 'viewfinder', traits: ['point-and-shoot'] })
    expect(r.ok, formatValidation(r, 'mju-ii')).toBe(true)
  })

  it('rejects point-and-shoot as a body_type — it is a trait now', () => {
    expect(codes({ body_type: 'point-and-shoot' })).toContain('body_type.enum')
  })

  it('accepts compact as the finder-less body', () => {
    // A Canon IXUS: composed on a screen, so there is no finder to name.
    const r = check({ body_type: 'compact', traits: ['point-and-shoot'] })
    expect(r.ok, formatValidation(r, 'ixus')).toBe(true)
  })

  it('rejects the deprecated flag disagreeing with the trait', () => {
    // The 26 pre-decomposition rows that said folder + folding=0, in contract form.
    expect(codes({ body_type: 'viewfinder', traits: ['folding'], folding: 0 })).toContain('folding.contradiction')
    expect(codes({ body_type: 'rangefinder', traits: ['stereo'], folding: 1 })).toContain('folding.contradiction')
  })

  it('does not call a not-yet-decomposed record contradictory', () => {
    // `folding: 1` with no traits is the state we are migrating OUT of, on
    // 2,032 shipped records. Flagging it would fail the contract on the very
    // asset it exists to protect.
    expect(check({ camera_type: 'folder', folding: 1 }).ok).toBe(true)
  })

  it('requires traits sorted, unique and non-empty — so an asset diff shows changes, not reordering', () => {
    expect(codes({ traits: ['stereo', 'folding'] })).toContain('traits.unsorted')
    expect(codes({ traits: ['folding', 'folding'], folding: 1 })).toContain('traits.duplicate')
    expect(codes({ traits: [] })).toContain('traits.shape')
  })

  it('keeps the axes off lenses', () => {
    const r = validateAsset({ cameras: [], lenses: [rec({ body_type: 'slr' })], aliases: [] })
    expect(r.issues.map((i) => i.code)).toContain('body_type.on-lens')
  })

  it('treats an absent axis as "not known" rather than a violation', () => {
    // Recovery fills these over several releases; a record without them is
    // incomplete, never invalid. Same convention as every other spec field.
    expect(check({}).ok).toBe(true)
  })

  it('the match engine never reads the type field — which is why this change is safe', () => {
    // camera_type appears in display, the catalog tuple and curated counts, and
    // NOWHERE in matching. That is the whole risk assessment for decomposing
    // it: no score, no candidate, no decision moves. Keep it that way.
    const dir = join(__dirname, '..', 'src', 'engine')
    const offenders = readdirSync(dir)
      .filter((f) => f.endsWith('.ts') && !['schema.ts', 'index.ts'].includes(f))
      .filter((f) => /camera_type|body_type|traits/.test(readFileSync(join(dir, f), 'utf8')))
    expect(offenders, 'matching must not depend on the type axes').toEqual([])
  })

  it('holds on the shipped asset wherever the axes are present', () => {
    // Passes vacuously until the decomposition ships, then guards it for real.
    // This used to call validateAsset on a FILTERED camera list with empty
    // side tables, which can never pass once the asset is real: validateAsset
    // also does CROSS-TABLE integrity, so `aliases: []` reports every
    // market_name as unreachable (859 failures) and real aliases report every
    // alias pointing at a filtered-out camera (23,280). Neither number says
    // anything about the axes. It stayed green only while almost nothing
    // carried market_names.
    //
    // Whole-asset validation already has its own test above ('validates
    // clean'). This one checks the AXES themselves, directly, which is what it
    // always claimed to do.
    const bodyOk = new Set<string>(BODY_TYPES), traitOk = new Set<string>(TRAITS)
    const bad: string[] = []
    for (const c of cameras) {
      const d = c.data as { body_type?: string; traits?: string[] }
      if (d.body_type && !bodyOk.has(d.body_type)) bad.push(`${c.name}: body_type "${d.body_type}"`)
      for (const t of d.traits ?? []) if (!traitOk.has(t)) bad.push(`${c.name}: trait "${t}"`)
    }
    expect(bad, 'out-of-vocabulary type axes').toEqual([])
  })
})

// ── mounts ──────────────────────────────────────────────────────────────────
// A lens is sold in a SET of mounts and it shipped as a comma-joined string, so
// the question this index exists to answer — what fits my camera? — could only
// be asked by equality, and equality hid 908 of the 1,320 lenses that fit a
// Nikon F.
describe('lens mounts', () => {
  it('every multi-mount lens is reachable by each of its mounts', () => {
    // Vacuous until the asset carrying `mounts` is released, then real: the
    // data/gearbook in THIS repo is the published asset, which the forge
    // regenerates and a release copies in.
    const multi = lenses.filter((l) => ((l.data as { mounts?: string[] }).mounts ?? []).length > 1)
    if (!multi.length) return
    const reachable = (m: string) => lenses.filter((l) => ((l.data as { mounts?: string[] }).mounts ?? []).includes(m)).length
    const byEquality = (m: string) => lenses.filter((l) => (l.data as { mount?: string }).mount === m).length
    expect(reachable('Nikon F')).toBeGreaterThan(byEquality('Nikon F'))
  })

  it('no entry is itself a joined list', () => {
    const joined = lenses.filter((l) => ((l.data as { mounts?: string[] }).mounts ?? []).some((m) => m.includes(',')))
    expect(joined.map((l) => l.name)).toEqual([])
  })

  it('the deprecated string is exactly the array joined, on every lens', () => {
    // Derived, not computed alongside — which is what makes them unable to drift.
    const drifted = lenses.filter((l) => {
      const d = l.data as { mounts?: string[]; mount?: string }
      return d.mounts && d.mount !== d.mounts.join(', ')
    })
    expect(drifted.map((l) => l.name)).toEqual([])
  })

  it('keeps mounts off cameras — a body has one lens_mount', () => {
    const wrong = cameras.filter((c) => (c.data as { mounts?: unknown }).mounts !== undefined)
    expect(wrong.map((c) => c.name)).toEqual([])
  })
})
