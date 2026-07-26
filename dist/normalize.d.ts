/** Normalize a raw alias or query string to a canonical token string. */
export declare function normalize(raw: string): string;
/** Normalize to a token array (used by the engine's per-token logic). */
export declare function tokenize(raw: string): string[];
export interface QueryVariant {
    tokens: string[];
    /** Pretty market-name of what got rewritten (e.g. "Stylus Epic"), for the explainer. */
    sourceLabel: string | null;
}
/** The literal query plus additive cross-market variants. Literal is always first. */
export declare function queryVariants(tokens: string[]): QueryVariant[];
/** URL slug for a display name (cosmetic — the id is authoritative). */
export declare function slugify(name: string): string;
//# sourceMappingURL=normalize.d.ts.map