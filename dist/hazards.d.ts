/**
 * The two things that make a working vintage camera unusable to a buyer.
 *
 * Both are derivable from facts the asset already carries — `data.format` and
 * `data.batteries` — which is exactly why they belong in the library rather
 * than in one consumer's product page. Encoding "126 film has not been made in
 * decades" once, next to the data that proves it, means the storefront, the
 * Explorer and any eBay description say the same true thing.
 *
 * This is derivation, not assertion. Nothing here adds a fact to the asset; it
 * reads two fields and states a consequence a buyer would otherwise have to
 * know already.
 *
 * Measured against real stock: 143 of 953 confidently-linked cameras — 15% —
 * carry at least one of these. Saying so plainly costs the occasional sale and
 * prevents the return that would otherwise follow it.
 */
export type HazardKind = 'discontinued-film' | 'mercury-battery';
export interface Hazard {
    kind: HazardKind;
    /** Short label for a chip or badge. */
    label: string;
    /** One sentence for a product page or listing. Factual, no hedging, no scare. */
    detail: string;
    /** The value that triggered it, so a UI can show its work. */
    because: string;
}
export interface HazardInput {
    format?: string | null;
    batteries?: string[] | null;
}
/** Every hazard implied by a record's own facts. Empty for most cameras. */
export declare function hazards(data: HazardInput | null | undefined): Hazard[];
/** True when a buyer should be told something before purchasing. */
export declare const hasHazard: (data: HazardInput | null | undefined) => boolean;
//# sourceMappingURL=hazards.d.ts.map