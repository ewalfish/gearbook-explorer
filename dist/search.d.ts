import type { Kind } from './gearbook.js';
export interface IndexEntry {
    n: string;
    k: Kind;
    id: string;
    d: string;
}
export interface RecordMeta {
    name: string;
    confidence: 'h' | 'm' | 'l';
}
export interface SearchHit {
    id: string;
    kind: Kind;
    /** Alias text to show in the "matched → name" explainer, or null when the
     *  match was on the display name itself. */
    matchedAlias: string | null;
    corrected: boolean;
}
export declare class SearchEngine {
    private meta;
    private entries;
    /** Vocab of alias tokens, sorted, with postings into `entries`. */
    private vocab;
    private postings;
    /** first letter + length buckets bound the edit-distance scan (§5.2). */
    private buckets;
    constructor(entries: IndexEntry[], meta: Map<string, RecordMeta>);
    search(raw: string, limit?: number): SearchHit[];
    /** §5.5 ordering: tier, shorter alias first, confidence, cameras before lenses, name. */
    private compare;
    private collect;
    /** Entry indices whose alias contains a token starting with `tok`. */
    private entriesWithTokenPrefix;
    /** Per-token bounded Damerau-Levenshtein corrections (§5.1 rule 2):
     *  ≤1 edit for tokens <7 chars, ≤2 for 7+; first letter pinned for <6. */
    private correctedQueries;
    private hasVocabPrefix;
    private lowerBound;
}
/** Bounded optimal-string-alignment (Damerau-Levenshtein with adjacent
 *  transposition), early-exit when the running minimum exceeds `max`. */
export declare function damerauBounded(a: string, b: string, max: number): number;
/** Build engine inputs from the published index + catalog files. */
export declare function buildEngineInputs(entries: [string, 'c' | 'l', string, string][], catalogRows: [string, 'c' | 'l', string, ...unknown[]][], confidences?: Map<string, 'h' | 'm' | 'l'>): {
    entries: IndexEntry[];
    meta: Map<string, RecordMeta>;
};
//# sourceMappingURL=search.d.ts.map