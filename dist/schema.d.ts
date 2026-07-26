/**
 * The gearbook asset CONTRACT.
 *
 * This file is the promise the published asset makes, and the means to check
 * it. The same artifact is used at three checkpoints:
 *
 *   forge     gate before publish     "we will not ship a broken asset"
 *   library   test on build           "what we ship matches what we promise"
 *   consumer  CI on the installed dep "what we got is what was promised"
 *
 * A shape change therefore goes loud in all three places on the same day,
 * instead of surfacing months later as a wrong spec on a product page.
 *
 * Deliberately dependency-free — no ajv, no zod. The forge is plain .mjs with
 * no build step, and a schema that cannot run there is a schema that does not
 * get run. `ASSET_SCHEMA` is emitted as standard JSON Schema for tooling that
 * wants it; `validateAsset` is the executable version.
 */
export declare const MARKETS: readonly ["us", "intl", "eu", "jp"];
export type Market = (typeof MARKETS)[number];
/** How an alias came to exist. See `validateAsset` for why this matters. */
export declare const ALIAS_VIA: readonly ["name", "market", "superseded", "shorthand", "punctuation", "correction"];
export type AliasVia = (typeof ALIAS_VIA)[number];
export declare const CONFIDENCE: readonly ["high", "medium", "low"];
/**
 * How a body reaches a film format that is not its native one.
 *
 *   adapter  a purpose-made kit (Yashica 635's 35mm conversion)
 *   back     an interchangeable magazine (Bronica ETR 35mm and Polaroid backs)
 *   insert   a different film insert in the same magazine (Hasselblad A16)
 *   mask     a frame mask that changes the exposed area
 *   respool  no hardware — the film is the same, wound on another spool.
 *            This is the 620 case: 620 IS 120 emulsion on a thinner spool.
 */
export declare const TAKES_VIA: readonly ["adapter", "back", "insert", "mask", "respool"];
export type TakesVia = (typeof TAKES_VIA)[number];
/** Current contract version. Bumped only by a breaking asset change. */
export declare const ASSET_CONTRACT = 1;
export interface ValidationIssue {
    file: 'cameras' | 'lenses' | 'aliases' | 'redirects';
    line: number;
    /** Stable machine-readable code, so a gate can allow-list a known-soft one. */
    code: string;
    message: string;
}
export interface ValidationResult {
    ok: boolean;
    contract: number;
    counts: Record<string, number>;
    issues: ValidationIssue[];
}
/** JSON Schema for the row shapes, for editors and external tooling. */
export declare const ASSET_SCHEMA: {
    readonly $schema: "https://json-schema.org/draft/2020-12/schema";
    readonly title: "Gearbook asset contract v1";
    readonly $defs: {
        readonly record: {
            readonly type: "object";
            readonly required: readonly ["id", "name", "recommended_name", "gearbook_version", "confidence", "data"];
            readonly properties: {
                readonly id: {
                    readonly type: "string";
                    readonly pattern: "^[0-9a-f]{16}$";
                };
                readonly name: {
                    readonly type: "string";
                    readonly minLength: 1;
                };
                readonly recommended_name: {
                    readonly type: "string";
                    readonly minLength: 1;
                };
                readonly gearbook_version: {
                    readonly type: "string";
                    readonly pattern: "^\\d{4}-\\d{2}-\\d{2}$";
                };
                readonly confidence: {
                    readonly enum: readonly ["high", "medium", "low"];
                };
                readonly data: {
                    readonly type: "object";
                    readonly properties: {
                        readonly also_takes: {
                            readonly type: "array";
                            readonly minItems: 1;
                            readonly items: {
                                readonly type: "object";
                                readonly required: readonly ["format"];
                                readonly additionalProperties: false;
                                readonly properties: {
                                    readonly format: {
                                        readonly type: "string";
                                        readonly minLength: 1;
                                    };
                                    readonly frame_size: {
                                        readonly type: "string";
                                        readonly minLength: 1;
                                    };
                                    readonly via: {
                                        readonly enum: readonly ["adapter", "back", "insert", "mask", "respool"];
                                    };
                                };
                            };
                        };
                        readonly market_names: {
                            readonly type: "array";
                            readonly minItems: 2;
                            readonly items: {
                                readonly type: "object";
                                readonly required: readonly ["name", "market"];
                                readonly additionalProperties: false;
                                readonly properties: {
                                    readonly name: {
                                        readonly type: "string";
                                    };
                                    readonly market: {
                                        readonly enum: readonly ["us", "intl", "eu", "jp"];
                                    };
                                    readonly primary: {
                                        readonly const: true;
                                    };
                                };
                            };
                        };
                    };
                };
            };
        };
        readonly alias: {
            readonly type: "object";
            readonly required: readonly ["alias", "gearbook_kind", "gearbook_id", "via"];
            readonly additionalProperties: false;
            readonly properties: {
                readonly alias: {
                    readonly type: "string";
                    readonly minLength: 1;
                };
                readonly gearbook_kind: {
                    readonly enum: readonly ["camera", "lens"];
                };
                readonly gearbook_id: {
                    readonly type: "string";
                    readonly pattern: "^[0-9a-f]{16}$";
                };
                readonly via: {
                    readonly enum: readonly ["name", "market", "superseded", "shorthand", "punctuation", "correction"];
                };
                readonly market: {
                    readonly enum: readonly ["us", "intl", "eu", "jp"];
                };
            };
        };
        readonly redirect: {
            readonly type: "object";
            readonly required: readonly ["from_id", "from_name", "gearbook_kind", "to_id", "to_name"];
            readonly additionalProperties: false;
            readonly properties: {
                readonly from_id: {
                    readonly type: "string";
                    readonly pattern: "^[0-9a-f]{16}$";
                };
                readonly from_name: {
                    readonly type: "string";
                    readonly minLength: 1;
                };
                readonly gearbook_kind: {
                    readonly enum: readonly ["camera", "lens"];
                };
                readonly to_id: {
                    readonly type: "string";
                    readonly pattern: "^[0-9a-f]{16}$";
                };
                readonly to_name: {
                    readonly type: "string";
                    readonly minLength: 1;
                };
            };
        };
    };
};
export interface AssetInput {
    cameras: unknown[];
    lenses: unknown[];
    aliases: unknown[];
    redirects?: unknown[];
}
/**
 * Check a whole asset. Structural rules AND the cross-file invariants that are
 * the actual reason this exists — a row can be individually well-formed and
 * still be part of a broken asset.
 */
export declare function validateAsset(input: AssetInput): ValidationResult;
/** Render a result for a terminal — used by the forge gate and by CI. */
export declare function formatValidation(r: ValidationResult, label?: string): string;
//# sourceMappingURL=schema.d.ts.map