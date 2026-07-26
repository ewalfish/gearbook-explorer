# Corrections overlay

Accepted data corrections live here as JSONL, one correction per line. The
gearbook build ingests this directory as a top-trust source on every data
release, so corrections survive rebuilds — **do not edit the published
`data/gearbook/*.jsonl` files directly**; those are regenerated and direct
edits would be overwritten.

## How to submit

Open a [correction issue](../../issues/new?template=correction.yml) (every
record page on the Explorer has a "Report a correction" link that prefills
one). Maintainers verify the evidence and land the row here; the fix appears
in the next published data version.

PRs adding rows directly to `corrections/*.jsonl` are also welcome — include
the evidence in the PR description.

## Row format

```json
{"name": "Canon AE-1 Program", "kind": "camera", "set": {"format": "35mm"}, "note": "manual p.4"}
```

- `name` — the record's display name, exactly as published (this is the join key)
- `kind` — `camera` or `lens`
- `set` — object of field → corrected value; use `null` to blank a wrong value
- `aliases` — optional array of alias strings to add for this record
- `note` — short evidence pointer (free text; shown nowhere, kept for review)

Values for the enumerated fields (`format`, `medium`, `camera_type`,
`shutter_type`, `sensor_*`) must come from the vocabulary in
`camera.schema.json`. 35mm film is **`35mm`**, not `135` — an out-of-vocabulary
value is not rejected, it ships and raises the gate's `vocab_*` count, which
fails the next release.

When you blank a field, blank the ones that only made sense alongside it:
setting `medium` to `film` while leaving `sensor_size` behind trips the gate's
`film_with_sensor_facts` check.

Rows are grouped into files by topic or batch (e.g. `2026-07-formats.jsonl`) —
file names have no semantic meaning.

## Merging a duplicate record

`set` fixes a wrong **field**. When upstream shipped the same product twice
under two spellings, the problem is a wrong **entity count**, and the fix is
`merge_into`:

```json
{"name": "Fujifilm GX680", "kind": "camera", "merge_into": "Fuji GX680", "note": "same camera, two spellings"}
```

- The losing record's facts fold into the winner — re-attributed, not discarded,
  so anything the duplicate knew that the winner didn't is kept.
- The losing **name** becomes a supersession, published as a row in
  `redirects.jsonl`. Ids already published against the duplicate keep resolving,
  so external links and stored matches don't break.
- It cannot mint: **both names must already exist**. A directive whose target
  doesn't resolve is warned and skipped, leaving the duplicate standing rather
  than quietly creating a new entity.
- Chains resolve (`A → B`, `B → C` ⇒ `A → C`), so row order never changes the
  outcome. A cycle is warned and dropped.
- A row carrying `merge_into` is an entity directive and its `set` is ignored —
  correct fields on the surviving name in a separate row.
