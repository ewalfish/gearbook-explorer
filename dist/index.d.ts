export { SearchEngine, buildEngineInputs, damerauBounded } from './search.js';
export type { IndexEntry, RecordMeta, SearchHit } from './search.js';
export { normalize, tokenize, slugify, queryVariants } from './normalize.js';
export type { QueryVariant } from './normalize.js';
export { matchNormalize, matchTokens, digitSeqs } from './match-normalize.js';
export { parseJsonl, buildMatchCatalog, catalogFromJsonl, } from './gearbook.js';
export type { Kind, GearbookRow, AliasRow, RedirectRow, AliasMeta, MatchEntry, MatchCatalog, } from './gearbook.js';
export { matchOne, matchBatch, candidates, features, typoFix, sameCore, qualConflict, DEFAULT_WEIGHTS, DEFAULT_POLICY, AUTO, REVIEW, } from './match.js';
export type { MatchResult, MatchDecision, ScoredEntry, MatchPolicy } from './match.js';
export { queryVariants as marketNameVariants, lensVariants } from './variants.js';
export { validateAsset, formatValidation, ASSET_SCHEMA, ASSET_CONTRACT, MARKETS, ALIAS_VIA, CONFIDENCE, BODY_TYPES, TRAITS, MOUNTS_FIELD, BODY_TYPE_LABELS, TRAIT_LABELS, } from './schema.js';
export type { Market, AliasVia, BodyType, Trait, ValidationResult, ValidationIssue, AssetInput } from './schema.js';
export { names, otherMarketNames, buildRedirectIndex, explain } from './names.js';
export type { NameSet, NamedRecord, AliasLike, RedirectLike, RedirectIndex, MatchExplanation } from './names.js';
export { hazards, hasHazard } from './hazards.js';
export type { Hazard, HazardKind, HazardInput } from './hazards.js';
//# sourceMappingURL=index.d.ts.map