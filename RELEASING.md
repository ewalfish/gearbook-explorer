# Releasing

The operational side of this repo: how a release actually ships, and the three
ways it has silently failed to. Consumers don't need this file; anyone cutting
a release does.

## The checklist

```bash
npm run build:lib                     # 1. or you ship a stale contract (see below)
# bump package.json version           # 2. it has drifted from the tag before
npm run validate && npm test          # 3. contract + full test suite
git commit -am "feat(asset): …(vX.Y.Z)"
git tag vX.Y.Z
git push origin main && git push origin vX.Y.Z   # 4. BOTH, or it is invisible
```

Tags are lightweight and named `vX.Y.Z`. CI rebuilds and redeploys the
Explorer (GitHub Pages) on every push to `main`.

## Failure mode 1 — a release exists only as a tag

The consuming app pins a git tag, not a branch. Pushing to `main` therefore
delivers **nothing** until the tag is pushed. This has happened: v3.6.0
shipped untagged and was never installable, while `main` looked perfectly
current. Step 4 pushes both for that reason.

One stray tag predates the convention: `v2026.07.24` is a mislabeled early
asset that sorts above every real release. Any tooling that discovers releases
by tag must read the tagged commit's `package.json` and require it to agree
with the tag name.

## Failure mode 2 — `dist/` is committed, and nothing tests it

Every test imports from `src/`; **not one line loads `dist/`**. So a stale
committed build ships silently, and did: at v3.9.0–v3.10.0, `dist/schema.js`
predated the `maker` alias `via` and `dist/names.js` predated the latest
market names. The upstream pipeline's gate — which imports the contract from
this checkout's `dist/schema.js`, not from `src/` — then failed 4,086 times on
an asset that was completely correct.

Consumers installing by tag were never affected (`prepare` rebuilds `dist`
from `src` at install time); only tools reading the checkout directly were
misled. Fixed in v3.10.1, but the class of bug is open: **always
`npm run build:lib` before committing a release** (checklist step 1). A CI
guard that compiles `src/` and diffs it against the committed build would
close this for good; it does not exist yet.

## Failure mode 3 — corrections apply at MERGE, not publish

The corrections overlay (`corrections/*.jsonl`) is read by the upstream
pipeline's *merge* stage, which applies it post-merge with absolute
precedence. Re-running publish alone regenerates the asset from the merged
intermediate and silently ignores every correction written since the last
merge. Not hypothetical: a 7-row large-format corrections file sat in this
repo unapplied across several releases, including v3.9.0.

After a release that should carry a correction, verify it actually landed —
`grep` its alias in `data/gearbook/aliases.jsonl` — rather than assuming.

## Data updates

A new asset version replaces the **four** JSONL files in `data/gearbook/`;
push, and CI rebuilds and redeploys. Record ids are stable across republishes
within a major, so deep links survive. The published files are regenerated
from upstream every time, which is why corrections must go through the overlay
rather than direct edits — a direct edit is overwritten by the next publish,
with no warning.
