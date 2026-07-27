# The Gearbook — moved out of this repo (2026-07-26)

The camera/lens spec index used to live here as three committed JSONL files
(~14 MB). It now ships as a **pinned dependency**:

```json
"gearbook": "github:ewalfish/gearbook-explorer#v2026.07.24"
```

**To refresh the spec index, bump that version in `package.json`.** That's the
whole procedure. It shows up in a diff, it's reviewable, and it's revertible —
none of which was true of hand-copying three files between two checkouts.

Resolve it in code through `lib/gearbook/asset.ts`, never by path:

```ts
import { readGearbookAsset } from '@/lib/gearbook/asset'
const cameras = readGearbookAsset('cameras')
```

Set `GEARBOOK_DIR` to a local gearbook checkout's `data/gearbook/` when you
need to work against an unpublished asset.

## What lives where

| | |
|---|---|
| **The data** — ~17.4k cameras, ~3.6k lenses, ~49.2k aliases | the `gearbook` dependency ([ewalfish/gearbook-explorer](https://github.com/ewalfish/gearbook-explorer)) |
| **The matcher** — scoring, gates, thresholds, tuning | `lib/gearbook/` in this repo |

The matcher is deliberately ours: it has to be tuned against real inventory,
and only this repo has any. Expect it to diverge from the copy in the public
repo; don't sync it back.

Not to be confused with the **catalog**, which is Norris's public storefront
(`/catalog`, `include_in_catalog`, `components/catalog/*`). The spec index was
renamed "gearbook" on 2026-07-22 to end exactly that confusion.

## Record shape

```json
{ "id": "<sha1(kind:normalized-name)[:16]>",
  "name": "Canon AE-1",
  "gearbook_version": "YYYY-MM-DD",
  "confidence": "high|medium|low",     // spec COMPLETENESS, not certainty
  "data": { /* fact fields — null/empty fields omitted */ } }
```

`id` is a deterministic hash of the normalized name, so republishing is
byte-stable and importers can key on `name` (UNIQUE) to preserve row ids and
item↔gearbook links across re-imports.

`manual_url` links to the **page that hosts** an instruction manual
(archive.org or butkus.org), never a direct PDF — deliberate politeness.

Some records carry a `variants` array: `[{ "name", "tell", "premium"? }]`.
Matching stays family-level; variants exist so intake can ASK the tell and
listings can carry the token. A listing must never claim a premium variant the
seller hasn't confirmed.

`confidence` measures how complete a spec sheet is, **not** how trustworthy it
is. It must never render to a buyer as a quality badge.

## Anonymity

Facts only. The asset carries **no** information about how it was assembled —
no source names, no URLs beyond the intentional `manual_url` links, no
attribution, no per-field provenance. `tests/gearbook-asset.test.ts` lints the
resolved asset on every CI run and pre-push, so a bad publish upstream fails
here rather than shipping.
