export type Kind = 'camera' | 'lens';
/** One published gearbook record (cameras.jsonl / lenses.jsonl row). */
export interface GearbookRow {
    id: string;
    name: string;
    /**
     * What to SHOW a person. Contract v1 guarantees it on every record — equal to
     * `name` unless the markets disagreed — so consumers never write a fallback.
     * Optional here only so a caller can hand in rows from an older asset.
     */
    recommended_name?: string;
    gearbook_version?: string;
    confidence?: string;
    data?: Record<string, unknown>;
}
/** One alias row (aliases.jsonl). */
export interface AliasRow {
    alias: string;
    gearbook_kind: Kind;
    gearbook_id: string;
    /**
     * How this alias came to exist — see ALIAS_VIA in schema.ts. An anonymous
     * alias forces every consumer to guess whether a hit was another market's
     * name, a spelling difference, or an abbreviation; those are three different
     * questions to put to a reviewer.
     */
    via?: 'name' | 'market' | 'superseded' | 'shorthand' | 'punctuation' | 'correction';
    /**
     * Which market this spelling belongs to, where known — lets a result explain
     * itself ("matched Freedom Zoom 105i, the US name") rather than silently
     * resolving to a name the searcher never typed. Only set when `via` is
     * 'market', and not always even then (a slash label names two markets without
     * saying which side is which).
     */
    market?: 'us' | 'intl' | 'eu' | 'jp';
}
/**
 * One redirect row (redirects.jsonl) — a record that was merged away, and the
 * record that absorbed it. Keeps an already-stored `gearbook_id` resolvable
 * after a twin merge instead of orphaning whatever pointed at it.
 */
export interface RedirectRow {
    from_id: string;
    from_name: string;
    gearbook_kind: Kind;
    to_id: string;
    to_name: string;
}
/** A catalog entry as the batch matcher sees it. */
export interface MatchEntry {
    id: string;
    kind: Kind;
    title: string;
    /** normalized title (matcher normalization — see match.ts) */
    norm: string;
    aliases: string[];
    /** normalized aliases, precomputed at build time */
    aliasNorms: string[];
}
export interface MatchCatalog {
    entries: MatchEntry[];
    /** normalized title/alias → entry (first writer wins) */
    byNorm: Map<string, MatchEntry>;
    /** token → entry indices, for candidate generation */
    tokenIndex: Map<string, number[]>;
    /** title-token vocabulary with frequencies, for typo correction */
    vocab: Map<string, number>;
}
/** Parse a JSONL string, skipping blank/malformed lines. */
export declare function parseJsonl<T>(text: string): T[];
/** Build the batch-match catalog from parsed asset rows. */
export declare function buildMatchCatalog(cameras: GearbookRow[], lenses: GearbookRow[], aliases?: AliasRow[]): MatchCatalog;
/** Convenience: build the catalog straight from the three JSONL file contents. */
export declare function catalogFromJsonl(input: {
    camerasJsonl: string;
    lensesJsonl: string;
    aliasesJsonl?: string;
}): MatchCatalog;
//# sourceMappingURL=gearbook.d.ts.map