// The single source of truth for cross-market naming.
//
// The same camera was sold under different names in different markets: Minolta
// compacts are Riva (intl) / Freedom (US) / Capios (JP); Pentax's are Espio
// (intl) / IQZoom (US); Canon SLRs are EOS (intl) / Rebel (US) / Kiss (JP).
// Sellers type the US name; the gearbook is mostly internationally named.
//
// This table used to exist twice — once in variants.ts for the batch matcher
// and once, much smaller, as REWRITE_GROUPS in normalize.ts for the search box.
// The search copy was missing Freedom/Riva/Capios, ZX/MZ, Nikkormat/Nikomat and
// VX/Varex entirely, so the matcher could bridge `Freedom → Riva` and typing
// the same thing into the search field found nothing. Both now read this file.
//
// It mirrors `market-names.mjs` in the forge, which is what materializes these
// names into the shipped asset. Keep the two in step: a name added here should
// be added there so it ships as an alias, not just as a query-time guess.

/** Which market a name belongs to. `intl` = one export name for everywhere-but-US. */
export type Market = 'us' | 'intl' | 'eu' | 'jp'

/** One market's name for a camera, as carried on a gearbook record. */
export interface MarketName {
  name: string
  market: Market
  /** Exactly one entry per record is primary, and its `name` equals `record.name`. */
  primary?: boolean
}

/** Preference order when picking a primary name or ordering a merged label. */
export const MARKET_ORDER: Market[] = ['intl', 'us', 'eu', 'jp']

/**
 * Brand-scoped TOKEN groups: within this brand these words denote the SAME
 * series across markets and the model number is preserved (ZX-5 ⇄ MZ-5).
 */
export const MARKET_TOKENS: Record<string, Partial<Record<Market, string>>[]> = {
  minolta: [
    { us: 'freedom', intl: 'riva', jp: 'capios' },
    { us: 'maxxum', eu: 'dynax', jp: 'alpha' },
  ],
  pentax: [
    { us: 'iqzoom', intl: 'espio' },
    { us: 'zx', intl: 'mz' },
  ],
  olympus: [{ us: 'stylus', intl: 'mju' }],
  // Nikkormat was the export name, Nikomat the Japanese domestic one.
  nikon: [{ intl: 'nikkormat', jp: 'nikomat' }],
  canon: [{ us: 'sure shot', eu: 'prima', jp: 'autoboy' }],
  // VX was the US name for the Varex — a trademark dispute, not a spec change.
  exakta: [{ us: 'vx', intl: 'varex' }],
  ihagee: [{ us: 'vx', intl: 'varex' }],
  samsung: [{ us: 'maxima', intl: 'af zoom', eu: 'vega' }],
  ricoh: [{ us: 'kr', intl: 'xr' }],
}

/**
 * Brand-scoped whole-MODEL groups — the model number itself differs across
 * markets, so no token rule can derive them.
 *
 * ── WHY THE BIG PER-MODEL TABLES ARE NOT HERE ───────────────────────────────
 * The forge carries ~130 further pairs transcribed from camera-wiki's Canon
 * Sure Shot/Prima/Autoboy index and Wikipedia's Digital IXUS correspondence
 * table (Sure Shot Max = Prima 5 = Autoboy Mini; IXUS 285 HS = ELPH 360 HS).
 * Those reach this app as shipped ALIAS ROWS, which the search index already
 * ingests — so the names are findable here with no query rewriting at all.
 *
 * Duplicating them as query-side rewrites would only crowd the 24-variant
 * budget in variants.ts, whose applyMap has no longest-match rule and would
 * emit the shorter model's foreign name alongside the right one. Keep this
 * table to pairs that help a PARTIAL or misspelled query, where no exact alias
 * can match.
 */
export const MARKET_MODELS: Record<string, Partial<Record<Market, string>>[]> = {
  nikon: [
    { us: 'n50', intl: 'f50' }, { us: 'n55', intl: 'f55' }, { us: 'n60', intl: 'f60' },
    { us: 'n65', intl: 'f65' }, { us: 'n70', intl: 'f70' }, { us: 'n75', intl: 'f75' },
    { us: 'n80', intl: 'f80' }, { us: 'n90', intl: 'f90' }, { us: 'n90s', intl: 'f90x' },
    { us: 'n2000', intl: 'f301' }, { us: 'n2020', intl: 'f501' },
    { us: 'n4004', intl: 'f401' }, { us: 'n4004s', intl: 'f401s' }, { us: 'n5005', intl: 'f401x' },
    { us: 'n6000', intl: 'f601m' }, { us: 'n6006', intl: 'f601' },
    { us: 'n8008', intl: 'f801' }, { us: 'n8008s', intl: 'f801s' },
  ],
  canon: [
    { us: 'rebel 2000', intl: 'eos 300' }, { us: 'rebel ti', intl: 'eos 300v' },
    { us: 'rebel t2', intl: 'eos 300x' }, { us: 'rebel k2', intl: 'eos 3000v' },
    { us: 'rebel g', intl: 'eos 500n' }, { us: 'rebel gii', intl: 'eos 500n' },
    { us: 'rebel x', intl: 'eos 500' }, { us: 'rebel s', intl: 'eos 1000f' },
    { us: 'rebel sii', intl: 'eos 1000fn' }, { us: 'rebel ii', intl: 'eos 1000fn' },
    { us: 'elan', intl: 'eos 100' }, { us: 'elan ii', intl: 'eos 50' },
    { us: 'elan iie', intl: 'eos 50e' }, { us: 'elan 7', intl: 'eos 30' },
    { us: 'elan 7e', intl: 'eos 30' }, { us: 'elan 7n', intl: 'eos 30v' },
    { us: 'elan 7ne', intl: 'eos 30v' }, { us: 'a2', intl: 'eos 5' }, { us: 'a2e', intl: 'eos 5' },
    { us: 'digital rebel', intl: 'eos 300d' }, { us: 'rebel xt', intl: 'eos 350d' },
    { us: 'rebel xti', intl: 'eos 400d' }, { us: 'rebel xsi', intl: 'eos 450d' },
    { us: 'rebel t1i', intl: 'eos 500d' }, { us: 'rebel t2i', intl: 'eos 550d' },
    { us: 'rebel t3i', intl: 'eos 600d' }, { us: 'rebel t3', intl: 'eos 1100d' },
    { us: 'rebel t4i', intl: 'eos 650d' }, { us: 'rebel t5i', intl: 'eos 700d' },
    { us: 'rebel t5', intl: 'eos 1200d' }, { us: 'rebel sl1', intl: 'eos 100d' },
    { us: 'rebel t6', intl: 'eos 1300d' }, { us: 'rebel t6i', intl: 'eos 750d' },
    { us: 'rebel t6s', intl: 'eos 760d' }, { us: 'rebel t7', intl: 'eos 2000d' },
    { us: 'rebel t7i', intl: 'eos 800d' }, { us: 'rebel sl2', intl: 'eos 200d' },
    { us: 'rebel sl3', intl: 'eos 250d' },
  ],
  minolta: [
    { us: 'x-570', intl: 'x-500' }, { us: 'x-370', intl: 'x-300' }, { us: 'x-370s', intl: 'x-300s' },
    { us: 'xd-11', intl: 'xd-7' }, { us: 'xe-7', intl: 'xe-1' },
    { us: 'xg-7', intl: 'xg-2' }, { us: 'xg-9', intl: 'xg-s' },
    { us: 'srt-102', intl: 'srt-303' }, { us: 'srt-202', intl: 'srt-303' },
    { us: 'srt-201', intl: 'srt-101b' },
    { us: 'maxxum 7000', jp: 'alpha 7000' }, { us: 'maxxum 9000', jp: 'alpha 9000' },
    // Riva/Freedom/Capios is not a clean token swap: the US name gains words
    // and the JP number is unrelated (Riva Zoom 70W = Freedom Zoom Explorer 70W
    // = Capios 25), so the token group alone mislabels most of the line.
    { intl: 'riva zoom 70w', us: 'freedom zoom explorer 70w', jp: 'capios 25' },
    { intl: 'riva zoom 75w', us: 'freedom zoom explorer ex', jp: 'capios 75' },
    { intl: 'riva zoom 140ex', us: 'freedom zoom 140ex', jp: 'capios 140' },
    { intl: 'riva zoom 150', us: 'freedom zoom 150', jp: 'capios 150' },
    { intl: 'riva zoom 125', us: 'freedom zoom 125', jp: 'capios 125s' },
  ],
  pentax: [
    { us: 'super program', intl: 'super a' },
    { us: 'program plus', intl: 'program a' },
    // Espio/IQZoom usually shares its number — these are the documented
    // exceptions the token rule gets wrong
    { us: 'iqzoom 70xl', intl: 'espio af zoom' },
    { us: 'iqzoom 115v', intl: 'espio 115m' },
  ],
  yashica: [
    { us: 'sensation zoom', intl: 'microtec zoom' },
    { us: 'imagination micro', intl: 'micro elite' },
  ],
  // The mju line's US names are not a token swap — the generation designation
  // itself changes (mju II is the Stylus EPIC, not a "Stylus II").
  olympus: [
    { intl: 'mju-ii', us: 'stylus epic' },
    { intl: 'mju-ii', us: 'infinity stylus epic' },
    { intl: 'mju-i', us: 'infinity stylus' },
    // zoom bodies keep their number, generation bodies do not — so the line is
    // not systematic and each pair is listed
    { intl: 'mju zoom 105', us: 'stylus zoom 105' },
    { intl: 'mju zoom 115', us: 'stylus zoom 115' },
    { intl: 'mju-ii 170', us: 'stylus epic zoom 170' },
    { intl: 'mju-iii wide 100', us: 'stylus 100 wide' },
  ],
  // Fuji's DL line is the US Discovery line, number preserved. Listed here so a
  // partial query ("discovery 290") still reaches the DL record when the user
  // has not typed enough for the exact alias to hit.
  fuji: [{ intl: 'dl', us: 'discovery' }],
}

/**
 * Every market group as a flat list of interchangeable spellings, brand
 * dropped. This is the form the free-text search box wants: it has no brand
 * context when the user has typed three characters, so it rewrites on the
 * token alone and lets scoring sort out the rest.
 */
export function marketSynonymGroups(): string[][] {
  const groups: string[][] = []
  for (const table of [MARKET_TOKENS, MARKET_MODELS]) {
    for (const brandGroups of Object.values(table)) {
      for (const g of brandGroups) {
        const names = Object.values(g).filter(Boolean) as string[]
        if (names.length > 1) groups.push(names.map((n) => n.replace(/-/g, ' ')))
      }
    }
  }
  return groups
}

/** The market groups for one brand, as ordered token pairs (both directions). */
export function marketTokenSwaps(brand: string): [string, string][] {
  const out: [string, string][] = []
  for (const g of MARKET_TOKENS[brand] ?? []) {
    const names = Object.values(g).filter(Boolean) as string[]
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) out.push([names[i], names[j]])
    }
  }
  return out
}

/**
 * The whole-model market maps for one brand, as `from -> to` (both directions).
 *
 * Hyphens are flattened to spaces because the matcher applies these against its
 * own flattened form ("minolta x 570"), where a literal `x-570` key can never
 * match — a silent no-op that hid every hyphenated pair in this table.
 */
export function marketModelMap(brand: string): Record<string, string[]> {
  const map: Record<string, string[]> = {}
  const flat = (s: string) => s.replace(/-/g, ' ')
  const add = (from: string, to: string) => { (map[flat(from)] ||= []).push(flat(to)) }
  for (const g of MARKET_MODELS[brand] ?? []) {
    const names = Object.values(g).filter(Boolean) as string[]
    for (const a of names) for (const b of names) if (a !== b) add(a, b)
  }
  return map
}
