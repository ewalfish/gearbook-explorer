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
