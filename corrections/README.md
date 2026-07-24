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
{"name": "Canon AE-1 Program", "kind": "camera", "set": {"format": "135"}, "note": "manual p.4"}
```

- `name` — the record's display name, exactly as published (this is the join key)
- `kind` — `camera` or `lens`
- `set` — object of field → corrected value; use `null` to blank a wrong value
- `aliases` — optional array of alias strings to add for this record
- `note` — short evidence pointer (free text; shown nowhere, kept for review)

Rows are grouped into files by topic or batch (e.g. `2026-07-formats.jsonl`) —
file names have no semantic meaning.
