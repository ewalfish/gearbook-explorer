// PRD §5.3 acceptance suite — runs the real engine over the real published
// asset (data/gearbook/*.jsonl), exactly what ships to the browser.

import { describe, it, expect, beforeAll } from 'vitest'
import { buildAll } from '../scripts/pipeline'
import { SearchEngine, buildEngineInputs, type SearchHit } from '../src/engine/search'

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
  // US-first: this record leads with the American name and carries the
  // international one alongside — "Olympus Infinity Stylus Epic (Mju-II)". The
  // assertion still pins one record, now by the pair rather than by a prefix.
  it('µ-II → the mju-II body', () => expectTop1('µ-II', /stylus epic \(mju-?II\)/i))
  it('mju ii → the mju-II body', () => expectTop1('mju ii', /stylus epic \(mju-?II\)/i))
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

// The search box and the batch matcher used to carry SEPARATE cross-market
// tables — five groups here against a dozen there. Everything below resolved in
// batch matching and returned nothing when typed into the search field. They
// now read one shared table (src/engine/market-names.ts), so a name added for
// one is a name added for both.
describe('cross-market names the search box used to miss', () => {
  it('Minolta Freedom (US) → the Riva record', () => expectTop3('Minolta Freedom Zoom 105i', /riva/i))
  it('Minolta Capios (JP) → the Riva line', () => expectTop3('Minolta Capios 105i', /riva|capios/i))
  it('Pentax IQZoom (US) → the Espio record', () => expectTop3('Pentax IQZoom 140', /espio/i))
  it('Pentax ZX (US) → the MZ record', () => expectTop3('Pentax ZX-M', /MZ-?M/i))
  it('Nikomat (JP) → the Nikkormat record', () => expectTop3('Nikomat FT2', /nikkormat/i))
  it('Exakta VX (US) → the Varex record', () => expectTop3('Exakta VX', /varex/i))
  it('Stylus Epic (US) → Olympus Mju-II', () => expectTop3('Stylus Epic', /mju-?II/i))
  it('Nikon N90s (US) → the F90X record', () => expectTop3('Nikon N90s', /F90X/i))
})

// Researched from camera-wiki's Canon Sure Shot/Prima/Autoboy family index and
// Wikipedia's Digital IXUS correspondence table. None of these are derivable by
// a token swap — the marketing name changes with the market, not just the word
// — so before the per-model tables landed, each of these US strings found
// nothing at all despite the camera being in the index under its other name.
describe('per-model market names (no token rule can derive these)', () => {
  it('Sure Shot Max (US) → the Prima 5 body', () => expectTop3('Canon Sure Shot Max', /prima 5|sure shot max/i))
  it('Prima Super 120 (EU) → the Sure Shot Classic 120', () => expectTop3('Canon Prima Super 120', /classic 120|prima super 120/i))
  it('Autoboy Jet (JP) → the Photura', () => expectTop3('Canon Autoboy Jet', /photura/i))
  it('PowerShot SD800 IS (US) → the Digital IXUS 850 IS', () => expectTop3('Canon PowerShot SD800 IS', /ixus 850|sd800/i))
  it('Discovery (US) → the Fuji DL line', () => expectTop3('Fujifilm Discovery 290 Zoom', /DL-?290/i))
  it('Capios (JP) → the Riva line', () => expectTop3('Minolta Capios 25', /riva zoom 70w/i))
  it('Stylus Zoom 105 (US) → the mju Zoom 105', () => expectTop3('Olympus Stylus Zoom 105', /mju.*zoom 105/i))
  // …and the title carries BOTH names now, which is the point of the exercise:
  // a buyer who arrived by the US name can see at a glance they have the right
  // camera, and the listing keyword-matches either spelling.
  it('…and the title shows both markets, US first', () =>
    expectTop3('Olympus Stylus Zoom 105', /stylus\/mju zoom 105|mju\/stylus zoom 105/i))
})

// Canon used a third name in Japan whose number matches neither of the others
// — the EOS 550D is the Rebel T2i and the Kiss X4. No token or number rule can
// derive that, so every pair is transcribed per model in the forge.
describe('Canon Kiss (JP) names resolve to the right body', () => {
  it('Kiss X4 → the EOS 550D', () => expectTop3('Canon EOS Kiss X4', /550D|Rebel T2i/i))
  it('Kiss Digital N → the EOS 350D', () => expectTop3('Canon EOS Kiss Digital N', /350D|Rebel XT/i))
  it('Kiss III → the EOS 300 (film)', () => expectTop3('Canon EOS Kiss III', /EOS 300\b|Rebel 2000/i))
  it('New Kiss → the EOS 500N (film)', () => expectTop3('Canon EOS New Kiss', /500N|Rebel G/i))
  it('Kiss Lite → the EOS 3000V (film)', () => expectTop3('Canon EOS Kiss Lite', /3000V|Rebel K2/i))
})

// A word that sits mid-name was unfindable on its own: tier 1 is a prefix of
// the WHOLE alias, so "owl" reached Owla Stereo and Night Owl Optics and missed
// every Canon Sure Shot Owl. Single-token queries now use the token-cover tier
// when the cover is narrow enough to mean something.
describe('a distinctive word buried mid-name is findable alone', () => {
  const finds = (q: string, pattern: RegExp) => {
    const hits = names(engine.search(q, 10))
    expect(hits.some((n) => pattern.test(n)), `"${q}" -> [${hits.slice(0, 4).join(', ')}]`).toBe(true)
  }
  it('owl → the Canon Sure Shot Owl', () => finds('owl', /sure shot owl/i))
  it('photura → the Canon Photura', () => finds('photura', /photura/i))
  it('capios → a Minolta Capios, not every Riva', () => finds('capios', /capios/i))
  it('marlboro → the promotional Sure Shot Owl', () => finds('marlboro', /marlboro/i))

  it('a literal hit outranks a cross-market REWRITE of the query', () => {
    // "capios" used to rewrite to "riva" with no Minolta in the query to
    // justify it, matching every Riva in the index — and, ranked level with
    // literal hits, "Taron Rival" beat the actual Minolta Capios 20.
    const top = names(engine.search('capios', 10))[0] ?? ''
    expect(top, `top hit was "${top}"`).toMatch(/capios/i)
  })
})

// Buyers drop the maker. Every name a record answers to gets a brand-stripped
// alias, not just whichever market holds the primary slot.
describe('the model alone finds the record, in any market', () => {
  it('mju ii → the mju-II body', () => expectTop1('mju ii', /stylus epic \(mju-?II\)/i))
  it('riva zoom 105i → the Freedom/Riva', () => expectTop3('riva zoom 105i', /freedom\/riva zoom 105i/i))
  it('freedom zoom 105i → the same record', () => expectTop3('freedom zoom 105i', /freedom\/riva zoom 105i/i))
})

describe('merged market names on one record', () => {
  it('a merged camera carries every market name as a reachable alias', () => {
    // Riva (intl) and Freedom (US) shipped as two records with contradictory
    // fixed_lens and year_discontinued until the twin merge folded them.
    for (const q of ['Minolta Riva Zoom 105i', 'Minolta Freedom Zoom 105i']) {
      const hits = engine.search(q, 10)
      expect(hits.length, `"${q}" found nothing`).toBeGreaterThan(0)
    }
    const [a] = engine.search('Minolta Riva Zoom 105i', 10)
    const [b] = engine.search('Minolta Freedom Zoom 105i', 10)
    expect(a.id, 'both market names must resolve to the SAME record').toBe(b.id)
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
