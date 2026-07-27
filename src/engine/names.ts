/**
 * Names, redirects, and match explanations — the questions consumers actually
 * ask, answered here instead of in each of them.
 *
 * Before this, a consumer that wanted "what else is this camera called?" had to
 * know that aliases live in a separate file, are keyed by id, carry a market
 * tag on some rows, and that a `via: 'punctuation'` row is not a name a human
 * would ever say. That is library work, and every consumer was doing it
 * slightly differently.
 */

import type { AliasVia, Market } from './schema.js'
import type { Kind } from './gearbook.js'

/** One published record, as far as this module needs to care. */
export interface NamedRecord {
  id: string
  name: string
  recommended_name?: string
  data?: { market_names?: { name: string; market: Market; primary?: boolean }[] }
}

export interface AliasLike {
  alias: string
  gearbook_kind: Kind
  gearbook_id: string
  via: AliasVia
  market?: Market
}

export interface RedirectLike {
  from_id: string
  from_name: string
  gearbook_kind: Kind
  to_id: string
  to_name: string
}

export interface NameSet {
  /** The canonical name — identity, hashing, matching. Never show a slash form here. */
  canonical: string
  /** What to SHOW a person. Equals `canonical` unless markets disagreed. */
  recommended: string
  /** Every market's name for this camera, primary first. Empty when it had one name everywhere. */
  markets: { name: string; market: Market; primary?: boolean }[]
  /** Names a person might plausibly type — excludes punctuation-only spellings. */
  spoken: string[]
}

// 'maker' is included: a maker-prefixed name ("Showa Kogaku Leotax D IV") is
// what a seller types, which is the whole reason those aliases exist. It is not
// punctuation noise like 'MjuII'.
const HUMAN_VIA: AliasVia[] = ['name', 'market', 'superseded', 'correction', 'maker']

/**
 * Everything this record is called.
 *
 * `spoken` deliberately drops `punctuation` and `shorthand` aliases: they exist
 * so a search box matches "MjuII", not so a product page offers it as another
 * name for the camera. Showing a buyer "also sold as Olympus MjuII" is noise
 * that reads like a mistake.
 */
export function names(rec: NamedRecord, aliases: AliasLike[] = []): NameSet {
  const markets = rec.data?.market_names ?? []
  const spoken = new Set<string>([rec.name])
  for (const m of markets) spoken.add(m.name)
  for (const a of aliases) {
    if (a.gearbook_id !== rec.id) continue
    if (HUMAN_VIA.includes(a.via)) spoken.add(a.alias)
  }
  return {
    canonical: rec.name,
    recommended: rec.recommended_name ?? rec.name,
    markets: [...markets].sort((a, b) => (b.primary ? 1 : 0) - (a.primary ? 1 : 0)),
    spoken: [...spoken],
  }
}

/** Just the other markets' names, for an "also sold as" line. */
export function otherMarketNames(rec: NamedRecord): { name: string; market: Market }[] {
  return (rec.data?.market_names ?? []).filter((m) => m.name !== rec.name)
}

export interface RedirectIndex {
  /** Follow a possibly-stale id to the record that absorbed it. */
  resolveId(id: string, kind?: Kind): string
  /** True when this id was merged away. */
  isRedirected(id: string): boolean
  size: number
}

/**
 * Build a redirect resolver.
 *
 * The asset's ids were stable until the twin merge, which removed 65 of them —
 * so a consumer holding `items.gearbook_id` can now be pointing at a record
 * that no longer exists. Resolving is one call; without it, upgrading the
 * dependency silently orphans links.
 *
 * Chains are followed (A→B→C) and cycles are broken rather than hung on: a
 * malformed release should degrade to "unresolved", never to an infinite loop
 * inside a consumer's import.
 */
export function buildRedirectIndex(redirects: RedirectLike[]): RedirectIndex {
  const byId = new Map<string, RedirectLike>()
  for (const r of redirects) byId.set(`${r.gearbook_kind}:${r.from_id}`, r)
  const anyId = new Set(redirects.map((r) => r.from_id))

  const resolveId = (id: string, kind?: Kind): string => {
    let cur = id
    const seen = new Set<string>([cur])
    for (let hops = 0; hops < 16; hops++) {
      const hit = kind ? byId.get(`${kind}:${cur}`) : (byId.get(`camera:${cur}`) ?? byId.get(`lens:${cur}`))
      if (!hit) return cur
      if (seen.has(hit.to_id)) return cur // cycle — stop where we are
      seen.add(hit.to_id)
      cur = hit.to_id
    }
    return cur
  }
  return { resolveId, isRedirected: (id) => anyId.has(id), size: redirects.length }
}

export interface MatchExplanation {
  /** One line, safe to show a person. */
  text: string
  /** The alias that actually matched, when it differs from the record name. */
  matchedAlias?: string
  via?: AliasVia
  market?: Market
}

const MARKET_LABEL: Record<Market, string> = {
  us: 'the US name', intl: 'the international name', eu: 'the European name', jp: 'the Japanese name',
}

/**
 * Say why a query landed on a record, in words a person can act on.
 *
 * A search that silently answers "Canon EOS Rebel G" to a query for "EOS 500N"
 * looks like a bug unless it says why. The same string serves the storefront,
 * the Explorer, and the review queue — so a reviewer and a buyer are told the
 * same thing.
 */
export function explain(rec: NamedRecord, matched?: AliasLike): MatchExplanation {
  const shown = rec.recommended_name ?? rec.name
  if (!matched || matched.alias === shown) return { text: shown }
  switch (matched.via) {
    case 'market':
      return {
        text: matched.market
          ? `matched “${matched.alias}” — ${MARKET_LABEL[matched.market]}`
          : `matched “${matched.alias}” — another market’s name`,
        matchedAlias: matched.alias, via: matched.via, market: matched.market,
      }
    case 'superseded':
      return { text: `matched “${matched.alias}” — an earlier name for this record`, matchedAlias: matched.alias, via: matched.via }
    case 'correction':
      return { text: `matched “${matched.alias}”`, matchedAlias: matched.alias, via: matched.via }
    case 'shorthand':
      return { text: `matched the shorthand “${matched.alias}”`, matchedAlias: matched.alias, via: matched.via }
    default:
      return { text: `matched “${matched.alias}”`, matchedAlias: matched.alias, via: matched.via }
  }
}
