// ── the deprecation guard ───────────────────────────────────────────────────
// This repo is the reference consumer of the gearbook library: whatever it
// does is what a reader copies. Contract v2 removes camera_type, folding and
// the singular lens `mount` string — replaced by body_type, traits ∋
// 'folding', and mounts[] respectively. This test is what keeps the demo
// demonstrating the SUPPORTED usage instead of quietly reaching back for a
// field it exists to retire people off of.
//
// Failing this test means new code reached for a deprecated field — use
// body_type / traits / mounts instead. If a file genuinely needs to name a
// deprecated field (the vocabulary's own declaration, the schema's own
// contract checks on it, or the one permitted back-compat shim), add it to
// ALLOWLIST below with a reason. Do not widen a regex or delete an assertion
// to make this pass — that is exactly the drift the guard exists to catch.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const SRC = join(__dirname, '..', 'src')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (entry.endsWith('.ts')) out.push(p)
  }
  return out
}

type PatternKey = 'camera_type' | 'folding' | 'mount'

interface AllowlistEntry {
  /** Path relative to src/, forward-slashed. */
  file: string
  patterns: PatternKey[]
  reason: string
}

// Editing this array IS the mechanism for adding an exception — there is no
// other way to silence one of the assertions below for a given file.
const ALLOWLIST: AllowlistEntry[] = [
  {
    file: 'types.ts',
    patterns: ['camera_type', 'folding', 'mount'],
    reason: 'declares the three deprecated fields on GearRecord[\'data\'] with an @deprecated '
      + 'JSDoc notice — the declaration IS the deprecation notice, not a read site',
  },
  {
    file: 'legacy-params.ts',
    patterns: ['camera_type'],
    reason: 'the one file outside types.ts permitted to know camera_type-era VALUES '
      + '(body_type / trait strings like \'folder\', \'instant\') so old ?type= links keep '
      + 'resolving — it maps values through BODY_TYPES/TRAITS and never reads a literal '
      + 'camera_type, folding or mount field off a record',
  },
  {
    file: 'engine/schema.ts',
    patterns: ['camera_type', 'folding', 'mount'],
    reason: 'the contract that DEFINES these deprecated fields and validates their internal '
      + 'consistency against the fields that replaced them (the folding flag vs. the folding '
      + 'trait, the derived mount string vs. the mounts array) — this file is the source of '
      + 'the vocabulary, not a consumer reaching for a deprecated read',
  },
]

function exemption(relPath: string, key: PatternKey): string | undefined {
  return ALLOWLIST.find((e) => e.file === relPath && e.patterns.includes(key))?.reason
}

const files = walk(SRC).map((abs) => ({ abs, rel: relative(SRC, abs).split('\\').join('/') }))

function offenders(pattern: RegExp, key: PatternKey): string[] {
  return files
    .filter(({ rel }) => !exemption(rel, key))
    .filter(({ abs }) => pattern.test(readFileSync(abs, 'utf8')))
    .map(({ rel }) => rel)
}

describe('deprecation guard — src/ never reaches for a retired gearbook field', () => {
  it('finds at least one .ts file to check', () => {
    // A guard over zero files passes vacuously and protects nothing — this
    // is what would catch SRC pointing at the wrong directory.
    expect(files.length).toBeGreaterThan(5)
  })

  it('never reads the deprecated camera_type field outside the allowlist', () => {
    const bad = offenders(/\.camera_type\b|\bcamera_type:/, 'camera_type')
    expect(bad, 'files reading the deprecated camera_type field — use body_type + traits').toEqual([])
  })

  it('never reads the deprecated folding flag outside the allowlist', () => {
    const bad = offenders(/\.folding\b/, 'folding')
    expect(bad, 'files reading the deprecated folding flag — use traits ∋ \'folding\'').toEqual([])
  })

  it('never reads the deprecated singular lens mount string outside the allowlist', () => {
    // The `mounts` ARRAY is the supported field and is deliberately not
    // matched by this pattern — only the derived, joined singular string.
    const bad = offenders(/\bdata\.mount\b|\bd\.mount\b/, 'mount')
    expect(bad, 'files reading the deprecated singular mount string — use mounts[]').toEqual([])
  })

  it('the allowlist names only files that actually exist under src/', () => {
    // Catches a stale entry (e.g. a file later deleted or renamed) so the
    // allowlist doesn't quietly protect nothing.
    const known = new Set(files.map((f) => f.rel))
    const stale = ALLOWLIST.filter((e) => !known.has(e.file)).map((e) => e.file)
    expect(stale, 'allowlist entries naming files that no longer exist under src/').toEqual([])
  })
})
