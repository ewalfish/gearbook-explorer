// Public library API ("gearbook" package).
//
// Two engines, one data asset:
// - SearchEngine (search.ts): interactive typeahead — alias-prefix-primary,
//   stable under partial tokens. Use for as-you-type UIs.
// - matchOne / matchBatch (match.ts): batch linking of complete names with
//   auto / review / no-match decisions. Use for imports and enrichment.

export { SearchEngine, buildEngineInputs, damerauBounded } from './search.js'
export type { IndexEntry, RecordMeta, SearchHit } from './search.js'

export { normalize, tokenize, slugify, queryVariants } from './normalize.js'
export type { QueryVariant } from './normalize.js'

export { matchNormalize, matchTokens, digitSeqs } from './match-normalize.js'

export {
  parseJsonl, buildMatchCatalog, catalogFromJsonl,
} from './gearbook.js'
export type {
  Kind, GearbookRow, AliasRow, MatchEntry, MatchCatalog,
} from './gearbook.js'

export {
  matchOne, matchBatch, candidates, features, typoFix, sameCore, qualConflict,
  DEFAULT_WEIGHTS, DEFAULT_POLICY, AUTO, REVIEW,
} from './match.js'
export type { MatchResult, MatchDecision, ScoredEntry, MatchPolicy } from './match.js'

export { queryVariants as marketNameVariants, lensVariants } from './variants.js'

// ── The contract ────────────────────────────────────────────────────────────
// Shipped so the forge can gate on it before publishing and a consumer can
// verify the dependency it actually installed. One artifact, three checkpoints.
export {
  validateAsset, formatValidation, ASSET_SCHEMA, ASSET_CONTRACT, MARKETS, ALIAS_VIA, CONFIDENCE,
} from './schema.js'
export type { Market, AliasVia, ValidationResult, ValidationIssue, AssetInput } from './schema.js'

// ── Answers, not rows ───────────────────────────────────────────────────────
// What is this also called · does this stale id still resolve · why did that
// match · is there something a buyer must be told. Every consumer was deriving
// these from raw alias arrays, slightly differently.
export { names, otherMarketNames, buildRedirectIndex, explain } from './names.js'
export type { NameSet, NamedRecord, AliasLike, RedirectLike, RedirectIndex, MatchExplanation } from './names.js'

export { hazards, hasHazard } from './hazards.js'
export type { Hazard, HazardKind, HazardInput } from './hazards.js'
