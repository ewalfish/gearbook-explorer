# Gearbook

A fact-only spec index of vintage cameras and lenses (~17,400 cameras, ~3,600
lenses, ~49,200 cross-market name aliases), shipped three ways from this repo:

1. **Explorer** — a fast, static single-page reference app.
   Type a name — even misspelled, even a nickname — and land on a clean spec
   sheet. **Live:** https://ewalfish.github.io/gearbook-explorer/
2. **Library** (`gearbook` npm package) — the data plus two matching engines
   for your own projects.
3. **Data** — the raw JSONL asset in `data/gearbook/`.

## Explorer

- Fuzzy typeahead search: alias-prefix-primary matching with bounded
  per-token typo correction (first-letter pinning), cross-market name
  expansion (Stylus ↔ mju, Maxxum ↔ Dynax ↔ Alpha, Autoboy ↔ Sure Shot),
  and domain normalizations (µ-II, Rolleiflex 2,8, 5cm → 50mm, Mk II ↔ Mark 2).
- Deep-linkable spec sheets with collector-variant tells and premium flags.
- Faceted browsing: manufacturer, type, film format, mount.
- Fully static — hash-routed, no backend, hosted on GitHub Pages.

## Library

```bash
npm install github:ewalfish/gearbook-explorer#semver:^0.2.0
# or pin a tag: npm install github:ewalfish/gearbook-explorer#v2026.07.24
```

Two engines share one data asset:

- **`SearchEngine`** — interactive typeahead. Alias-prefix-primary, stable
  under partial tokens (results refine while typing, never flicker). Use for
  as-you-type UIs.
- **`matchOne` / `matchBatch`** — batch linking of complete names with
  `auto` / `review` / `no-match` decisions. Normalization → candidate
  generation → scored features, wrapped in deterministic confidence gates
  (same-core override, reissue/RF-SLR qualifier conflicts, lens family rule,
  subvariant specificity, ambiguity guard). Use for imports and enrichment.

```ts
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { catalogFromJsonl, matchOne } from 'gearbook'

const resolve = createRequire(import.meta.url).resolve
const read = (p: string) => readFileSync(resolve(`gearbook/data/${p}`), 'utf8')

const catalog = catalogFromJsonl({
  camerasJsonl: read('cameras.jsonl'),
  lensesJsonl: read('lenses.jsonl'),
  aliasesJsonl: read('aliases.jsonl'),
})

const r = matchOne('Nikkon F3 HP body, chrome', catalog, 'camera')
// r.decision → 'auto' | 'review' | 'no-match'
// r.best?.entry → { id, title: 'Nikon F3 HP', kind: 'camera', … }
```

Building the catalog takes ~300 ms for the full asset; matching runs a few
milliseconds per query. Both engines are dependency-free and run in Node or
the browser (no `fs` inside the library — you feed it the file contents).

## Architecture

```
data/gearbook/*.jsonl      published Gearbook asset (source of truth)
corrections/*.jsonl        accepted correction overlay (see below)
src/engine/                the library ("gearbook" package)
  normalize.ts               typeahead normalization + market-name variants
  search.ts                  SearchEngine — the typeahead engine
  match-normalize.ts         batch-matcher normalization
  variants.ts                cross-market/brand variant expansion (batch)
  match.ts                   matchOne/matchBatch — scored batch matcher
  gearbook.ts                JSONL parsing + match-catalog construction
scripts/pipeline.ts        build-time pipeline → public/data/ for the SPA
src/views.ts, ui.ts        vanilla-TS views, WAI-ARIA combobox typeahead
```

No runtime dependencies. Vanilla TypeScript + Vite.

## Develop

```bash
npm ci
npm run dev        # builds data + starts vite dev server
npm test           # normalization + typeahead + batch-matcher acceptance
                   # suites (they run on the real data)
npm run build      # data + typecheck + production bundle → dist/
npm run build:lib  # library build → dist/ (runs automatically on install)
```

## Corrections & submissions

Every record page has a **Report a correction** link that prefills a GitHub
issue with the record's identity. Verified corrections land in
`corrections/*.jsonl` (see [corrections/README.md](corrections/README.md) for
the row format) and are folded into the next published data version — the
published JSONL files themselves are regenerated, so corrections must go
through the overlay, not direct edits.

## Data updates

Replace the three JSONL files in `data/gearbook/` with a newly published
asset version and push — CI rebuilds and redeploys. Record ids are stable
across republishes, so deep links survive.

## Data notes

- The only outbound links are `manual_url` values (manual *hosting pages*,
  never direct PDFs — rendered as outbound links only) and the per-record
  correction-issue links.
- The app never edits data; corrections arrive as a new asset version.
- `confidence` reflects spec *completeness* only, surfaced as "partial specs".
