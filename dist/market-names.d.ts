/** Which market a name belongs to. `intl` = one export name for everywhere-but-US. */
export type Market = 'us' | 'intl' | 'eu' | 'jp';
/** One market's name for a camera, as carried on a gearbook record. */
export interface MarketName {
    name: string;
    market: Market;
    /** Exactly one entry per record is primary, and its `name` equals `record.name`. */
    primary?: boolean;
}
/** Preference order when picking a primary name or ordering a merged label. */
export declare const MARKET_ORDER: Market[];
/**
 * Brand-scoped TOKEN groups: within this brand these words denote the SAME
 * series across markets and the model number is preserved (ZX-5 ⇄ MZ-5).
 */
export declare const MARKET_TOKENS: Record<string, Partial<Record<Market, string>>[]>;
/**
 * Brand-scoped whole-MODEL groups — the model number itself differs across
 * markets, so no token rule can derive them.
 *
 * ── WHY THE BIG PER-MODEL TABLES ARE NOT HERE ───────────────────────────────
 * The forge carries ~130 further pairs transcribed from camera-wiki's Canon
 * Sure Shot/Prima/Autoboy index and Wikipedia's Digital IXUS correspondence
 * table (Sure Shot Max = Prima 5 = Autoboy Mini; IXUS 285 HS = ELPH 360 HS).
 * Those reach this app as shipped ALIAS ROWS, which the search index already
 * ingests — so the names are findable here with no query rewriting at all.
 *
 * Duplicating them as query-side rewrites would only crowd the 24-variant
 * budget in variants.ts, whose applyMap has no longest-match rule and would
 * emit the shorter model's foreign name alongside the right one. Keep this
 * table to pairs that help a PARTIAL or misspelled query, where no exact alias
 * can match.
 */
export declare const MARKET_MODELS: Record<string, Partial<Record<Market, string>>[]>;
/**
 * Every market group as a flat list of interchangeable spellings, brand
 * dropped. This is the form the free-text search box wants: it has no brand
 * context when the user has typed three characters, so it rewrites on the
 * token alone and lets scoring sort out the rest.
 */
export declare function marketSynonymGroups(): string[][];
/** The market groups for one brand, as ordered token pairs (both directions). */
export declare function marketTokenSwaps(brand: string): [string, string][];
/**
 * The whole-model market maps for one brand, as `from -> to` (both directions).
 *
 * Hyphens are flattened to spaces because the matcher applies these against its
 * own flattened form ("minolta x 570"), where a literal `x-570` key can never
 * match — a silent no-op that hid every hyphenated pair in this table.
 */
export declare function marketModelMap(brand: string): Record<string, string[]>;
//# sourceMappingURL=market-names.d.ts.map