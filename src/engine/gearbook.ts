// Gearbook asset access — parse the published JSONL files and build the
// reference catalog the batch matcher runs against. Runtime-agnostic: no fs,
// no fetch — callers hand in file contents as strings (or pre-parsed rows).

import { matchNormalize, matchTokens } from './match-normalize.js'

export type Kind = 'camera' | 'lens'

/** One published gearbook record (cameras.jsonl / lenses.jsonl row). */
export interface GearbookRow {
  id: string
  name: string
  gearbook_version?: string
  confidence?: string
  data?: Record<string, unknown>
}

/** One alias row (aliases.jsonl). */
export interface AliasRow {
  alias: string
  gearbook_kind: Kind
  gearbook_slug: string
  /**
   * Which market this spelling belongs to, where known — lets a result explain
   * itself ("matched Freedom Zoom 105i, the US name") rather than silently
   * resolving to a name the searcher never typed. Absent on the punctuation and
   * abbreviation aliases, which belong to no market.
   */
  market?: 'us' | 'intl' | 'eu' | 'jp'
}

/**
 * One redirect row (redirects.jsonl) — a record that was merged away, and the
 * record that absorbed it. Keeps an already-stored `gearbook_id` resolvable
 * after a twin merge instead of orphaning whatever pointed at it.
 */
export interface RedirectRow {
  from_id: string
  from_name: string
  gearbook_kind: Kind
  to_id: string
  to_name: string
}

/** A catalog entry as the batch matcher sees it. */
export interface MatchEntry {
  id: string
  kind: Kind
  title: string
  /** normalized title (matcher normalization — see match.ts) */
  norm: string
  aliases: string[]
  /** normalized aliases, precomputed at build time */
  aliasNorms: string[]
}

export interface MatchCatalog {
  entries: MatchEntry[]
  /** normalized title/alias → entry (first writer wins) */
  byNorm: Map<string, MatchEntry>
  /** token → entry indices, for candidate generation */
  tokenIndex: Map<string, number[]>
  /** title-token vocabulary with frequencies, for typo correction */
  vocab: Map<string, number>
}

/** Parse a JSONL string, skipping blank/malformed lines. */
export function parseJsonl<T>(text: string): T[] {
  const out: T[] = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      out.push(JSON.parse(line) as T)
    } catch {
      /* skip malformed line */
    }
  }
  return out
}

/** Build the batch-match catalog from parsed asset rows. */
export function buildMatchCatalog(
  cameras: GearbookRow[],
  lenses: GearbookRow[],
  aliases: AliasRow[] = [],
): MatchCatalog {
  const aliasesBySlug = new Map<string, string[]>()
  for (const a of aliases) {
    if (!a.gearbook_slug || !a.alias) continue
    let list = aliasesBySlug.get(a.gearbook_slug)
    if (!list) {
      list = []
      aliasesBySlug.set(a.gearbook_slug, list)
    }
    list.push(a.alias)
  }

  const entries: MatchEntry[] = []
  for (const [rows, kind] of [
    [cameras, 'camera'],
    [lenses, 'lens'],
  ] as const) {
    for (const r of rows) {
      if (!r.name || !r.id) continue
      // the record's own name doubles as an alias row in the asset — drop it
      const aliasList = (aliasesBySlug.get(r.id) ?? []).filter((a) => a !== r.name)
      entries.push({
        id: r.id,
        kind,
        title: r.name,
        norm: matchNormalize(r.name),
        aliases: aliasList,
        aliasNorms: aliasList.map(matchNormalize),
      })
    }
  }

  const byNorm = new Map<string, MatchEntry>()
  for (const e of entries) {
    if (!byNorm.has(e.norm)) byNorm.set(e.norm, e)
    for (const n of e.aliasNorms) if (!byNorm.has(n)) byNorm.set(n, e)
  }

  // Token index over titles AND aliases — the published name may differ from
  // what a seller writes, but an alias usually bridges it.
  const tokenIndex = new Map<string, number[]>()
  entries.forEach((e, i) => {
    const toks = new Set<string>(matchTokens(e.title))
    for (const a of e.aliasNorms) for (const t of a.split(' ')) if (t) toks.add(t)
    for (const tok of toks) {
      let list = tokenIndex.get(tok)
      if (!list) {
        list = []
        tokenIndex.set(tok, list)
      }
      list.push(i)
    }
  })

  // Typo-correction vocabulary: title tokens only (alias rows include
  // generated variants that would skew frequencies).
  const vocab = new Map<string, number>()
  for (const e of entries) {
    for (const t of matchTokens(e.title)) {
      if (!/\d/.test(t) && t.length >= 3) vocab.set(t, (vocab.get(t) ?? 0) + 1)
    }
  }

  return { entries, byNorm, tokenIndex, vocab }
}

/** Convenience: build the catalog straight from the three JSONL file contents. */
export function catalogFromJsonl(input: {
  camerasJsonl: string
  lensesJsonl: string
  aliasesJsonl?: string
}): MatchCatalog {
  return buildMatchCatalog(
    parseJsonl<GearbookRow>(input.camerasJsonl),
    parseJsonl<GearbookRow>(input.lensesJsonl),
    input.aliasesJsonl ? parseJsonl<AliasRow>(input.aliasesJsonl) : [],
  )
}
