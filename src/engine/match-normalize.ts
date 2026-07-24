// Matcher normalization — used by the BATCH matcher (match.ts) and its
// catalog builder (gearbook.ts). Deliberately separate from the typeahead
// normalization in normalize.ts: the batch matcher's confidence gates were
// tuned against these exact rules (parenthetical stripping, descriptor
// removal, roman-numeral policy), and the two engines rank differently.

const ROMAN: Record<string, string> = {
  i: '1', ii: '2', iii: '3', iv: '4', v: '5',
  vi: '6', vii: '7', viii: '8', ix: '9', x: '10',
}

export function matchNormalize(s: string): string {
  let t = String(s).toLowerCase()
    // fold diacritics FIRST — else "voigtländer" shatters into "voigtl nder"
    // when the non-ascii strip below turns ä into a space. Query "Voigtländer"
    // must meet catalog "Voigtlander" (and Görlitz/Angénieux likewise).
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss')
    // Olympus µ IS "mju" — stripping it to a space would split "µ ZOOM 140"
    // and "Mju Zoom 140" into different-looking names
    .replace(/[µμ]:?/g, 'mju ')
    // German decimal commas in model designations ("Rolleiflex 2,8 E2"):
    // '.' survives tokenization but ',' splits — query "2.8" could never
    // token-match record "2,8". Fold comma-decimals to dots.
    .replace(/(\d),(\d)/g, '$1.$2')
    // Kodak-era numbering: sellers write "No. 2", records may write "N° 2" —
    // the degree sign strips to leave "n" while "No." leaves "no". Unify.
    .replace(/\bno\.?\s+(?=\d)/g, 'n ')
    .replace(/[®™©]/g, '')
    .replace(/\([^)]*\)/g, ' ') // parenthetical descriptors/disambiguators
    .replace(/\b(body only|body|boxed|box & lens set|outfit|kit|bundle|w\/ ?case|with case|no meter|chrome|black|silver|brown)\b/g, ' ')
    .replace(/[_/,+&]/g, ' ')
    .replace(/[^a-z0-9.\- ]/g, ' ')
    .replace(/(\d)\s*mm\b/g, '$1mm')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  // roman numerals as standalone tokens → arabic ("iii" → "3"); leave single
  // letters alone except i/v/x when clearly a version suffix at end
  t = t.split(' ').map((tok, idx, arr) =>
    ROMAN[tok] && (tok.length > 1 || idx === arr.length - 1) ? ROMAN[tok] : tok,
  ).join(' ')
  return t
}

export const matchTokens = (s: string): string[] => matchNormalize(s).split(' ').filter(Boolean)

export const digitSeqs = (s: string): string[] => matchNormalize(s).match(/\d+(\.\d+)?/g) ?? []
