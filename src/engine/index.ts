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
  DEFAULT_WEIGHTS, AUTO, REVIEW,
} from './match.js'
export type { MatchResult, MatchDecision, ScoredEntry } from './match.js'

export { queryVariants as marketNameVariants, lensVariants } from './variants.js'
