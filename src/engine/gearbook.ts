// Gearbook asset access — parse the published JSONL files and build the
// reference catalog the batch matcher runs against. Runtime-agnostic: no fs,
// no fetch — callers hand in file contents as strings (or pre-parsed rows).

import { matchNormalize, matchTokens } from './match-normalize.js'

export type Kind = 'camera' | 'lens'

/** One published gearbook record (cameras.jsonl / lenses.jsonl row). */
export interface GearbookRow {
  id: string
  name: string
  /**
   * What to SHOW a person. Contract v1 guarantees it on every record — equal to
   * `name` unless the markets disagreed — so consumers never write a fallback.
   * Optional here only so a caller can hand in rows from an older asset.
   */
  recommended_name?: string
  gearbook_version?: string
  confidence?: string
  data?: Record<string, unknown>
}

/** One alias row (aliases.jsonl). */
export interface AliasRow {
  alias: string
  gearbook_kind: Kind
  gearbook_id: string
  /**
   * How this alias came to exist — see ALIAS_VIA in schema.ts. An anonymous
   * alias forces every consumer to guess whether a hit was another market's
   * name, a spelling difference, or an abbreviation; those are three different
   * questions to put to a reviewer.
   */
  via?: 'name' | 'market' | 'superseded' | 'shorthand' | 'punctuation' | 'correction' | 'maker'
  /**
   * Which market this spelling belongs to, where known — lets a result explain
   * itself ("matched Freedom Zoom 105i, the US name") rather than silently
   * resolving to a name the searcher never typed. Only set when `via` is
   * 'market', and not always even then (a slash label names two markets without
   * saying which side is which).
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
  /**
   * Provenance for each alias, index-aligned with `aliases`.
   *
   * Carried on the entry rather than looked up from a module-level map so that
   * "which KIND of alias matched" stays a pure question about the catalog you
   * were handed — testable with a fixture, and impossible to answer against the
   * wrong asset. Entries are `undefined` for an asset older than contract v1.
   */
  aliasMeta: (AliasMeta | undefined)[]
}

/** How one alias came to exist. Mirrors the alias row's own fields. */
export interface AliasMeta {
  via: NonNullable<AliasRow['via']>
  market?: AliasRow['market']
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
  const aliasesBySlug = new Map<string, { alias: string; meta?: AliasMeta }[]>()
  for (const a of aliases) {
    if (!a.gearbook_id || !a.alias) continue
    let list = aliasesBySlug.get(a.gearbook_id)
    if (!list) {
      list = []
      aliasesBySlug.set(a.gearbook_id, list)
    }
    list.push({ alias: a.alias, meta: a.via ? { via: a.via, ...(a.market ? { market: a.market } : {}) } : undefined })
  }

  const entries: MatchEntry[] = []
  for (const [rows, kind] of [
    [cameras, 'camera'],
    [lenses, 'lens'],
  ] as const) {
    for (const r of rows) {
      if (!r.name || !r.id) continue
      // the record's own name doubles as an alias row in the asset — drop it
      const aliasList = (aliasesBySlug.get(r.id) ?? []).filter((a) => a.alias !== r.name)
      entries.push({
        id: r.id,
        kind,
        title: r.name,
        norm: matchNormalize(r.name),
        aliases: aliasList.map((a) => a.alias),
        aliasNorms: aliasList.map((a) => matchNormalize(a.alias)),
        aliasMeta: aliasList.map((a) => a.meta),
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
