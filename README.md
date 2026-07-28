# Gearbook

**`gearbook`** is an npm library and data asset: a fact-only spec index of
vintage cameras and lenses, two matching engines over it, a derivation layer
for the questions every consumer ends up asking, and a shipped, executable
contract for the data itself.

This repo also hosts the **Explorer** — a static reference SPA over the same
asset and search engine, live at
<https://ewalfish.github.io/gearbook-explorer/>. It is the demo consumer; the
package is the product.

## Install

```bash
# Pin an exact tag (deterministic):
npm install github:ewalfish/gearbook-explorer#v3.28.0

# …or float within the major (data refreshes arrive without a bump):
npm install github:ewalfish/gearbook-explorer#semver:^3.0.0
```

Never track `main` — releases exist only as tags (see
[Versioning](#versioning)). The package ships `data/gearbook/` plus compiled
engines; `prepare` runs the library build at install time, so a git install
compiles from source on your machine.

## What you get

- **The asset** — four JSONL files under `data/gearbook/`, also importable by
  subpath (`gearbook/data/cameras.jsonl` etc.): camera records, lens records,
  an alias table (every string that should resolve to a record), and redirects
  (merged-away ids → the surviving record, so stale links never rot). Current
  scale is roughly 17k cameras, 5k lenses, 65k aliases — `npm run validate`
  prints the exact counts for the copy you installed.
- **Two engines** — interactive typeahead and batch matching (below).
- **Derivation helpers** — names, redirects, match explanations, buyer hazards.
- **The contract** — schema and validator for the asset, shipped as code.

## Two engines, one data asset

- **`SearchEngine`** — interactive typeahead. Alias-prefix-primary, stable
  under partial tokens (results refine while typing, never flicker), with
  bounded per-token typo correction, cross-market name expansion
  (Stylus ↔ mju, Maxxum ↔ Dynax ↔ Alpha) and domain normalizations
  (µ-II, Rolleiflex 2,8, 5cm → 50mm, Mk II ↔ Mark 2). Use for as-you-type UIs.
- **`matchOne` / `matchBatch`** — batch linking of complete names with
  `auto` / `review` / `no-match` decisions (`AUTO = 0.9`, `REVIEW = 0.45`).
  Normalization → candidate generation → scored features, wrapped in
  deterministic confidence gates (same-core override, reissue/RF-SLR qualifier
  conflicts, lens family rule, subvariant specificity, ambiguity guard). Use
  for imports and enrichment.

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

Building the catalog takes ~0.4 s for the full asset and retains ~20 MB of
heap; a match runs in ~10 ms (measured on the v3.28 asset). Both engines are
dependency-free and run in Node or the browser — there is no `fs` inside the
library, you feed it file contents. Build the catalog **once**, in a
module-scope singleton.

## Answers, not rows

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

These work because aliases are not one thing: each alias row carries a `via`
field saying which kind it is — a genuine alternative name, a maker-dropped
shorthand, a machine-generated punctuation variant, a maker prepended to a
name that never carried one, a corrections-overlay entry, another market's
name, or a superseded former name. The full vocabulary ships as `ALIAS_VIA`;
`names()` is the reference reading of it (a person's "also known as" list
should never contain spelling variants).

## Hazards — derivation, not assertion

```ts
import { hazards, hasHazard } from 'gearbook'
```

Two things make a working vintage camera unusable to a buyer: **film that is
no longer made**, and a **mercury battery** banned since the 1990s (mercury
cells held a flat 1.35 V, so a modern 1.5 V alkaline skews the meter across
the whole range — a substitute needs an adapter or recalibration). Both are
derivable from fields the asset already carries (`data.format`,
`data.batteries`), so the derivation lives here, next to the data that proves
it — the storefront, the Explorer and an eBay description all state the same
true thing. Nothing here adds a fact to the asset; it reads two fields and
states a consequence a buyer would otherwise have to already know.

## The contract

```ts
import { validateAsset, formatValidation, ASSET_CONTRACT, ASSET_SCHEMA } from 'gearbook'

const result = validateAsset({ cameras, lenses, aliases, redirects })
console.log(formatValidation(result, 'my copy'))
// ✓ my copy satisfies contract v1  (cameras:…  lenses:…  …)
```

The contract is **shipped**, not just documented, so one artifact serves three
checkpoints: the upstream pipeline gates on it before publishing, this repo's
tests assert the shipped asset satisfies it, and you can verify the dependency
you actually installed. `ASSET_SCHEMA` is the JSON Schema for anything outside
TypeScript; `validateAsset` is the executable version. A known set of
out-of-vocabulary values inherited from the source corpora ships at contract
v1; the publisher's gate holds that set at a ceiling, failing the build if any
count rises.

## Versioning

Releases are lightweight git tags named `vX.Y.Z`. What a bump means to you as
a consumer:

- **Patch / minor** — a data refresh or additive API. Record ids are stable;
  deep links and stored `gearbook_id` references keep resolving. A
  `#semver:^3.0.0` install can take these freely.
- **Major** — **ids may be re-keyed** (records renamed or merged). Anything
  that stores gearbook ids must follow `redirects.jsonl` to migrate them.
  Adopt a major deliberately, never automatically.
- The contract version (`ASSET_CONTRACT`) bumps only on a breaking change to
  the asset *shape*, independently of package versions.

One stray tag, `v2026.07.24`, predates the naming convention and sorts above
every real release — it is a mislabeled early asset, not the newest version.
Tooling that discovers releases by tag must check the tagged `package.json`
version rather than trusting the tag name.

## Corrections

Every Explorer record page has a **Report a correction** link that prefills a
GitHub issue with the record's identity. Verified corrections land in
`corrections/*.jsonl` — see [corrections/README.md](corrections/README.md) for
the row format (`set` to fix fields, `merge_into` to collapse duplicate
entities) — and reach the published asset on the next upstream merge. The
published JSONL is regenerated wholesale each release, so never edit it
directly; a direct edit is silently overwritten.

## Develop

```bash
npm ci
npm run dev        # builds data + starts vite dev server
npm test           # unit tests — they run on the real data
npm run validate   # contract check over data/gearbook/ — no build needed
npm run build      # data + typecheck + production bundle
npm run build:lib  # library build → dist/ (also runs automatically on install)
```

No runtime dependencies. Vanilla TypeScript + Vite; the Explorer is fully
static (hash-routed, GitHub Pages).

Cutting a release has real failure modes (a committed `dist/`, tag-only
delivery, the corrections overlay) — the checklist and the incidents behind it
are in [RELEASING.md](RELEASING.md).

## License

[MIT](LICENSE)
