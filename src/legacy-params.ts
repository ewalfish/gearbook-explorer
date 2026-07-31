// Legacy `?type=` URL param compatibility.
//
// v4 split `camera_type` into `body_type` (single-valued, the finder) and
// `traits` (multi-valued, orthogonal modifiers) — see engine/schema.ts for
// why one field could not say both. Pre-v4 shared links and curated hrefs
// still carry `?type=slr`, `?type=folder`, `?type=instant`, and must keep
// resolving. This is the ONE file outside `types.ts` permitted to know the
// old camera_type vocabulary — a guard test enforces that boundary, so a
// value from this list must never leak into another src/ file again.
import { BODY_TYPES, TRAITS } from './engine/schema'

/**
 * Rewrite a legacy `?type=` param onto the v4 params it now means:
 *   value in BODY_TYPES  -> body=value
 *   value in TRAITS      -> traits += value
 *   'folder'             -> traits += folding
 *   'instant'             -> medium=instant
 *   'half-frame'          -> dropped (it's a frame_size fact, not a type)
 *   anything else         -> ltype=value (a freeform lens type)
 * Merges into any `traits` already on `params`, deduping. Every other param
 * passes through untouched. Pure — returns a new URLSearchParams.
 */
export function mapLegacyParams(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params)
  const legacy = next.get('type')
  if (legacy === null) return next
  next.delete('type')

  const addTrait = (t: string) => {
    const existing = (next.get('traits') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    if (!existing.includes(t)) existing.push(t)
    next.set('traits', existing.join(','))
  }

  if ((BODY_TYPES as readonly string[]).includes(legacy)) {
    next.set('body', legacy)
  } else if ((TRAITS as readonly string[]).includes(legacy)) {
    addTrait(legacy)
  } else if (legacy === 'folder') {
    addTrait('folding')
  } else if (legacy === 'instant') {
    next.set('medium', 'instant')
  } else if (legacy === 'half-frame') {
    // dropped on purpose — see schema.ts's note on half-frame's retirement
  } else {
    next.set('ltype', legacy)
  }

  return next
}
