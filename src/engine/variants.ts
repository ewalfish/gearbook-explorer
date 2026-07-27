// Cross-market name reconciliation for confident batch matching.
//
// The same camera was sold under different names in the US, Europe, and Japan
// (Canon Rebel = EOS = Kiss; Minolta Maxxum = Dynax = α; Pentax ZX = MZ;
// Nikon N-series = F-series). Seller listings are typically US-named; the
// gearbook is mostly international-named — so US→international aliasing is the
// high-value direction. We emit BOTH directions for robustness and let the
// (digit-agreement-gated) matcher pick the best scorer, so aliasing can only
// add matches, never lose one.
//
// queryVariants(brand, model) -> [original, ...alternate names to also try]
// (callers may pass ('', fullQuery) — the brand is detected from the string).
//
// ── WHERE THE MARKET NAMES LIVE ─────────────────────────────────────────────
// The cross-market groups themselves are in market-names.ts, which the search
// box reads too. Only SPELLING variants that are not about markets stay below.
// This file is the SPECULATIVE layer: a swap here is applied to the QUERY, so a
// wrong guess costs a rejected candidate and nothing more. Names that ship as
// data must clear a higher bar — see the corroboration rule in market-names.ts.

import { marketTokenSwaps, marketModelMap } from './market-names.js'

// Brand-scoped SPELLING swaps — same market, different way of writing it. The
// cross-market groups are merged in from the shared table below.
const SPELLING_SWAPS: Record<string, [string, string][]> = {
  // early IQZoom line = intl "Zoom" (Zoom 105-R era)
  pentax: [['iq zoom', 'espio'], ['iqzoom', 'zoom'], ['iq zoom', 'zoom']],
  olympus: [['stylus', 'µ'], ['mju', 'µ']],
  konica: [['autoreflex', 'auto reflex']],
  yashica: [['mat', 'yashica-mat']],           // "Yashica Mat-124G" ⇄ "Yashica-Mat 124 G"
  mamiya: [['universal', 'press universal']],  // "Mamiya Universal" ⇄ "Mamiya Press Universal"
  samsung: [['maxima zoom', 'af zoom'], ['maxima', 'fino']],
  // NOTE: rebel/kiss was a query-side hint here until the real per-model table
  // landed in the forge (canon-eos.tsv). It is gone on purpose — the JP
  // numbering is unrelated (Kiss X4 = Rebel T2i = EOS 550D), so swapping the
  // WORD produced "Canon Kiss T2i", a camera that never existed. The attested
  // names now ship as aliases instead.
}

const TOKEN_SWAPS: Record<string, [string, string][]> = (() => {
  const brands = new Set([...Object.keys(SPELLING_SWAPS), 'minolta', 'pentax', 'olympus', 'nikon', 'ricoh', 'samsung', 'ihagee', 'exakta', 'canon'])
  const out: Record<string, [string, string][]> = {}
  for (const b of brands) out[b] = [...marketTokenSwaps(b), ...(SPELLING_SWAPS[b] ?? [])]
  return out
})()

// Brand-scoped whole-MODEL maps for everything that is NOT a market rename —
// family-record routing, line-name restoration, era disambiguation. The
// cross-market model pairs (Rebel⇄EOS, N-series⇄F-series, X-570⇄X-500…) are
// merged in from market-names.ts below.
// Values may be arrays when one US name spanned two bodies (film vs digital).
// Applied hyphen-insensitively; suffixes ("Kit", "QD") are preserved.
const EXTRA_MODEL_MAP: Record<string, Record<string, string | string[]>> = {
  nikon: {
    'nikonos i': 'nikonos', // the original 1963 body is named plain NIKONOS
  },
  canon: {
    // shared US name across eras → try both
    'rebel xs': ['eos 500', 'eos 1000d'],
    // the original AF compact carries its triple-market name
    'af35m': 'sure shot af35m autoboy',
    'sure shot': 'sure shot af35m autoboy',
  },
  konica: { 'hexar af': 'hexar' },  // the AF body is recorded plain "Hexar"
  mamiya: { '645': 'm645' },        // original 645 body is recorded M645
  leica: { 'r4': 'r4-r7', 'r5': 'r4-r7', 'r6': 'r4-r7', 'r7': 'r4-r7' }, // R bodies live on the family record
  rollei: { 'rolleiflex i': 'original rolleiflex', 'rolleiflex first model': 'original rolleiflex' },
  // plain "Exakta IIa/IIb" designations only exist as Varex models
  exakta: { 'exakta iia': 'exakta varex iia', 'exakta iib': 'exakta varex iib' },
  ihagee: { 'exakta iia': 'exakta varex iia', 'exakta iib': 'exakta varex iib' },
  kodak: { 'medalist i': 'medalist' }, // the first Medalist is recorded plain
}

const BRANDS = ['nikon', 'canon', 'minolta', 'pentax', 'olympus', 'ricoh', 'konica', 'yashica', 'mamiya', 'leica', 'samsung', 'rollei', 'ihagee', 'exakta', 'kodak']

const MODEL_MAP: Record<string, Record<string, string | string[]>> = (() => {
  const out: Record<string, Record<string, string | string[]>> = {}
  for (const b of new Set([...BRANDS, ...Object.keys(EXTRA_MODEL_MAP)])) {
    out[b] = { ...marketModelMap(b), ...(EXTRA_MODEL_MAP[b] ?? {}) }
  }
  return out
})()

const flatten = (s: string): string => s.toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim()

function brandOf(low: string): string | null {
  for (const b of BRANDS) if (low.includes(b)) return b
  if (/\basahi\b/.test(low)) return 'pentax'
  return null
}

// Lens-line insertion: manual-focus lenses are recorded under the maker's LINE
// name (Nikon→Nikkor, Minolta MF→Rokkor, Olympus→Zuiko, Konica→Hexanon), which
// sellers often omit ("Nikon 28mm f/2.8"). Inserting the line prevents a wrong
// third-party match (Nikon 28/2.8 → Kiron 28/2.8) and lifts the family match.
const LENS_LINE: [RegExp, RegExp, string][] = [
  [/\bnikon\b/i, /nikkor/i, 'Nikon Nikkor'],
  [/\bminolta\b/i, /rokkor|maxxum|dynax|\baf\b/i, 'Minolta Rokkor'],
  [/\bolympus\b/i, /zuiko/i, 'Olympus Zuiko'],
  [/\bkonica\b/i, /hexanon/i, 'Konica Hexanon'],
  // Fuji glass is recorded under "Fujinon" ("Fujinon GX M 100mm f/4"); sellers
  // write the house brand ("Fuji GX 100mm f/4")
  [/\bfuji(film)?\b/i, /fujinon/i, 'Fujinon'],
]

export function lensVariants(query: string): string[] {
  const base = String(query || '').trim()
  const out = new Set<string>([base])
  const add = (v: string | null | undefined): void => {
    if (v && v.trim()) out.add(v.replace(/\s+/g, ' ').trim())
  }
  const low = base.toLowerCase()
  // aperture notation → canonical "f/N": "f1.8"→"f/1.8", "1:1.8"→"f/1.8", "F1.8"
  if (/\bf\d|1:\d|\bf\/\s/i.test(base)) add(base.replace(/\bf(\d)/gi, 'f/$1').replace(/\b1:(\d)/g, 'f/$1').replace(/f\/\s+/g, 'f/'))
  // "aus Jena" export engraving = Carl Zeiss Jena (post-war trademark-dispute marking)
  if (/\baus\s+jena\b/i.test(low)) add(base.replace(/\b(carl\s+zeiss\s+)?aus\s+jena\b/i, 'Carl Zeiss Jena'))
  // cm-era focal notation → mm: "5cm f/2" is the 50mm, "13.5cm" the 135mm.
  // Rangefinder-era Nikkors/Zeiss are routinely listed in cm.
  if (/\d\s*cm\b/i.test(base)) add(base.replace(/(\d+(?:\.\d+)?)\s*cm\b/gi, (_m, n: string) => `${Math.round(parseFloat(n) * 10)}mm`))
  // zoom ranges typed with a dot ("70.200mm" for 70-200mm) — both bounds are
  // 2-3 digits, so a real decimal focal ("13.5cm", "42.5mm") never matches
  if (/\b\d{2,3}\.\d{2,3}\s*mm\b/i.test(base)) add(base.replace(/\b(\d{2,3})\.(\d{2,3})\s*mm\b/gi, '$1-$2mm'))
  // Nikkor element-count letter codes (-S, -P.C, -H.C, W-, -Q…) are engraving
  // detail, not the record's naming — emit a plain-Nikkor variant, composed
  // over the cm→mm form above
  for (const v of [...out]) {
    if (/\bnikkor[-.·\s]?[a-z](\.?c)?\b/i.test(v) || /\b[wp]-nikkor(\.c)?\b/i.test(v) || /reflex-nikkor/i.test(v)) {
      add(v.replace(/\b[wp]-nikkor(\.c)?\b/gi, 'Nikkor').replace(/reflex-nikkor/gi, 'Reflex Nikkor').replace(/\bnikkor[-.·\s]?[a-z](\.?c)?(?=\s)/gi, 'Nikkor'))
    }
  }
  // insert the maker's lens line when absent
  for (const [brandRe, lineRe, ins] of LENS_LINE) if (brandRe.test(low) && !lineRe.test(low)) add(base.replace(brandRe, ins))
  // digit-letter reverse glue: "Helios 44-M" must reach the glued record
  // name "Helios-44M" (the letter-digit direction is handled in queryVariants)
  add(base.replace(/\b(\d{1,4})[- ]([a-zA-Z]{1,2})\b/g, '$1$2'))
  // Canon series inference: sellers drop the series token ("Canon 75-300mm
  // III"). Emit EF and FD variants when none is present — candidates only;
  // the nums/type/maker gates still decide confidence.
  if (/\bcanon\b/i.test(low) && !/\b(ef-?[sm]?|fd|fl|fdn|rf)\b/i.test(low)) {
    add(base.replace(/\bcanon\b/i, 'Canon EF'))
    add(base.replace(/\bcanon\b/i, 'Canon FD'))
  }
  // Soviet optics are recorded by LINE name only ("Helios-44", "Jupiter-8",
  // "Tair-11A") — sellers prepend the factory (KMZ/LZOS/ZOMZ/MMZ/KOMZ). Strip it.
  add(base.replace(/\b(kmz|kmv|lzos|zomz|mmz|komz|krasnogorsk|kmz\/lzos)\b\s*\/?/gi, ' '))
  // Soviet line names glue to their model number with a hyphen
  // ("Industar 50" → "Industar-50", "Mir 26B" → "Mir-26B")
  add(base.replace(/\b(industar|jupiter|helios|mir|tair|orion|vega|russar)\s+(\d)/gi, '$1-$2'))
  // …and version-letter suffixes drop to the base line ("Mir-26B" → "Mir-26")
  add(base.replace(/\b(mir|industar|jupiter|helios|tair|vega)[-\s]?(\d+)[a-z]\b/gi, '$1-$2'))
  // sellers name Helios lenses by FOCAL instead of model: 58/2 is the 44 line,
  // 85/1.5 the 40 line
  if (/\bhelios\b(?!\s*-?\d)/i.test(low)) {
    if (/\b58\s*mm|\b58\b/i.test(low)) add(base.replace(/\bhelios\b/i, 'Helios-44'))
    if (/\b85\s*mm|\b85\b/i.test(low)) add(base.replace(/\bhelios\b/i, 'Helios-40'))
  }
  // Olympus OM lenses: sellers say "OM Zuiko"; the gearbook says "OM-System Zuiko"
  if (/\bom\s+zuiko\b/i.test(low)) add(base.replace(/\bom\s+zuiko\b/i, 'OM-System Zuiko'))
  // Leica Noctilux/Summilux/Summicron M-mount: records carry the -M suffix
  if (/\b(noctilux|summilux|summicron|elmarit)\s+\d/i.test(low)) add(base.replace(/\b(noctilux|summilux|summicron|elmarit)\b/i, '$1-M'))
  // Canon FD generations: FD ⇄ FDn ⇄ New FD are the same optical family name-wise
  if (/\bfdn?\b/i.test(low)) { add(base.replace(/\bfd\b/i, 'FDn')); add(base.replace(/\bfdn\b/i, 'FD')); add(base.replace(/\bnew fd\b/i, 'FDn')) }
  // Takumars are recorded under "Asahi", sellers say "Pentax" (or neither)
  if (/takumar/i.test(low) && !/asahi/i.test(low)) {
    add(/\bpentax\b/i.test(base) ? base.replace(/\bpentax\b/i, 'Asahi') : `Asahi ${base}`)
  }
  // Canon coating suffix (S.S.C. ⇄ SSC, BOTH directions) and trailing-zero
  // apertures, each composed over ALL variants built so far — "FD 50/1.4 SSC"
  // needs the dotted form ON the FD-generation variants, and "Noctilux 50mm
  // f/1.0" needs the -M suffix and the f/1 form at once.
  for (const v of [...out]) {
    if (/s\.s\.c\.?/i.test(v)) add(v.replace(/s\.s\.c\.?/i, 'SSC'))
    else if (/\bssc\b/i.test(v)) add(v.replace(/\bssc\b/i, 'S.S.C.'))
  }
  for (const v of [...out]) {
    if (/f\/?\s*\d\.0\b/i.test(v)) add(v.replace(/(f\/?\s*\d)\.0\b/gi, '$1'))
    else add(v.replace(/(f\/?\s*\d)\b(?!\.)/gi, '$1.0'))
  }
  // denoise collector/variant cruft so focal+aperture core matches
  const dn = base.replace(/["""]/g, ' ').replace(/\([^)]*\)/g, ' ')
    .replace(/\b(dual range|collaps[ai]ble|rigid|type \w+|chrome|black|silver|\bmc\b|\bmint\b|\bboxed\b|\bcla'?d[^,]*)\b/gi, ' ')
    .replace(/\s+/g, ' ').trim()
  if (dn.toLowerCase() !== low) add(dn)
  return [...out].slice(0, 18)
}

export function queryVariants(brand: string, model: string): string[] {
  const base = `${brand || ''} ${model || ''}`.trim()
  const out = new Set<string>([base])
  const add = (v: string | null | undefined): void => {
    if (v && v.trim()) out.add(v.replace(/\s+/g, ' ').trim())
  }
  const low = base.toLowerCase()
  const flat = flatten(base)
  const bk = brandOf(low)

  // glued model+suffix spacing: "F3HP"→"F3 HP", "QL17"→"QL 17"
  add(base.replace(/([a-z])(\d)/gi, '$1 $2').replace(/(\d)([a-z]{1,3})\b/gi, '$1 $2'))
  // …and the REVERSE: some record names glue what sellers space ("OM-10" vs
  // "OM10"). Emit a de-spaced/de-hyphenated variant of short prefixes.
  add(base.replace(/\b([a-zA-Z]{1,4})[- ](\d{1,4})\b/g, '$1$2'))
  // holding-company / factory prefixes the records drop: Pignons (Alpa),
  // Konishiroku (Konica), Krasnogorsk (KMZ/Zenit), Ihagee kept on Exakta
  // Kyocera owned Yashica/Contax and sellers title both names ("Kyocera Yashica
  // T2D"); "Roebuck" rides along on Sears ("Sears Roebuck Tower 57") — both are
  // corporate words the records drop.
  add(base.replace(/\b(pignons|konishiroku|krasnogorsk|kmz|gomz|mmz|belomo|riken|tokyo kogaku|kowa optical works|chongqing musical instrument( factory)?|chongqing|sichuan|kyocera|roebuck)\b\s*/gi, ''))
  // Cyrillic С transliterates as both C and S ("Zorki C" = "Zorki S", Kiev 6C/6S)
  if (/\b(zorki|zorkii|kiev|fed)\b/i.test(low) && /\bc\b/i.test(low)) add(base.replace(/\bc\b/i, 'S'))
  // Sputnik also appears in the French transliteration "Spoutnik"
  if (/sputnik/i.test(low)) add(base.replace(/sputnik/gi, 'Spoutnik'))
  // Exacta/Exakta spelling drift (both appear in period literature and records)
  if (/exacta/i.test(low)) add(base.replace(/exacta/gi, 'Exakta'))
  else if (/exakta/i.test(low)) add(base.replace(/exakta/gi, 'Exacta'))
  // Nikonos records are named without the Nikon prefix; the original
  // 1963 body is plain "Nikonos" (composed: both fixes at once)
  if (/nikonos/i.test(low)) add(base.replace(/\bnikon\b\s*/i, '').replace(/\bnikonos\s+i\b/i, 'Nikonos'))
  // doubled brand tokens from seller titles ("Rollei Rollei A110",
  // "Shanghai Shanghai 58", "Great Wall Great Wall DF-3", "Nikon Nikon S")
  if (/\b(\w[\w-]*)\s+\1\b/i.test(base)) add(base.replace(/\b(\w[\w-]*)\s+\1\b/gi, '$1'))
  // Asahi Optical's bodies are ENGRAVED "Asahi Pentax", so that is what sellers
  // type — but the corpus files them as plain "Pentax X". The maker word is a
  // third token the record does not have, and on a two-character model it costs
  // most of the token overlap: "Pentax MX" scores 0.935 and "Asahi Pentax MX"
  // 0.154. The long names survived it ("Asahi Pentax K1000" 0.918), which is
  // why this stayed invisible for so long — the failure is concentrated in
  // exactly the short-designation bodies (MX, ME, KX, S1a) that are workhorse
  // stock. "Asahiflex" is a real and distinct line, and it is a single token,
  // so \b cannot reach inside it.
  if (/\basahi\b/i.test(low)) {
    add(base.replace(/\basahi\b\s*/i, ''))
    if (!/\bpentax\b/i.test(low)) add(base.replace(/\basahi\b/i, 'Pentax'))
  }
  // Fuji has used three house names and the corpus mixes all three inside one
  // product line — "Fuji DL-190 Zoom" sits beside "Fujifilm DL-312 Zoom". A
  // seller types whichever is on the body, so the brand word alone decided
  // whether a match landed: "Fujifilm Discovery 185 Zoom" reached its own
  // record at 0.503 while the 312 next to it hit 0.917. Fujica is the older
  // marque and joins the same rotation.
  if (/\bfuji(film|ca)?\b/i.test(low)) {
    for (const b of ['Fuji', 'Fujifilm', 'Fujica']) add(base.replace(/\bfuji(film|ca)?\b/i, b))
  }
  // Olympus wrote the same suffix two ways: "UZ" glued onto the SP-series
  // ("SP-565UZ") and "Ultra Zoom" spelled out on the Camedia C-series
  // ("C-750 Ultra Zoom"). Upstream titles mix them, so the query and the record
  // routinely disagree — "Olympus SP-550UZ" reached its own "SP-550 Ultra Zoom"
  // record at 0.384, below review. Emit both spellings and let the scorer pick.
  if (/\d\s*uz\b/i.test(low)) add(base.replace(/(\d)\s*uz\b/gi, '$1 Ultra Zoom'))
  else if (/ultra\s*zoom/i.test(low)) add(base.replace(/\s*ultra\s*zoom\b/gi, 'UZ'))
  // Polaroid stamped "Land" (after Edwin Land) on two decades of bodies and
  // sellers faithfully type it, but the records are filed without it
  // ("Polaroid SX-70 Land Alpha 1" vs record "Polaroid SX-70 Alpha 1"). The
  // word appears mid-name at any position, so no alias row can chase every
  // phrasing — strip it as a variant.
  if (/\bpolaroid\b/i.test(low) && /\bland\b/i.test(low)) {
    add(base.replace(/\bland( camera)?\b/gi, ' ').replace(/\s+/g, ' ').trim())
  }
  // Nikon's compact lines are recorded with a DOT ("Lite.Touch Zoom 105",
  // "Nice.Touch Zoom QD", "Tele.Touch 300" — print renders of the • mark);
  // sellers type a space. '.' survives normalization, so "lite touch" and
  // "lite.touch" are different tokens. Emit both spellings.
  if (/\b(tele|lite|nice|one|zoom)[\s.•]+touch\b/i.test(low)) {
    add(base.replace(/\b(tele|lite|nice|one|zoom)[\s.•]+touch\b/gi, '$1.Touch'))
    add(base.replace(/\b(tele|lite|nice|one|zoom)[\s.•]+touch\b/gi, '$1 Touch'))
  }
  // Panasonic digitals are recorded under the full "Lumix DMC-/DC-" designation
  // ("Panasonic Lumix DMC-ZS3"); sellers type "Panasonic ZS3" or "Panasonic
  // Lumix ZS3". Emit the prefixed forms so the exact market alias can match.
  // DC- took over from DMC- in 2017, so both are emitted and the scorer picks.
  if (/\bpanasonic\b/i.test(low) && !/\b(dmc|dc)-/i.test(low)) {
    const m = base.match(/\b((?:zs|tz|fz|fh|fs|fx|ts|lx|zr|zx|gf|gh|gx|gm|g)\d+\w*)\b/i)
    if (m) {
      for (const pre of ['DMC-', 'DC-']) {
        const withPre = base.replace(m[1], pre + m[1])
        add(/\blumix\b/i.test(low) ? withPre : withPre.replace(/\bpanasonic\b/i, 'Panasonic Lumix'))
      }
    }
  }
  // Rollei: taking-lens names in seller titles are optics detail, not the model
  // ("2.8E Xenotar", "2.8C CZ Planar") — emit a stripped variant
  if (/\brollei/i.test(low)) add(base.replace(/\b(xenotar|planar|xenar|tessar|opton|carl zeiss|cz|schneider)\b\s*/gi, ' ').replace(/\s+/g, ' ').trim())
  // glued marketing names: "Sureshot" ⇄ "Sure Shot"
  if (/\bsureshot\b/i.test(low)) add(base.replace(/\bsureshot\b/i, 'Sure Shot'))
  // Samsung digitals are recorded under the Digimax line name
  if (/\bsamsung\b/i.test(low) && /\b[ls]\d{2,3}\b/i.test(low) && !/digimax/i.test(low)) {
    add(base.replace(/\bsamsung\b/i, 'Samsung Digimax'))
  }
  // Canonet QL bodies: sellers write "Canon G-III QL17" without the line name
  if (/\bcanon\b/i.test(low) && /\bql\s?\d/i.test(low) && !/canonet/i.test(low)) {
    const withLine = base.replace(/\bcanon\b/i, 'Canon Canonet')
    add(withLine)
    add(withLine.replace(/\bg-?iii\s+(ql\s?1[79])\b/i, '$1 GIII'))
  }
  // Zeiss Ikon: records drop the maker on sub-brand lines (Super Ikonta,
  // Ikonta…) and hide catalog numbers in parentheses. Emit prefix-stripped and
  // number-stripped variants (and both) so "Zeiss Ikon Super Ikonta 532/16"
  // reaches the bare "Super Ikonta 532/16" record or the family cluster.
  if (/\bzeiss\s*ikon\b/i.test(low)) {
    const noBrand = base.replace(/\bzeiss\s*ikon\b\s*/i, '')
    const noNum = base.replace(/\b\d{2,3}\s*\/\s*\d{1,2}\b/g, ' ').replace(/\s+/g, ' ').trim()
    add(noBrand)
    add(noNum)
    add(noBrand.replace(/\b\d{2,3}\s*\/\s*\d{1,2}\b/g, ' ').replace(/\s+/g, ' ').trim())
  }
  // Canonet suffix order: sellers write "G-III QL17"; records say "QL17 GIII"
  if (/\bg-?iii\b/i.test(low) && /\bql\s?1[79]\b/i.test(low)) {
    add(base.replace(/\bg-?iii\s+(ql\s?1[79])\b/i, '$1 GIII').replace(/(ql\s?1[79])\s+g-?iii/i, '$1 GIII'))
  }
  // Kodak VPK = collector shorthand for the Vest Pocket Kodak
  if (/\bvpk\b/i.test(low)) add(base.replace(/\b(kodak\s+)?vpk\b/i, 'Vest Pocket Kodak'))
  // Minca = UK-market Argus rebrand (~1939, "Minca Speed Camera", lens "Minca
  // Cintar"): C2/C3 confirmed — route those to the Argus line (the standalone
  // "Argus Minca 28" record keeps its own name)
  if (/\bminca\b/i.test(low) && /\b(c2|c3)\b/i.test(low)) add(base.replace(/\b(argus\s+)?minca\b/i, 'Argus'))
  // "Golden Shield by Argus" = Sylvania-era (1959+) rebadged Argus C3
  if (/\bgolden\s+shield\b/i.test(low)) add(base.replace(/\bgolden\s+shield(\s+by)?\b/i, ' ').replace(/\bargus\b\s*(c3)?/i, 'Argus C3').replace(/\s+/g, ' ').trim() || 'Argus C3')
  // Argus nicknames: C21 was marketed as the "Markfinder"; recorded as "Argus 21"
  if (/\bargus\b/i.test(low)) {
    const noNick = base.replace(/\b(markfinder|mark\s?finder|the\s+brick)\b/gi, ' ').replace(/\s+/g, ' ').trim()
    if (noNick.toLowerCase() !== low) add(noNick)
    if (/\bc21\b/i.test(low)) add(noNick.replace(/\bc21\b/i, '21'))
  }
  // Contarex "Bullseye"/"Cyclops" = the original 1959 Contarex I (never marked on the body)
  if (/\bcontarex\b/i.test(low) && /bull.?s.?eye|cyclops/i.test(low)) {
    add(base.replace(/\b(bull'?s?.?eyes?|cyclops)\b/gi, ' ').replace(/\bcontarex\b/i, 'Contarex I').replace(/\s+/g, ' ').trim())
  }
  // Super Ikonta letter designations → the Zeiss Ikon catalog numbers the
  // records use (A=531 6x4.5, B=532/16 6x6, BX=533/16, C=531/2 6x9, D=530/15)
  if (/super\s*ikonta/i.test(low)) {
    const SI: Record<string, string> = { a: '531', b: '532/16', bx: '533/16', c: '531/2', d: '530/15' }
    const m = low.match(/super\s*ikonta\s+(bx|[abcd])\b/i)
    if (m && SI[m[1].toLowerCase()]) {
      const swapped = base.replace(new RegExp(`(super\\s*ikonta)\\s+${m[1]}\\b`, 'i'), `$1 ${SI[m[1].toLowerCase()]}`)
      add(swapped)
      add(swapped.replace(/\bzeiss\s*ikon\b\s*/i, ''))
    }
  }
  // slash-less Zeiss Ikon catalog numbers ("53216" typed for 532/16)
  if (/zeiss|ikonta|ikoflex|nettar|kolibri|contessa/i.test(low) && /\b\d{4,5}\b/.test(low) && !/\b(19|20)\d{2}\b/.test(low)) {
    add(base.replace(/\b(\d{3})(\d{1,2})\b/, '$1/$2'))
  }
  // Kiev Contax-copies: roman/arabic numeral drift ("Kiev 2a" = "Kiev-IIa")
  if (/\bkiev\b/i.test(low)) {
    add(base.replace(/\bkiev[- ]?2a\b/i, 'Kiev-IIa').replace(/\bkiev[- ]?2\b/i, 'Kiev-II').replace(/\bkiev[- ]?3a\b/i, 'Kiev-IIIa').replace(/\bkiev[- ]?3\b/i, 'Kiev-III'))
  }

  // brand-spelling equivalence: same maker sold as Fuji / Fujica / Fujifilm and
  // Konica Minolta / Minolta — emit each spelling so the concrete model matches.
  for (const grp of [['fujifilm', 'fujica', 'fuji'], ['konica minolta', 'minolta']]) {
    const hit = grp.find((g) => new RegExp(`\\b${g}\\b`, 'i').test(low))
    if (hit) for (const alt of grp) if (alt !== hit) add(base.replace(new RegExp(`\\b${hit}\\b`, 'i'), alt))
  }

  // denoise: strip collector/condition cruft + bundled accessories so the CORE
  // designation matches (esp. Leica: "M3 Double Stroke (CLA'd 3/31)"→"M3",
  // "IIIf Red Dial w/ Summarit"→"IIIf"). Brand-agnostic; also clears "F3HP
  // Kit", "Stylus Zoom 140 Refurbished". Gated by match confidence.
  const denoise = base
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b(w\/|with)\s.*$/i, ' ')
    .replace(/\s\+.*$/, ' ')
    .replace(/"[^"]{2,30}"|“[^”]{2,30}”/g, ' ') // quoted nicknames ("US NAVY", "feathered arrow")
    .replace(/\b(cla'?d[^,]*|red dial|single stroke|double stroke|self[- ]?timer|leicavit|refurbished|body only|kit|mint|boxed|converted to \w+|elc|stepper|as[- ]is|tested|working|iob|dlx|quartz\s?date|quartzdate|thick font|mod\.? \d+|late model|whiteface|prototype( ver\.? \d+)?|domestic|english ver\.?|grey|gray|tlr|subminiature|panoramic|half[- ]frame|nub|variant|early|late|edition|waist[- ]level|eye[- ]level|t scope|purple|maroon|burgundy|tan|beige|folding camera|box camera)\b/gi, ' ')
    // shutter engravings sellers read off the lens rim ("Contessa 35 Synchro
    // Compur") and generic film-format/segment words — none of them are model
    // tokens. "pronto" alone is NOT in this list: it names Polaroid bodies.
    .replace(/\b(synchro[- ]?compur|compur([- ]rapid)?|prontor(\s?svs?)?|35mm|p&s|anniversary)\b/gi, ' ')
    // "Mod II"/"Model 1" style suffixes with roman or arabic numbers (the
    // letter-model rule below only covers "Model G" shapes)
    .replace(/\bmod(el)?\.?\s+(i{1,3}|iv|v|\d)\b/gi, ' ')
    // marketing suffixes that name the SAME body ("Mamiya C220 Professional",
    // "Leica IIIa Model G") — additive variant only; when a distinct
    // letter-model record exists, its exact-name score still outranks this
    .replace(/\bprofessional\b/gi, ' ')
    .replace(/\bmodel\s+[a-z]\b(?![\w-])/gi, ' ')
    .replace(/\s+/g, ' ').trim()
  if (denoise && denoise.toLowerCase() !== low) add(denoise)
  // compose the doubled-brand collapse over the denoised form — "Tower (Sears)
  // Tower 45" only becomes a doubled brand AFTER the parenthetical is stripped,
  // and single-transform variants do not compose on their own
  if (denoise && /\b(\w[\w-]*)\s+\1\b/i.test(denoise)) {
    add(denoise.replace(/\b(\w[\w-]*)\s+\1\b/gi, '$1'))
  }

  if (bk) {
    // token swaps (number preserved), applied in both directions. Each swap
    // result also gets the glue-spacing variants — a swap alone can leave a
    // glued suffix unsplit ("Yashica-Mat 124G" needs BOTH mat→yashica-mat AND
    // "124G"→"124 G" to meet the record's "Yashica-Mat 124 G").
    const spaced = (s: string): string => s.replace(/([a-z])(\d)/gi, '$1 $2').replace(/(\d)([a-z]{1,3})\b/gi, '$1 $2')
    for (const [a, b] of TOKEN_SWAPS[bk] ?? []) {
      const ra = new RegExp(`\\b${a}\\b`, 'i'), rb = new RegExp(`\\b${b}\\b`, 'i')
      if (ra.test(flat)) { const v = flat.replace(ra, b); add(v); add(spaced(v)) }
      if (rb.test(flat)) { const v = flat.replace(rb, a); add(v); add(spaced(v)) }
    }
    // whole-model maps (bidirectional; suffixes preserved)
    const map = MODEL_MAP[bk] ?? {}
    const inv: Record<string, string[]> = {}
    for (const [k, v] of Object.entries(map)) for (const vv of ([] as string[]).concat(v)) (inv[vv] ??= []).push(k)
    const applyMap = (m: Record<string, string | string[]>): void => {
      for (const [k, v] of Object.entries(m)) {
        const re = new RegExp(`\\b${k.replace(/\s+/g, '\\s+')}\\b`, 'i')
        // collapse doubled tokens a remap can create: "Canon EOS Rebel G" +
        // (rebel g → eos 500n) would otherwise emit "canon eos eos 500n"
        if (re.test(flat)) for (const vv of ([] as string[]).concat(v)) add(flat.replace(re, vv).replace(/\b(\w+)\s+\1\b/gi, '$1'))
      }
    }
    applyMap(map); applyMap(inv)
  }

  // Pentax Spotmatic shorthand -> long form (SPII->Spotmatic II, SPF->
  // Spotmatic F). These are DISTINCT bodies (SPF has open-aperture metering), so
  // route to the exact variant, never collapse to base Spotmatic.
  if (bk === 'pentax' && /spotmatic|\bsp ?(ii|f|500|1000)\b/i.test(low)) {
    if (/\bsp ?ii\b|\bspii\b/i.test(low)) add(base.replace(/\bsp ?ii\b|\bspii\b/i, 'II'))
    if (/\bsp ?f\b|\bspf\b/i.test(low)) add(base.replace(/\bsp ?f\b|\bspf\b/i, 'F'))
    if (/spotmatic\s+sp\b/i.test(low)) add(base.replace(/\s+sp\b/i, ''))
  }

  // Olympus also sold the mju/Stylus line as "Infinity …" in the early US market,
  // and named the Stylus Epic the "mju II". Emit those spellings for every variant.
  if (bk === 'olympus') {
    // seller titles often chain BOTH market names ("Mju-II Stylus Epic Zoom 80")
    // plus retail suffixes (DLX, Quartzdate, IOB). Strip the redundancy first.
    const dn2 = base
      .replace(/\b(dlx|deluxe|quartz\s?date|quartzdate|\bqd\b|iob|black|refurbished)\b/gi, ' ')
      .replace(/\s+/g, ' ').trim()
    if (dn2.toLowerCase() !== low) add(dn2)
    for (const v of [...out]) {
      // when "mju" is present, stylus/epic/infinity are the same camera's other
      // market names — drop them (and vice versa) so the core designation matches
      if (/mju/i.test(v)) add(v.replace(/\b(stylus|epic|infinity)\b\s*/gi, ''))
      if (/stylus|infinity/i.test(v) && /mju/i.test(v) === false) add(v.replace(/\b(stylus|infinity)\b\s*/gi, 'mju '))
      add(v.replace(/\bmju[- ]?i\b/i, 'mju'))               // "Mju-I" = the original mju
      add(v.replace(/\bstylus\s+(7[0-9]|8[05]|1[0-5][05])\b(?!\s*(zoom|dlx))/i, 'Mju-III $1')) // 2000s Stylus NNN = Mju-III NNN
      add(v.replace(/\binfinity\s*/i, ''))
      if (!/infinity/i.test(v)) add(v.replace(/olympus/i, 'Olympus Infinity'))
      add(v.replace(/stylus epic/i, 'mju II').replace(/\bepic\b/i, 'II'))
      add(v.replace(/mju\s*ii/i, 'Stylus Epic'))
    }
  }

  // "Mk/Mark" generation suffixes (brand-agnostic — Canon, Sony, Olympus all use
  // them): sellers write Mk II / MkII / Mk2 / Mark 2 for the record's "Mark II".
  // Emit the canonical Mark-roman form plus the Mk abbreviation for every variant.
  {
    const roman: Record<string, string> = { '1': 'I', '2': 'II', '3': 'III', '4': 'IV', '5': 'V' }
    const gen = /\b(mk|mark)\.?[ -]?(iv|v|i{1,3}|[1-5])\b/i
    for (const v of [...out]) {
      const m = v.match(gen)
      if (!m) continue
      const n = roman[m[2]] ?? m[2].toUpperCase()
      add(v.replace(gen, `Mark ${n}`))
      add(v.replace(gen, `Mk ${n}`))
    }
  }

  // Canon EOS shorthand: sellers drop the EOS ("Canon 5D Mark II"). Insert/remove
  // it for EOS-shaped bodies only — NNNd/NNNds digital, 1V film, R/RP/R# mirrorless
  // — so "Canon P" or "Canonet" never grow an EOS. Runs after the Mark expansion so
  // "Canon 5D Mk II" reaches "Canon EOS 5D Mark II".
  if (bk === 'canon') {
    const eosBody = /\b(\d{1,4}ds?|1v|rp|r\d{0,2})\b/i
    for (const v of [...out]) {
      if (/\beos\b/i.test(v)) add(v.replace(/\beos\b\s*/i, ''))
      else if (eosBody.test(v)) add(v.replace(/\bcanon\b/i, 'Canon EOS'))
    }
  }

  return [...out].slice(0, 24)
}
