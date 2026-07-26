# The Gearbook — Camera / Lens Spec Index

A fact-only reference index of cameras and lenses ("the gearbook"), used to
enrich inventory and auto-fill fields at intake (fuzzy-match a seller's
brand/model → known specs). Not to be confused with the public *catalog*
(Norris's storefront) — the gearbook is an internal reference dataset.

## Files

| File | Rows | Imports to |
|---|---|---|
| `cameras.jsonl` | ~17,400 | `gearbook_cameras` |
| `lenses.jsonl` | ~3,600 | `gearbook_lenses` |
| `aliases.jsonl` | ~49,500 | `gearbook_aliases` (typeahead / match) |
| `redirects.jsonl` | ~35 | `gearbook_redirects` (merged-away ids) |

One JSON object per line. Each gearbook row:

```json
{ "id": "<sha1(kind:normalized-name)[:16]>",
  "name": "Canon AE-1",
  "gearbook_version": "YYYY-MM-DD",
  "confidence": "high|medium|low",     // spec completeness, NOT certainty
  "data": { /* fact fields — null/empty fields omitted */ } }
```

Camera `data` fields: `manufacturer, camera_type, folding, medium, format,
frame_size, lens_mount, fixed_lens, shutter_type, shutter_speeds, metered,
meter_type, batteries, year_introduced, year_discontinued, sensor_*, country,
manual_url`. Lens `data` fields: `manufacturer, mount, focal_length,
focal_min_mm, focal_max_mm, lens_type, max_aperture, min_aperture, filter_size,
elements_groups, min_focus, year_*`.

`manual_url` links to the **page that hosts** an instruction manual (archive.org
or butkus.org), never a direct PDF — deliberate politeness.

Some records carry a `variants` array — the **collector-variant layer**:
`[{ "name", "tell", "premium"? }]`. `name` is the collector designation
("8-element", "F3/T", "S.S.C."), `tell` is how to identify it in hand, and
`premium: true` marks versions the market prices above the family baseline.
Matching stays family-level; variants exist so intake can ASK the tell and
listings can carry the token — a listing must never claim a premium variant
the seller hasn't confirmed.

## Cross-market names

The same camera was sold under different names in different markets — Minolta
compacts are Riva (intl) / Freedom (US) / Capios (JP), Pentax's are Espio
(intl) / IQZoom (US), Canon SLRs are EOS (intl) / Rebel (US) / Kiss (JP).
Sellers type the US name; this index is predominantly internationally named.

Records where the markets disagreed carry two extra fields:

```json
"market_names": [
  { "name": "Minolta Riva Zoom 105i",    "market": "intl", "primary": true },
  { "name": "Minolta Freedom Zoom 105i", "market": "us" }
],
"display_name": "Minolta Riva/Freedom Zoom 105i"
```

- `market ∈ us | intl | eu | jp`. `intl` means one export name for
  everywhere-but-the-US; a maker with distinct EU and JP names uses those.
- Exactly one entry is `primary`, and its `name` equals the record's `name`.
  Primary is the international name where the maker had one; where they had
  only regional names (Minolta's Maxxum/Dynax/α) it falls to US.
- `display_name` is what a person should SEE. It slash-folds when the names
  differ in exactly one token position and uses a parenthetical otherwise —
  `Canon Sure Shot Owl (Prima AF-7)`, because "Sure Shot/Prima Owl/AF-7" names
  a camera nobody sold. Both fields are **absent** when a camera had one name
  everywhere.

Every market name also ships as an `aliases.jsonl` row carrying a `market` tag,
so a US seller's string resolves and the UI can say *which* name it matched.

**`market_names` is not `country`.** Country is where a camera was BUILT; the
Riva and Freedom twins are both `country: "Japan"`. Different facts.

**Fabrication rule.** A market name ships only when it is corroborated — the
alternate name resolves to a real record, or it comes from the hand-authored
model table. A swap being derivable is not evidence a camera existed:
`Minolta Freedom Escort` swaps to `Minolta Riva Escort`, which was never sold.
Speculative swaps stay in the matcher's query-time expansion, where a wrong
guess only proposes a candidate the scorer then rejects.

## Stable identity

`id` is a deterministic hash of the normalized name, so re-publishing is
byte-stable and importers can key on `name` (UNIQUE) to preserve row IDs and
item↔gearbook links across re-imports.

**`display_name` is never an identity.** Only `name` is hashed into `id` and
only `name` is what the matcher tokenizes. A slash inside `name` would both
change the hash and cost the record its match: `normalize()` turns `/` into a
space, so the record tokenizes one word wider than anything a seller types, and
`sameCore()` — the gate that promotes a match to AUTO — can never fire.

`redirects.jsonl` maps a record that was merged away to the one that absorbed
it (`from_id`/`from_name` → `to_id`/`to_name`). Import it so an item already
linked to the old id keeps resolving; the merged-away name also survives as an
alias, since a redirect keeps an ID working but only an alias keeps a NAME
findable.
