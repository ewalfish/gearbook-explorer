# Gearbook

A fact-only spec index of vintage cameras and lenses, shipped three ways from
this repo:

1. **Explorer** — a fast, static single-page reference app.
   Type a name — even misspelled, even a nickname, even the name it was sold
   under in another country — and land on a clean spec sheet.
   **Live:** https://ewalfish.github.io/gearbook-explorer/
2. **Library** (`gearbook` npm package) — the data, two matching engines, a
   derivation layer, and the asset **contract**, for your own projects.
3. **Data** — the raw JSONL asset in `data/gearbook/`.

## What is actually in here

As of **v3.10.1** (asset `2026-07-27`, contract v1):

| File | Rows | What |
|---|---:|---|
| `cameras.jsonl` | 17,288 | camera records — `high:16304 · medium:873 · low:111` confidence |
| `lenses.jsonl` | 4,406 | lens records — `high:4326 · medium:42 · low:38` |
| `aliases.jsonl` | 59,548 | every string that should resolve to a record |
| `redirects.jsonl` | 192 | merged-away ids → the surviving record, so deep links never rot |

Aliases are not one thing, and the `via` field says which kind each one is —
this matters, because a consumer showing "also known as" wants the names a
*person* would say, not the machine-generated spelling variants:

| `via` | Count | What it is |
|---|---:|---|
| `name` | 21,694 | a genuine alternative name |
| `shorthand` | 18,038 | the maker dropped from a name that leads with it |
| `punctuation` | 11,938 | spelling/spacing variants — *not* names a human says |
| `maker` | 4,086 | a maker **prepended** to a name that never carried one |
| `correction` | 3,143 | from the corrections overlay |
| `market` | 557 | the same camera's name in another market |
| `superseded` | 92 | a former name of the record |

`maker` is the mirror of `shorthand`, and exists because 15% of camera records
have a `manufacturer` that appears nowhere in their name — "Leotax D IV" is made
by Shōwa Kōgaku, "Opema" by Meopta. A seller types the maker because it is
engraved on the camera. 413 aliases additionally carry a `market` tag (`us`,
`intl`, `eu`, `jp`).

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
# Pin a tag. Always pin a tag — see "Releases" below.
npm install github:ewalfish/gearbook-explorer#v3.10.1
```

The package ships `dist/` (the compiled engines) and `data/gearbook/` (the
asset). `prepare` runs `build:lib` at install time, so a git install compiles
from source on the consumer's machine.

### Two engines, one data asset

- **`SearchEngine`** — interactive typeahead. Alias-prefix-primary, stable
  under partial tokens (results refine while typing, never flicker). Use for
  as-you-type UIs.
- **`matchOne` / `matchBatch`** — batch linking of complete names with
  `auto` / `review` / `no-match` decisions (`AUTO = 0.9`, `REVIEW = 0.45`).
  Normalization → candidate generation → scored features, wrapped in
  deterministic confidence gates (same-core override, reissue/RF-SLR qualifier
  conflicts, lens family rule, subvariant specificity, ambiguity guard). Use for
  imports and enrichment.

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
// r.scored     → top-5 candidates with feature breakdowns
```

Building the catalog takes ~300 ms for the full asset; matching runs a few
milliseconds per query. Both engines are dependency-free and run in Node or the
browser — there is no `fs` inside the library, you feed it file contents. Build
the catalog **once**, in a module-scope singleton; it is ~106 MB of heap.

### Answers, not rows

Every consumer was re-deriving the same four questions from raw alias arrays,
slightly differently. They are library work, so they live here:

```ts
import { names, otherMarketNames, buildRedirectIndex, explain } from 'gearbook'

names(record, aliases)          // what a human would call this — punctuation
                                // variants excluded, spoken aliases kept
otherMarketNames(record, alias) // what it was sold as elsewhere
buildRedirectIndex(redirects)   // does this stale id still resolve?
explain(matchResult)            // why did that match?
```

### Hazards — derivation, not assertion

```ts
import { hazards, hasHazard } from 'gearbook'
```

Two things make a working vintage camera unusable to a buyer: **film that is no
longer made** and a **mercury battery** that has been banned since the 1990s.
The battery case is subtler than availability — mercury cells held a flat 1.35V,
so a modern 1.5V alkaline makes the meter read wrong *across the range* rather
than uniformly, and a substitute needs an adapter or recalibration. Both are
derivable from fields the asset already carries (`data.format`,
`data.batteries`), which is exactly why they belong here rather than in one
consumer's product page — encoding "126 film has not been made in decades" once,
next to the data that proves it, means the storefront, the Explorer and any eBay
description all say the same true thing.

Nothing here adds a fact to the asset; it reads two fields and states a
consequence a buyer would otherwise have to already know. Measured against real
stock, 143 of 953 confidently-linked cameras — 15% — carry at least one.

### The contract

```ts
import { validateAsset, formatValidation, ASSET_CONTRACT, ALIAS_VIA } from 'gearbook'

const result = validateAsset({ cameras, lenses, aliases, redirects })
console.log(formatValidation(result, 'my copy'))
// ✓ my copy satisfies contract v1  (cameras:17288  lenses:4406  …)
```

The contract is **shipped**, not just documented, so one artifact serves three
checkpoints — the forge gates on it before publishing, this repo's tests assert
the shipped asset satisfies it, and a consumer can verify the dependency it
actually installed. `ASSET_SCHEMA` is the JSON Schema for anything that wants
it; `validateAsset` is the executable version.

## Architecture

```
data/gearbook/*.jsonl      published Gearbook asset (source of truth)
corrections/*.jsonl        accepted correction overlay (see below)
src/engine/                the library ("gearbook" package)
  schema.ts                  THE CONTRACT — validateAsset, ASSET_SCHEMA, vocabularies
  normalize.ts               typeahead normalization + market-name variants
  search.ts                  SearchEngine — the typeahead engine
  match-normalize.ts         batch-matcher normalization
  variants.ts                cross-market/brand variant expansion (batch)
  match.ts                   matchOne/matchBatch — scored batch matcher
  market-names.ts            cross-market naming tables (mirrors the forge's market-names.mjs)
  gearbook.ts                JSONL parsing + match-catalog construction
  names.ts                   names/redirects/explanations — answers, not rows
  hazards.ts                 discontinued film + mercury batteries, derived
  index.ts                   the public API surface
scripts/pipeline.ts        build-time pipeline → public/data/ for the SPA
scripts/validate-asset.ts  npm run validate — contract check over data/gearbook/
src/views.ts, ui.ts        vanilla-TS views, WAI-ARIA combobox typeahead
dist/                      COMMITTED build output — see the warning below
```

No runtime dependencies. Vanilla TypeScript + Vite.

## Develop

```bash
npm ci
npm run dev        # builds data + starts vite dev server
npm test           # 156 tests: normalize (15) · contract (65) · match (16) · engine (60)
                   # they run on the real data
npm run validate   # contract check over data/gearbook/ — no build needed
npm run build      # data + typecheck + production bundle
npm run build:lib  # library build -> dist/ (also runs automatically on install)
```

### ⚠️ `dist/` is committed, and nothing tests it

Every one of the 156 tests imports from `src/`. **Not one line loads `dist/`.**
So a stale committed build ships silently, and did: at v3.9.0–v3.10.0,
`dist/schema.js` predated the `maker` alias `via` and `dist/names.js` predated
the latest market names. The forge's gate — which imports the contract from this
checkout's `dist/schema.js`, not from `src/` — then failed 4,086 times on an
asset that was completely correct.

A consumer installing by tag was never affected, because `prepare` rebuilds
`dist` from `src` at install time. Only tools reading the checkout directly were
misled. Fixed in v3.10.1.

**Always `npm run build:lib` before committing a release.** A guard that
compiles `src/` and diffs it against the committed build would close this for
good; it does not exist yet.

## Releases

The app that consumes this pins a **git tag**, not a branch. Pushing to `main`
therefore delivers *nothing* until a tag is pushed — v3.6.0 shipped untagged and
was never installable, while `main` looked perfectly current.

```bash
npm run build:lib                     # 1. or you ship a stale contract
# bump package.json version           # 2. it has drifted from the tag before
npm run validate && npm test          # 3. contract + 156 tests
git commit -am "feat(asset): …(vX.Y.Z)"
git tag vX.Y.Z
git push origin main && git push origin vX.Y.Z   # 4. BOTH, or it is invisible
```

Tags are lightweight and named `vX.Y.Z` (one stray `v2026.07.24` predates the
convention). CI rebuilds and redeploys Pages on every push to `main`.

## Corrections & submissions

Every record page has a **Report a correction** link that prefills a GitHub
issue with the record's identity. Verified corrections land in
`corrections/*.jsonl` — see [corrections/README.md](corrections/README.md) for
the row format (`set` to fix fields, `merge_into` to collapse duplicate
entities).

⚠️ **A correction does nothing until the forge re-runs `merge-catalog.mjs`.**
The overlay is applied post-merge with absolute precedence, so it is read by the
*merge* stage, not by publish. Re-running publish alone regenerates the asset
from the merged intermediate and silently ignores every correction written since
the last merge. This is not hypothetical: a 7-row large-format corrections file
sat in this repo unapplied across several releases, including v3.9.0.

After a release, verify a specific correction actually landed — `grep` its alias
in `data/gearbook/aliases.jsonl` — rather than assuming.

## Data updates

Replace the **four** JSONL files in `data/gearbook/` with a newly published
asset version and push; CI rebuilds and redeploys. Record ids are stable across
republishes, so deep links survive. The published files are regenerated from
upstream every time, which is why corrections must go through the overlay rather
than direct edits — a direct edit is overwritten by the next publish, with no
warning.

## Data notes

- The only outbound links are `manual_url` values (manual *hosting pages*,
  never direct PDFs — rendered as outbound links only) and the per-record
  correction-issue links.
- The app never edits data; corrections arrive as a new asset version.
- `confidence` reflects spec *completeness* only, surfaced as "partial specs".
- 1,036 known defects ship at contract v1 — mostly out-of-vocabulary enum values
  inherited from the source corpora. They are held at a ceiling by the forge's
  gate baseline, which fails the build if any count rises.

## License

MIT, per `package.json`. ⚠️ **There is no `LICENSE` file in this repo** despite
that declaration — worth adding before anyone relies on it.
