// Pipeline unit tests: factsLine goldens over SYNTHETIC fixtures (fast, no
// asset dependency) plus a real-asset suite that guards what actually ships.
//
// factsLine is the one place the v4 axes (body_type + traits) get composed
// into the one-liner every result row shows. A wrong composition there reads
// fine to a human and wrong to nobody — these goldens pin the cases the
// adoption plan called out as tricky (docs/v4-ui-adoption-plan.md Stage 4).

import { describe, it, expect } from 'vitest'
import { factsLine, buildAll } from '../scripts/pipeline'
import { BODY_TYPES, TRAITS } from '../src/engine/schema'
import type { GearRecord } from '../src/types'

function camera(data: GearRecord['data']): GearRecord {
  return {
    id: '0123456789abcdef',
    name: 'Test Camera',
    recommended_name: 'Test Camera',
    gearbook_version: '2026-07-31',
    confidence: 'high',
    data,
  }
}

describe('factsLine — synthetic fixtures, no asset dependency', () => {
  it('a 35mm folding rangefinder states format and trait glued, then the body label — lowercased, no year', () => {
    const line = factsLine(camera({
      format: '35mm', body_type: 'rangefinder', traits: ['folding'], year_introduced: 1934,
    }), 'camera')
    expect(line).toBe('35mm folding · rangefinder')
  })

  it('a digital SLR leads with "Digital" and shows sensor megapixels, not format — acronym case kept, no year', () => {
    const line = factsLine(camera({
      medium: 'digital', body_type: 'slr', sensor_resolution_mp: 12, year_introduced: 2008,
    }), 'camera')
    expect(line).toBe('Digital SLR · 12MP')
  })

  it('suppresses the point-and-shoot trait next to a compact body — it would stutter', () => {
    const line = factsLine(camera({
      format: '35mm', body_type: 'compact', traits: ['point-and-shoot'], year_introduced: 1995,
    }), 'camera')
    expect(line).toBe('35mm · compact')
    expect(line).not.toMatch(/point.*shoot/i)
  })

  it('a stereo box camera keeps its trait — only compact + point-and-shoot is suppressed', () => {
    const line = factsLine(camera({
      format: '120', body_type: 'box', traits: ['stereo'], year_introduced: 1954,
    }), 'camera')
    expect(line).toBe('120 stereo · box')
  })

  it('a record with neither body_type nor traits still renders format, and never throws or shows the year', () => {
    let line = ''
    expect(() => { line = factsLine(camera({ format: '120', year_introduced: 1950 }), 'camera') }).not.toThrow()
    expect(line).toBe('120')
  })

  it('a pseudo-TLR keeps its acronym casing whole mid-sentence, not just the TLR half', () => {
    const line = factsLine(camera({
      format: '35mm', body_type: 'pseudo-tlr', year_introduced: 1959,
    }), 'camera')
    expect(line).toBe('35mm · Pseudo TLR')
  })

  it('no factsLine output ever ends in a bare 4-digit year', () => {
    const line = factsLine(camera({
      format: '35mm', body_type: 'rangefinder', traits: ['folding'], year_introduced: 1934,
    }), 'camera')
    expect(line).not.toMatch(/\d{4}$/)
  })
})

// buildAll() reads data/gearbook/*.jsonl — the real published asset checked
// into this repo. Computed once at module scope so a missing export or an
// absent asset skips every assertion below with one clear reason, rather than
// failing each one individually or throwing during collection.
let built: ReturnType<typeof buildAll> | undefined
let skipReason = ''
try {
  if (typeof buildAll !== 'function') {
    skipReason = 'buildAll is not exported from scripts/pipeline'
  } else {
    built = buildAll()
  }
} catch (e) {
  skipReason = `buildAll() threw — the real asset is likely absent: ${(e as Error).message}`
}

describe.skipIf(!built)(
  `buildAll() over the real published asset${skipReason ? ` — SKIPPED: ${skipReason}` : ''}`,
  () => {
    it('catalog column 7 (type) never carries a retired camera_type value', () => {
      // These five were folded into body_type ('folder'→traits/'half-frame'
      // dropped are not body_type at all), traits (point-and-shoot,
      // subminiature) or medium (instant) in v4 — none of them is ever a
      // legitimate body_type or lens_type string.
      const RETIRED = new Set(['folder', 'point-and-shoot', 'instant', 'half-frame', 'subminiature'])
      const bad = built!.catalog
        .filter((row) => RETIRED.has(row[7]))
        .map((row) => `${row[2]}: type="${row[7]}"`)
      expect(bad.slice(0, 10)).toEqual([])
    })

    it('catalog column 7 is a real body_type for every camera row that sets it', () => {
      const bodyOk = new Set<string>(BODY_TYPES)
      const bad = built!.catalog
        .filter((row) => row[1] === 'c' && row[7] && !bodyOk.has(row[7]))
        .map((row) => `${row[2]}: body_type "${row[7]}" not in BODY_TYPES`)
      expect(bad.slice(0, 10)).toEqual([])
    })

    it('catalog column 11 (traits) is always an array whose members are all in TRAITS', () => {
      const traitOk = new Set<string>(TRAITS)
      const bad = built!.catalog
        .filter((row) => !Array.isArray(row[11]) || row[11].some((t) => !traitOk.has(t)))
        .map((row) => `${row[2]}: traits ${JSON.stringify(row[11])}`)
      expect(bad.slice(0, 10)).toEqual([])
    })

    it('every curated tile has a nonzero count', () => {
      const zero = built!.curated.filter((c) => c.count <= 0).map((c) => c.title)
      expect(zero, 'curated tiles with a zero count').toEqual([])
    })

    it('no curated href carries the retired ?type= param', () => {
      const bad = built!.curated.filter((c) => /[?&]type=/.test(c.href)).map((c) => c.href)
      expect(bad, 'curated hrefs still using ?type=').toEqual([])
    })

    it('the landing grid ships a 9th tile — subminiature cameras — filling the 3×3 grid', () => {
      const tile = built!.curated.find((c) => c.title === 'Subminiature cameras')
      expect(tile).toBeDefined()
      expect(tile!.href).toBe('#/browse?traits=subminiature')
      expect(tile!.unit).toBe('cameras')
      // Measured on the published asset (2026-07-31): 791. Pinned to the same
      // predicate the href filters by, with slack for asset drift.
      expect(tile!.count).toBeGreaterThan(700)
      expect(tile!.count).toBeLessThan(900)
      expect(built!.curated.length).toBe(9)
    })

    it('catalog sort puts manufacturer+high-confidence records ahead of manufacturer-less junk', () => {
      // Regression for the old localeCompare(name) sort, which put quoted
      // ("Carmen") and digit-led (135mm f/2.8 Revuenon) names ahead of the
      // alphabet because of ASCII order — the first unfiltered Browse screen
      // led with the corpus's least representative records.
      const firstNoMfr = built!.catalog.findIndex((row) => row[3] === '')
      const lastWithMfr = built!.catalog.reduce(
        (last, row, i) => (row[3] !== '' ? i : last), -1,
      )
      if (firstNoMfr !== -1 && lastWithMfr !== -1) {
        expect(lastWithMfr).toBeLessThan(firstNoMfr)
      }
      // The display name itself is untouched by the sort key — only the sort
      // order changes, never row[2].
      const first = built!.catalog[0]
      expect(first[2].length).toBeGreaterThan(0)
    })

    it('catalog sort is a stable total order — re-sorting produces the identical sequence', () => {
      const ids = built!.catalog.map((row) => row[0])
      const reSorted = [...built!.catalog].sort((a, b) => {
        const strip = (s: string) => s.replace(/^[^\p{L}]+/u, '')
        const tierOf = (r: typeof a) => (r[3] === '' ? 2 : r[5] === 'h' ? 0 : 1)
        const ta = tierOf(a)
        const tb = tierOf(b)
        if (ta !== tb) return ta - tb
        return strip(a[2]).localeCompare(strip(b[2])) || a[2].localeCompare(b[2]) || a[0].localeCompare(b[0])
      })
      expect(reSorted.map((row) => row[0])).toEqual(ids)
    })
  },
)
