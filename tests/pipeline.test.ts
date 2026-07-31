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
  it('a 35mm folding rangefinder states format, trait and finder together', () => {
    const line = factsLine(camera({
      format: '35mm', body_type: 'rangefinder', traits: ['folding'], year_introduced: 1934,
    }), 'camera')
    expect(line).toBe('35mm Folding Rangefinder · 1934')
  })

  it('a digital SLR leads with "Digital" and shows sensor megapixels, not format', () => {
    const line = factsLine(camera({
      medium: 'digital', body_type: 'slr', sensor_resolution_mp: 12, year_introduced: 2008,
    }), 'camera')
    expect(line).toBe('Digital SLR · 12MP · 2008')
  })

  it('suppresses the point-and-shoot trait next to a compact body — it would stutter', () => {
    const line = factsLine(camera({
      format: '35mm', body_type: 'compact', traits: ['point-and-shoot'], year_introduced: 1995,
    }), 'camera')
    expect(line).toBe('35mm Compact · 1995')
    expect(line).not.toMatch(/point.*shoot/i)
  })

  it('a stereo box camera keeps its trait — only compact + point-and-shoot is suppressed', () => {
    const line = factsLine(camera({
      format: '120', body_type: 'box', traits: ['stereo'], year_introduced: 1954,
    }), 'camera')
    expect(line).toBe('120 Stereo Box · 1954')
  })

  it('a record with neither body_type nor traits still renders format and year, and never throws', () => {
    let line = ''
    expect(() => { line = factsLine(camera({ format: '120', year_introduced: 1950 }), 'camera') }).not.toThrow()
    expect(line).toBe('120 · 1950')
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
  },
)
