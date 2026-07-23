# Gearbook Explorer

A fast, static, single-page reference app for the **Gearbook** — a fact-only
spec index of vintage cameras and lenses (~17,400 cameras, ~3,600 lenses,
~49,200 cross-market name aliases). Type a name — even misspelled, even a
nickname — and land on a clean spec sheet.

**Live:** https://ewalfish.github.io/gearbook-explorer/

- Fuzzy typeahead search: alias-prefix-primary matching with bounded
  per-token typo correction (first-letter pinning), cross-market name
  expansion (Stylus ↔ mju, Maxxum ↔ Dynax ↔ Alpha, Autoboy ↔ Sure Shot),
  and domain normalizations (µ-II, Rolleiflex 2,8, 5cm → 50mm, Mk II ↔ Mark 2).
- Deep-linkable spec sheets with collector-variant tells and premium flags.
- Faceted browsing: manufacturer, type, film format, mount.
- Fully static — hash-routed, no backend, hosted on GitHub Pages.

## Architecture

```
data/gearbook/*.jsonl      published Gearbook asset (source of truth)
scripts/pipeline.ts        build-time pipeline → public/data/
  index.json                 eager search index (normalization precomputed)
  catalog.json               lite per-record rows (typeahead display, browse)
  facets.json                landing counts + manufacturer directory
  shards/XX.json             full records by 2-hex-char id prefix (lazy)
src/normalize.ts           the ONE normalization function (build + query time)
src/engine.ts              the fuzzy matcher (bespoke — no search libs)
src/views.ts, ui.ts        vanilla-TS views, WAI-ARIA combobox typeahead
```

No runtime dependencies. Vanilla TypeScript + Vite.

## Develop

```bash
npm ci
npm run dev        # builds data + starts vite dev server
npm test           # normalization + PRD acceptance suite (runs on real data)
npm run build      # data + typecheck + production bundle → dist/
```

## Data updates

Replace the three JSONL files in `data/gearbook/` with a newly published
asset version and push — CI rebuilds and redeploys. Record ids are stable
across republishes, so deep links survive.

## Data integrity

- The asset is anonymized by design — no source names, no provenance.
  The only outbound links are `manual_url` values (manual *hosting pages*,
  never direct PDFs — rendered as outbound links only).
- The app never edits data; corrections arrive as a new asset version.
- `confidence` reflects spec *completeness* only, surfaced as "partial specs".
