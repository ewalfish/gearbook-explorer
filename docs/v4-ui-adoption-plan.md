# Explorer SPA — gearbook 4.0 facet/trait adoption plan

Written 2026-07-31. The data asset and contract shipped v4.0.0 (`body_type` +
`traits`); the SPA has not adopted them anywhere a user can see. Since the
Explorer is the reference demo of how to consume the library, it is currently
demonstrating the deprecated usage.

## Current state (measured on the checked-in v4.0.0 asset)

Coverage across 17,431 cameras:

| Field | Records | Notes |
|---|---|---|
| `body_type` | 16,211 (93%) | viewfinder 6,816 · compact 2,294 · slr 2,031 · view 1,365 · rangefinder 1,211 · box 921 · tlr 770 · other 371 · mirrorless 202 · bridge 198 · pinhole 25 · pseudo-tlr 7 |
| `traits` | 9,231 (53%) | point-and-shoot 4,718 · folding 2,234 · motorized 1,823 · subminiature 791 · stereo 422 · detective 320 · toy 270 · movie 127 · underwater 102 · panoramic 95 · press 71 · instant-print 47 · aerial 33 · magazine 12 |
| `camera_type` (deprecated) | 17,403 | still derived and emitted; **drops in contract v2** |
| `medium` | film 12,946 · plate 2,199 · digital 1,783 · instant 334 | `instant` is a medium now, not a camera_type |

## Every place the SPA still reads the deprecated model

1. **Catalog tuple `type` column** — `scripts/pipeline.ts:140` ships
   `camera_type`. The browse "Type" facet, chip labels, and related-items
   ranking all read this column.
2. **`factsLine`** — `pipeline.ts:65,69` renders `typeLabel(d.camera_type)`;
   `TYPE_LABELS` still maps `folder`, `instant`, `half-frame`, and
   `point-and-shoot → compact` (a mapping v4 made false: point-and-shoot is a
   trait, and the record usually *has* a stated finder).
3. **Browse "Type" facet** — `src/views.ts:423`. Flattened values: a folding
   rangefinder appears under exactly one of its facts; `point-and-shoot`
   (4,518) buries the finder axis for a quarter of the corpus.
4. **Spec sheet Type row** — `views.ts:129` (`prettyType(d.camera_type)`).
5. **Related-items affinity** — `views.ts:282–292` sorts same-manufacturer
   records by `camera_type` equality.
6. **Curated landing tiles** — `pipeline.ts:168–191`: `?type=tlr`,
   `?type=rangefinder`, `?type=slr`, and "Instant cameras" via
   `camera_type === 'instant'` (326) when the v4 fact is `medium === 'instant'`
   (334 — the counts already disagree).
7. `src/types.ts` declares `body_type`/`traits` correctly — that is the only
   place they appear. `views.ts`/`ui.ts`/`pipeline.ts` never read them.

Also thin, independent of v4: browse offers only Manufacturer / Type /
Film format / Mount groups, each capped at top-10 with no "show all";
`medium` filters via URL but has no sidebar group; nothing demonstrates
multi-valued AND filtering, which is the headline capability the traits model
adds (and which `mounts` on lenses also wants).

## Plan

### Stage 1 — pipeline (data plumbing)

- Extend `CatalogRowTuple`: `type` becomes `body_type` for cameras (stays
  `lens_type` for lenses); append a `traits: string[]` column. Cost is small —
  traits are short enums on 53% of camera rows.
- Rewrite `factsLine` from the v4 axes: `format + traits + body_type` →
  "35mm folding rangefinder · f/3.5 · 1934". Drop `TYPE_LABELS`' dead values.
- Re-express curated tiles in v4 vocabulary: `?body=tlr`, `?body=rangefinder`,
  instant via `?medium=instant`, and add at least one traits tile so the
  landing page demos the new axis (candidates: Folding 2,234 · Subminiature
  791 · Stereo 422).
- **Label source (decision):** export `BODY_TYPE_LABELS` / `TRAIT_LABELS` from
  the library (`src/engine/schema.ts`, next to the vocabularies) so consumers
  stop hand-rolling display names — camera-inventory currently keeps its own
  copy in `lib/specs/vocabulary.ts` and could later drop it. Alternative:
  keep labels app-local and accept the duplication.

### Stage 2 — browse UI

- Split "Type" into **Body type** (cameras only) and **Lens type** (lenses
  only), scoped by the active kind the way the storefront scopes facets.
- New **Traits** group: multi-valued, AND semantics, URL form
  `?traits=folding+stereo`, each chip removable independently. This is the
  demo of the capability — the storefront's `traits` facet is the reference
  implementation for the semantics.
- New **Medium** group (film / plate / digital / instant).
- **Back-compat:** keep `?type=` resolving — map old camera_type values onto
  the new params (`type=tlr` → `body=tlr`, `type=folder` → `traits=folding`,
  `type=instant` → `medium=instant`, `type=point-and-shoot` →
  `traits=point-and-shoot`) so shared links and the old curated hrefs don't
  die. Same move as the storefront's `?ctype=` mapping.
- Unfilled ≠ excluded: 1,220 cameras have no `body_type` — they stay in
  results until a value is actually picked (same degradation rule the
  storefront's facet model uses).
- Optional in the same pass: "Show all" expansion beyond top-10 per group.

### Stage 3 — spec sheet + related

- Type row shows the two axes honestly: body_type as the Type value, traits
  as linked chips (each chip links into `#/browse?traits=…`), so every spec
  sheet advertises the browse capability.
- Related-items affinity keys on `body_type`, with trait overlap as a
  tiebreak.

### Stage 4 — tests and the deprecation guard

- Pipeline tests: tuple column contents, `factsLine` goldens for the tricky
  cases (digital, folding+stereo, point-and-shoot-with-finder), curated
  counts nonzero.
- A guard test that `src/` (outside `types.ts` deprecation notices and the
  `?type=` compat mapping) never reads `camera_type` / `folding` / `mount` —
  this repo's code is what consumers copy, and contract v2 removes those
  fields. The guard is what makes the adoption stick.

### Explicitly out of scope here

- Lens-side filter enrichment (focal-length buckets, max-aperture) — worth
  doing, but it is not v4 adoption; separate errand.
- camera-inventory changes — its storefront already has Body type + Traits
  facets; the only touchpoint is the optional shared-labels export above.

### Sequencing / release

Stages 1–3 are one coherent app+pipeline change; Stage 4 rides with it. No
data change, so per RELEASING.md this is a minor app release (the asset ships
by tag; nothing here needs a new data version). Stage 1's tuple change and
Stage 2's UI must land together — the tuple column swap breaks the old Type
facet the moment it ships.
