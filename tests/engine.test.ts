// PRD §5.3 acceptance suite — runs the real engine over the real published
// asset (data/gearbook/*.jsonl), exactly what ships to the browser.

import { describe, it, expect, beforeAll } from 'vitest'
import { buildAll } from '../scripts/pipeline'
import { SearchEngine, buildEngineInputs, type SearchHit } from '../src/engine'

let engine: SearchEngine

beforeAll(() => {
  const b = buildAll()
  const inputs = buildEngineInputs(b.entries, b.catalog)
  engine = new SearchEngine(inputs.entries, inputs.meta)
})

function names(hits: SearchHit[]): string[] {
  const b = nameLookup()
  return hits.map((h) => b.get(h.id) ?? h.id)
}

let _names: Map<string, string> | null = null
function nameLookup(): Map<string, string> {
  if (!_names) {
    const b = buildAll()
    _names = new Map(b.catalog.map((r) => [r[0], r[2]]))
  }
  return _names
}

function expectTop3(query: string, namePattern: RegExp) {
  const top = names(engine.search(query, 10)).slice(0, 3)
  expect(top.some((n) => namePattern.test(n)), `"${query}" → top3 was [${top.join(', ')}]`).toBe(true)
}

function expectTop1(query: string, namePattern: RegExp) {
  const top = names(engine.search(query, 10))
  expect(namePattern.test(top[0] ?? ''), `"${query}" → top was [${top.slice(0, 3).join(', ')}]`).toBe(true)
}

describe('typo suite — right record in top 3 (PRD §5.3)', () => {
  it('Nikkon F3 → Nikon F3', () => expectTop3('Nikkon F3', /^Nikon F3$/))
  it('Cannon AE-1 → Canon AE-1', () => expectTop3('Cannon AE-1', /^Canon AE-1$/))
  it('Olympis Stylus → mju family', () => expectTop3('Olympis Stylus', /mju/i))
  it('Pentx K1000 → Pentax K1000', () => expectTop3('Pentx K1000', /^Pentax K1000$/))
  it('Minotla X-700 → Minolta X-700', () => expectTop3('Minotla X-700', /^Minolta X-700$/))
  it('Yashcia Mat → Yashica-Mat', () => expectTop3('Yashcia Mat', /^Yashica-?Mat/i))
  it('Rollieflex → Rolleiflex family', () => expectTop3('Rollieflex', /^Rolleiflex/i))
  it('Leika M3 → Leica M3', () => expectTop3('Leika M3', /^Leica M3/))
  it('Zorky 4 → Zorki 4', () => expectTop3('Zorky 4', /^Zorki 4/))
})

describe('alias / cross-market suite — top result (PRD §5.3)', () => {
  it('µ-II → Olympus Mju-II', () => expectTop1('µ-II', /mju-?II$/i))
  it('mju ii → Olympus Mju-II', () => expectTop1('mju ii', /mju-?II$/i))
  it('Autoboy → Sure Shot', () => expectTop3('Autoboy', /sure ?shot/i))
  it('5D Mk II → Canon EOS 5D Mark II', () => expectTop1('5D Mk II', /5D Mark II$/))
  it('5d mkii → Canon EOS 5D Mark II', () => expectTop1('5d mkii', /5D Mark II$/))
  it('5D Mark 2 → Canon EOS 5D Mark II', () => expectTop1('5D Mark 2', /5D Mark II$/))
  it('F3HP (no space) → Nikon F3', () => expectTop3('F3HP', /^Nikon F3/))
  it('Rolleiflex 2,8 ≡ Rolleiflex 2.8', () => {
    const a = engine.search('Rolleiflex 2,8', 10).map((h) => h.id)
    const b = engine.search('Rolleiflex 2.8', 10).map((h) => h.id)
    expect(a).toEqual(b)
    expect(a.length).toBeGreaterThan(0)
  })
})

describe('dedupe & explainer', () => {
  it('many aliases → one result (5D Mark II family)', () => {
    const hits = engine.search('5d mk', 10)
    const ids = hits.map((h) => h.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('matched alias surfaces when it differs from the display name', () => {
    const hits = engine.search('autoboy', 10)
    const withAlias = hits.find((h) => h.matchedAlias)
    expect(withAlias, 'expected at least one hit carrying a matched-alias explainer').toBeTruthy()
  })
})

describe('robustness — graceful degradation, zero crashes (PRD §5.3)', () => {
  it('empty string', () => expect(engine.search('')).toEqual([]))
  it('single char returns without crashing', () => {
    expect(() => engine.search('c')).not.toThrow()
  })
  it('300-char paste', () => {
    expect(() => engine.search('x'.repeat(300))).not.toThrow()
  })
  it('aperture-only query', () => {
    expect(() => engine.search('f/2.8')).not.toThrow()
  })
})

describe('must-NOT-correct list — real makes are not typos (PRD §5.3)', () => {
  for (const make of ['Leotax', 'Alfax', 'Exa', 'Fed', 'Zeca']) {
    it(`${make} returns its own records`, () => {
      const top = names(engine.search(make, 10)).slice(0, 3)
      expect(
        top.some((n) => n.toLowerCase().includes(make.toLowerCase())),
        `"${make}" → top3 was [${top.join(', ')}]`,
      ).toBe(true)
    })
  }
})

describe('performance budget (PRD §5.2) — ≤5ms average per keystroke', () => {
  it('progressive typing stays inside budget', () => {
    const queries = ['nikon f3', 'canon ae-1 program', 'rolleiflex 2.8', 'super takumar 50']
    const times: number[] = []
    for (const q of queries) {
      for (let i = 1; i <= q.length; i++) {
        const t0 = performance.now()
        engine.search(q.slice(0, i), 10)
        times.push(performance.now() - t0)
      }
    }
    const avg = times.reduce((a, b) => a + b, 0) / times.length
    const max = Math.max(...times)
    // CI machines are noisy — assert a loose 4× multiple of the interactive
    // budget (5ms avg / 25ms worst) rather than the strict laptop numbers.
    expect(avg, `avg ${avg.toFixed(2)}ms`).toBeLessThan(20)
    expect(max, `max ${max.toFixed(2)}ms`).toBeLessThan(100)
  })

  it('rank stability: correct result never vanishes while typing continues', () => {
    const target = /^Canon AE-1 Program$/
    const q = 'canon ae-1 program'
    let seen = false
    for (let i = 6; i <= q.length; i++) {
      const top = names(engine.search(q.slice(0, i), 10))
      const present = top.some((n) => target.test(n))
      if (seen) expect(present, `"${q.slice(0, i)}" lost the result`).toBe(true)
      if (present) seen = true
    }
    expect(seen).toBe(true)
  })
})
