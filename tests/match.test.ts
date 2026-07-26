// Batch-matcher acceptance suite — runs against the REAL published asset,
// like engine.test.ts. Pins the confidence-gate behaviors that keep wrong
// links out: exact/variant auto-links, typo tolerance, reissue/generation
// qualifier conflicts, subvariant specificity, the lens family rule, and
// transposed-generation refusal.

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { catalogFromJsonl, type MatchCatalog } from '../src/engine/gearbook'
import { matchOne, AUTO } from '../src/engine/match'

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'gearbook')

let catalog: MatchCatalog

beforeAll(() => {
  catalog = catalogFromJsonl({
    camerasJsonl: readFileSync(join(dataDir, 'cameras.jsonl'), 'utf8'),
    lensesJsonl: readFileSync(join(dataDir, 'lenses.jsonl'), 'utf8'),
    aliasesJsonl: readFileSync(join(dataDir, 'aliases.jsonl'), 'utf8'),
  })
})

describe('auto-links (exact and variant-bridged)', () => {
  const cases: [string, 'camera' | 'lens', string][] = [
    ['Canon AE-1 Program', 'camera', 'Canon AE-1 Program'],
    ['Pentax Spotmatic F', 'camera', 'Pentax Spotmatic F'],
    ['Canon G-III QL17', 'camera', 'Canon Canonet G-III QL17'],
    ['Yashica Mat-124G', 'camera', 'Yashica Yashica-Mat 124 G'],
    ['Zeiss Ikon Super Ikonta 532/16', 'camera', 'Super Ikonta 532/16'],
    ['Helios 44-M 58mm f/2', 'lens', 'Helios-44M 58 mm f/ 2'],
    ['Asahi Super-Takumar 50mm f/1.4', 'lens', 'Asahi Super-Takumar 50 mm f/ 1.4'],
    ['Canon FD 50mm f/1.4 S.S.C.', 'lens', 'Canon FD 50 mm f/ 1.4 S.S.C.'],
  ]
  for (const [query, kind, expected] of cases) {
    it(`${query} → ${expected}`, () => {
      const r = matchOne(query, catalog, kind)
      expect(r.decision).toBe('auto')
      expect(r.best?.entry.title).toBe(expected)
    })
  }
})

describe('cross-market names', () => {
  it('Olympus Stylus Epic → the mju-II record', () => {
    const r = matchOne('Olympus Stylus Epic', catalog, 'camera')
    expect(r.decision).toBe('auto')
    // US-first: the surviving record of this merged pair carries the American
    // name. "Mju-II" is still an alias of it, which is what makes the match.
    expect(r.best?.entry.title).toBe('Olympus Infinity Stylus Epic')
  })
})

describe('typo tolerance', () => {
  it('Nikkon F3 → Nikon F3, auto', () => {
    const r = matchOne('Nikkon F3', catalog, 'camera')
    expect(r.decision).toBe('auto')
    expect(r.best?.entry.title).toBe('Nikon F3')
  })
})

describe('lens family rule', () => {
  it('Nikon 50mm f/1.4 (no line name) → a Nikkor 50/1.4, auto', () => {
    const r = matchOne('Nikon 50mm f/1.4', catalog, 'lens')
    expect(r.decision).toBe('auto')
    expect(r.best?.entry.title).toMatch(/Nikkor 50 mm f\/ 1\.4/)
  })
})

describe('generation/reissue qualifier conflicts', () => {
  it('vintage Trioplan 100/2.8 never links the 2015 reissue', () => {
    const r = matchOne('Meyer-Optik Görlitz Trioplan 100mm f/2.8', catalog, 'lens')
    expect(r.decision).toBe('auto')
    expect(r.best?.entry.title).not.toMatch(/reissue/i)
    // any reissue-titled candidate must be capped out of the confidence bands
    for (const c of r.scored) {
      if (/reissue/i.test(c.entry.title)) expect(c.s).toBeLessThan(0.45)
    }
  })

  it('Canonet QL17 never auto-links the New Canonet', () => {
    const r = matchOne('Canonet QL17', catalog, 'camera')
    expect(r.best?.entry.title).not.toMatch(/New Canonet/)
    for (const c of r.scored) {
      if (/New Canonet/.test(c.entry.title)) expect(c.s).toBeLessThan(AUTO)
    }
  })
})

describe('refusals', () => {
  it('transposed generation/type numerals never auto-link (Rolleicord IV Type 2 has no record)', () => {
    const r = matchOne('Rolleicord IV Type 2', catalog, 'camera')
    expect(r.decision).not.toBe('auto')
  })

  it('gibberish → no-match', () => {
    const r = matchOne('zzqx wvut 9917', catalog, 'camera')
    expect(r.decision).toBe('no-match')
  })

  it('empty query → no-match', () => {
    const r = matchOne('', catalog, 'camera')
    expect(r.decision).toBe('no-match')
  })
})
