import type { Kind, MatchCatalog, MatchEntry } from './gearbook.js';
/** Trained logistic-regression weights for the feature vector in features(). */
export declare const DEFAULT_WEIGHTS: number[];
/** Score ≥ AUTO ⇒ confident auto-link; ≥ REVIEW ⇒ worth human review. */
export declare const AUTO = 0.9;
export declare const REVIEW = 0.45;
/**
 * The tunable part of matching — and the ONLY part a consumer should need to
 * change.
 *
 * This split exists because the alternative was a fork: camera-inventory
 * vendored fourteen engine files so that these ten numbers could differ, and
 * everything else in them is a function of the ASSET'S shape, so it had to be
 * edited in two repos every time the asset changed.
 *
 * Mechanism (normalization, candidate generation, features, alias handling)
 * versions with the asset and lives here. Policy is tuned against real
 * inventory that only the consumer has, so it is passed in.
 */
export interface MatchPolicy {
    /** Logistic-regression weights for the 8-feature vector in features(). */
    weights?: number[];
    /** Score at or above which a link is taken without asking a person. */
    auto?: number;
    /** Score below which nothing is proposed at all. */
    review?: number;
}
export declare const DEFAULT_POLICY: Required<MatchPolicy>;
export type MatchDecision = 'auto' | 'review' | 'no-match';
export interface ScoredEntry {
    entry: MatchEntry;
    s: number;
}
export interface MatchResult {
    best: ScoredEntry | null;
    scored: ScoredEntry[];
    ambiguous: boolean;
    decision: MatchDecision;
}
export declare function sameCore(a: string, b: string): boolean;
export declare function qualConflict(rawQuery: string, rawTitle: string): boolean;
export declare function typoFix(query: string, catalog: MatchCatalog): string[] | null;
export declare function candidates(query: string, catalog: MatchCatalog, kind: Kind | null | undefined, limit?: number): {
    entry: MatchEntry;
    shared: number;
}[];
export declare function features(query: string, entry: MatchEntry): number[];
export declare function matchOne(query: string, catalog: MatchCatalog, kind?: Kind | null, policy?: MatchPolicy | number[]): MatchResult;
/** Convenience: match many items at once. */
export declare function matchBatch(items: {
    query: string;
    kind?: Kind | null;
}[], catalog: MatchCatalog, policy?: MatchPolicy | number[]): MatchResult[];
//# sourceMappingURL=match.d.ts.map