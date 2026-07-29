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

export const MARKETS = ['us', 'intl', 'eu', 'jp'] as const
export type Market = (typeof MARKETS)[number]

/**
 * How an alias came to exist. See `validateAsset` for why this matters.
 *
 * `maker` (asset 2026-07-27) is the mirror of `shorthand`: where shorthand
 * drops a maker the name already leads with, maker PREPENDS one the name never
 * carried. 15% of camera records have a `manufacturer` appearing nowhere in
 * their name — "Leotax D IV" is made by Shōwa Kōgaku, "Opema" by Meopta — and a
 * seller types the maker because it is engraved on the camera. Unlike
 * shorthand, it is a name a person genuinely says, so it counts as spoken
 * (names.ts HUMAN_VIA).
 */
export const ALIAS_VIA = ['name', 'market', 'superseded', 'shorthand', 'punctuation', 'correction', 'maker'] as const
export type AliasVia = (typeof ALIAS_VIA)[number]

export const CONFIDENCE = ['high', 'medium', 'low'] as const

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
export const TAKES_VIA = ['adapter', 'back', 'insert', 'mask', 'respool'] as const
export type TakesVia = (typeof TAKES_VIA)[number]

/**
 * The VIEWING/FOCUSING system — how the photographer sees and focuses the shot.
 * Single-valued: a camera has exactly one finder, or we do not know it.
 *
 * This is half of the replacement for `camera_type`, which collapsed four
 * independent questions into one field and therefore could not say "folding
 * SLR" at all. `traits` is the other half. See TRAITS.
 *
 * `other` means "we looked and it is none of these", which is a different fact
 * from `null` ("not known") — 357 records depend on that distinction.
 * `pinhole` is here rather than in TRAITS because a pinhole IS the finder-less
 * focusing system, not a modifier on one. `pseudo-tlr` likewise: its whole
 * point is that the top lens is NOT a taking-lens reflex, so calling it a `tlr`
 * with a modifier would make the finder axis say something false.
 */
export const BODY_TYPES = [
  'slr', 'tlr', 'pseudo-tlr', 'rangefinder', 'viewfinder', 'view', 'box',
  'point-and-shoot', 'bridge', 'mirrorless', 'pinhole', 'other',
] as const
export type BodyType = (typeof BODY_TYPES)[number]

/**
 * Orthogonal modifiers — form factor and purpose. Multi-valued, because a
 * `klapp stéréo` is genuinely both folding and stereo, and the old model made
 * that unsayable: 425 records in the source corpus name two axes and shipped
 * with one.
 *
 * NOT here: anything another field already answers. `instant` and `digital`
 * belong to `medium`, `dslr`/`mirrorless` restated `medium` and are now
 * `body_type` + `medium`, and film size belongs to `format`. A trait that
 * duplicates a field is how the original defect started.
 *
 * `half-frame` was in this list for one release and is the rule proving itself:
 * it is a `frame_size` (18×24 mm), and shipping it as a trait too meant 60 of
 * 68 records stated the same fact twice, 4 stated it in contradiction with
 * their own frame_size (one of them 24×36 mm — full frame), and 101 records
 * with an 18×24 frame_size never got the trait, so it was useless as a filter
 * as well. One fact, one field.
 *
 * `motorized` is likewise absent: no source states it, and a vocabulary value
 * nothing can populate is a promise the asset does not keep.
 */
export const TRAITS = [
  // form factor
  'folding', 'subminiature', 'panoramic', 'stereo',
  // purpose / genre
  'press', 'aerial', 'detective', 'movie', 'underwater', 'toy', 'magazine',
  // output — NOT a medium. A camera that exposes a sensor and prints on ZINK
  // paper captures digitally; the instant part happens afterwards. `medium`
  // answers what the image is captured ON, so these are medium=digital, and
  // this trait is where the printing lives. ZINK is the tell: dye-crystal
  // thermal paper, no emulsion, no development — never a capture medium.
  'instant-print',
] as const
export type Trait = (typeof TRAITS)[number]

/** Current contract version. Bumped only by a breaking asset change. */
export const ASSET_CONTRACT = 1

export interface ValidationIssue {
  file: 'cameras' | 'lenses' | 'aliases' | 'redirects'
  line: number
  /** Stable machine-readable code, so a gate can allow-list a known-soft one. */
  code: string
  message: string
}

export interface ValidationResult {
  ok: boolean
  contract: number
  counts: Record<string, number>
  issues: ValidationIssue[]
}

/** JSON Schema for the row shapes, for editors and external tooling. */
export const ASSET_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: `Gearbook asset contract v${ASSET_CONTRACT}`,
  $defs: {
    record: {
      type: 'object',
      required: ['id', 'name', 'recommended_name', 'gearbook_version', 'confidence', 'data'],
      properties: {
        id: { type: 'string', pattern: '^[0-9a-f]{16}$' },
        name: { type: 'string', minLength: 1 },
        recommended_name: { type: 'string', minLength: 1 },
        gearbook_version: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        confidence: { enum: [...CONFIDENCE] },
        data: {
          type: 'object',
          properties: {
            // Other film this body accepts, and what it takes to get there.
            // `format` stays the NATIVE one, so nothing downstream changes
            // meaning — this is strictly additional. `data` was already an open
            // object, so old consumers ignore the field and old assets still
            // validate: no contract bump, no coordinated release.
            //
            // The case that forced it: the Yashica 635 shoots 6×6 on 120 AND
            // 24×36 on 35mm with its adapter kit, and one `format` string can
            // only say one of those. It generalises — Bronica ETR/SQ 35mm and
            // Polaroid backs, Rolleikin kits, Hasselblad inserts, RB67/RZ67 645
            // backs — and most usefully to the 386 records whose native format
            // is 620, which is 120 film on a thinner spool.
            also_takes: {
              type: 'array', minItems: 1,
              items: {
                type: 'object', required: ['format'], additionalProperties: false,
                properties: {
                  format: { type: 'string', minLength: 1 },
                  frame_size: { type: 'string', minLength: 1 },
                  via: { enum: [...TAKES_VIA] },
                },
              },
            },
            // The two type axes that replace `camera_type` (cameras only).
            // Additive: `camera_type` and `folding` still ship, derived, until
            // the major that removes them — so old consumers keep working and
            // this arrives as a minor the app adopts without a coordinated
            // release. See BODY_TYPES / TRAITS.
            body_type: { enum: [...BODY_TYPES] },
            traits: { type: 'array', minItems: 1, uniqueItems: true, items: { enum: [...TRAITS] } },
            market_names: {
              type: 'array', minItems: 2,
              items: {
                type: 'object', required: ['name', 'market'], additionalProperties: false,
                properties: { name: { type: 'string' }, market: { enum: [...MARKETS] }, primary: { const: true } },
              },
            },
          },
        },
      },
    },
    alias: {
      type: 'object',
      required: ['alias', 'gearbook_kind', 'gearbook_id', 'via'],
      additionalProperties: false,
      properties: {
        alias: { type: 'string', minLength: 1 },
        gearbook_kind: { enum: ['camera', 'lens'] },
        gearbook_id: { type: 'string', pattern: '^[0-9a-f]{16}$' },
        via: { enum: [...ALIAS_VIA] },
        market: { enum: [...MARKETS] },
      },
    },
    redirect: {
      type: 'object',
      required: ['from_id', 'from_name', 'gearbook_kind', 'to_id', 'to_name'],
      additionalProperties: false,
      properties: {
        from_id: { type: 'string', pattern: '^[0-9a-f]{16}$' },
        from_name: { type: 'string', minLength: 1 },
        gearbook_kind: { enum: ['camera', 'lens'] },
        to_id: { type: 'string', pattern: '^[0-9a-f]{16}$' },
        to_name: { type: 'string', minLength: 1 },
      },
    },
  },
} as const

const HEX16 = /^[0-9a-f]{16}$/
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

export interface AssetInput {
  cameras: unknown[]
  lenses: unknown[]
  aliases: unknown[]
  redirects?: unknown[]
}

/**
 * Check a whole asset. Structural rules AND the cross-file invariants that are
 * the actual reason this exists — a row can be individually well-formed and
 * still be part of a broken asset.
 */
export function validateAsset(input: AssetInput): ValidationResult {
  const issues: ValidationIssue[] = []
  const add = (file: ValidationIssue['file'], line: number, code: string, message: string) =>
    issues.push({ file, line, code, message })

  const ids = new Map<string, string>()   // `${kind}:${id}` -> name
  const names = new Set<string>()

  for (const [file, rows, kind] of [
    ['cameras', input.cameras, 'camera'],
    ['lenses', input.lenses, 'lens'],
  ] as const) {
    rows.forEach((raw, i) => {
      const line = i + 1
      const r = raw as Record<string, unknown>
      if (!r || typeof r !== 'object') return add(file, line, 'row.not-object', 'row is not an object')
      if (!isStr(r.id) || !HEX16.test(r.id as string)) add(file, line, 'id.shape', `id must be 16 hex chars, got ${JSON.stringify(r.id)}`)
      if (!isStr(r.name)) add(file, line, 'name.missing', 'name is required')
      // The whole point of shipping it on every row: a consumer must never need
      // a fallback. An absent one here is a promise quietly broken.
      if (!isStr(r.recommended_name)) add(file, line, 'recommended_name.missing', `recommended_name is required on every record (${String(r.name)})`)
      if (!CONFIDENCE.includes(r.confidence as never)) add(file, line, 'confidence.enum', `confidence must be one of ${CONFIDENCE.join('|')}`)
      if (!r.data || typeof r.data !== 'object') add(file, line, 'data.missing', 'data object is required')

      if (isStr(r.id)) {
        const key = `${kind}:${r.id}`
        if (ids.has(key)) add(file, line, 'id.duplicate', `duplicate id ${r.id}`)
        ids.set(key, String(r.name))
      }
      // `name` is the import UNIQUE key — a collision silently drops a record
      // on import rather than failing, which is the worst possible failure.
      if (isStr(r.name)) {
        const key = `${kind}:${String(r.name).toLowerCase()}`
        if (names.has(key)) add(file, line, 'name.duplicate', `duplicate name ${r.name}`)
        names.add(key)
      }

      const mn = (r.data as Record<string, unknown> | undefined)?.market_names
      if (mn !== undefined) {
        if (!Array.isArray(mn) || mn.length < 2) {
          add(file, line, 'market_names.shape', 'market_names must list 2+ names or be absent')
        } else {
          const primaries = mn.filter((m) => (m as { primary?: boolean })?.primary)
          if (primaries.length !== 1) add(file, line, 'market_names.primary', `expected exactly 1 primary, got ${primaries.length}`)
          else if ((primaries[0] as { name?: string }).name !== r.name) {
            add(file, line, 'market_names.primary-mismatch', `primary market name must equal the record name (${r.name})`)
          }
          for (const m of mn as { name?: string; market?: string }[]) {
            if (!isStr(m?.name)) add(file, line, 'market_names.name', 'market entry missing name')
            if (!MARKETS.includes(m?.market as never)) add(file, line, 'market_names.market', `unknown market ${JSON.stringify(m?.market)}`)
          }
        }
      }

      // ── the type axes ────────────────────────────────────────────────────
      // Cameras only; a lens carrying them means a camera rule leaked onto the
      // wrong kind, which has happened before with market aliases.
      const data = (r.data ?? {}) as Record<string, unknown>
      const bt = data.body_type
      const tr = data.traits
      if (kind === 'lens') {
        if (bt !== undefined) add(file, line, 'body_type.on-lens', 'body_type is a camera field')
        if (tr !== undefined) add(file, line, 'traits.on-lens', 'traits is a camera field')
      } else {
        if (bt !== undefined && !BODY_TYPES.includes(bt as never)) {
          add(file, line, 'body_type.enum', `body_type ${JSON.stringify(bt)} is not in the vocabulary`)
        }
        if (tr !== undefined) {
          if (!Array.isArray(tr) || tr.length === 0) {
            add(file, line, 'traits.shape', 'traits must be a non-empty array or absent')
          } else {
            const seen = new Set<string>()
            for (const t of tr as unknown[]) {
              if (!TRAITS.includes(t as never)) add(file, line, 'traits.enum', `trait ${JSON.stringify(t)} is not in the vocabulary`)
              if (seen.has(String(t))) add(file, line, 'traits.duplicate', `trait ${JSON.stringify(t)} listed twice`)
              seen.add(String(t))
            }
            // Sorted on the wire so a diff of two asset builds shows real
            // changes, not reordering.
            const sorted = [...(tr as string[])].map(String).sort()
            if (sorted.join(' ') !== (tr as string[]).map(String).join(' ')) {
              add(file, line, 'traits.unsorted', 'traits must be sorted')
            }
          }
        }
        // The deprecated `folding` boolean and the `folding` trait are two
        // spellings of one fact for as long as both ship. Disagreeing is the
        // original defect wearing new clothes — 26 records said `folder` with
        // folding=0 before the decomposition and nobody noticed for months.
        // Only once the axes ship on a record: a pre-decomposition asset has
        // `folding` and no `traits`, and that is not a contradiction, it is the
        // state we are migrating out of.
        const hasTrait = Array.isArray(tr) && (tr as unknown[]).includes('folding')
        if (tr !== undefined && data.folding !== undefined && data.folding !== null) {
          const flag = data.folding === 1 || data.folding === true
          if (flag !== hasTrait) {
            add(file, line, 'folding.contradiction', `folding=${JSON.stringify(data.folding)} but traits ${hasTrait ? 'has' : 'lacks'} "folding"`)
          }
        }
      }
    })
  }

  // ── aliases ───────────────────────────────────────────────────────────────
  const aliasesByRecord = new Map<string, Set<string>>()
  input.aliases.forEach((raw, i) => {
    const line = i + 1
    const a = raw as Record<string, unknown>
    if (!a || typeof a !== 'object') return add('aliases', line, 'row.not-object', 'row is not an object')
    if (!isStr(a.alias)) add('aliases', line, 'alias.missing', 'alias is required')
    if (a.gearbook_kind !== 'camera' && a.gearbook_kind !== 'lens') add('aliases', line, 'kind.enum', 'gearbook_kind must be camera|lens')
    // v1 renamed this from `gearbook_slug`; catch a stale producer loudly
    if ('gearbook_slug' in a) add('aliases', line, 'alias.legacy-slug', 'gearbook_slug was renamed to gearbook_id in contract v1')
    if (!isStr(a.gearbook_id) || !HEX16.test(a.gearbook_id as string)) add('aliases', line, 'alias.id', 'gearbook_id must be 16 hex chars')
    if (!ALIAS_VIA.includes(a.via as never)) add('aliases', line, 'alias.via', `via must be one of ${ALIAS_VIA.join('|')}`)
    if (a.market !== undefined && !MARKETS.includes(a.market as never)) add('aliases', line, 'alias.market', `unknown market ${JSON.stringify(a.market)}`)
    // a market-tagged alias that is not a market alias is a mislabel
    if (a.market !== undefined && a.via !== 'market') add('aliases', line, 'alias.market-via', `market tag on a via=${String(a.via)} alias`)
    // A market alias is a NAME a camera was sold under. Two things it can
    // never be:
    //  - a multi-name label. "Canon Photura/Epoca/Photura" was produced by
    //    rewriting one side of an already-merged name and leaving the rest;
    //    nobody types it and no camera is called it.
    //  - attached to a lens. Cross-market naming is a camera phenomenon here;
    //    a lens market alias means a camera rule leaked onto the wrong kind
    //    (it produced "Minolta RF Rokkor-X-570 mm f/8" from the X-570 body).
    if (a.via === 'market' && /[/;]/.test(String(a.alias))) {
      add('aliases', line, 'alias.market-multiname', `market alias "${String(a.alias)}" is a multi-name label`)
    }
    if (a.via === 'market' && a.gearbook_kind === 'lens') {
      add('aliases', line, 'alias.market-lens', `lens carries a market alias "${String(a.alias)}"`)
    }

    const key = `${String(a.gearbook_kind)}:${String(a.gearbook_id)}`
    if (isStr(a.gearbook_id) && !ids.has(key)) add('aliases', line, 'alias.orphan', `alias "${String(a.alias)}" points at no record`)
    if (!aliasesByRecord.has(key)) aliasesByRecord.set(key, new Set())
    aliasesByRecord.get(key)!.add(String(a.alias).toLowerCase())
  })

  // Every market name must be reachable by typing it. A market_names entry with
  // no alias row is a name we claim the camera has and cannot then find — the
  // exact failure the cross-market work existed to remove.
  for (const [file, rows, kind] of [
    ['cameras', input.cameras, 'camera'],
    ['lenses', input.lenses, 'lens'],
  ] as const) {
    rows.forEach((raw, i) => {
      const r = raw as { id?: string; data?: { market_names?: { name: string }[] } }
      for (const m of r?.data?.market_names ?? []) {
        if (!aliasesByRecord.get(`${kind}:${r.id}`)?.has(m.name.toLowerCase())) {
          add(file, i + 1, 'market_name.unreachable', `market name "${m.name}" has no alias row`)
        }
      }
    })
  }

  // ── redirects ─────────────────────────────────────────────────────────────
  // A redirect table has to be a FUNCTION. Two rows sharing a from_id give a
  // stale link two destinations, and every resolver is last-writer-wins, so it
  // silently picks by emission order — "Nikon Nikomat" resolved to the
  // Nikkormat FT purely because that row came second.
  const redirectSources = new Map<string, Set<string>>()
  for (const raw of input.redirects ?? []) {
    const r = raw as Record<string, unknown>
    const k = `${String(r?.gearbook_kind)}:${String(r?.from_id)}`
    if (!redirectSources.has(k)) redirectSources.set(k, new Set())
    redirectSources.get(k)!.add(String(r?.to_id))
  }
  for (const [k, targets] of redirectSources) {
    if (targets.size > 1) add('redirects', 0, 'redirect.ambiguous', `${k} redirects to ${targets.size} different records`)
  }

  for (const [i, raw] of (input.redirects ?? []).entries()) {
    const line = i + 1
    const r = raw as Record<string, unknown>
    if (!r || typeof r !== 'object') { add('redirects', line, 'row.not-object', 'row is not an object'); continue }
    for (const f of ['from_id', 'from_name', 'to_id', 'to_name'] as const) {
      if (!isStr(r[f])) add('redirects', line, 'redirect.field', `${f} is required`)
    }
    if (r.gearbook_kind !== 'camera' && r.gearbook_kind !== 'lens') add('redirects', line, 'redirect.kind', 'gearbook_kind must be camera|lens')
    if (r.from_id === r.to_id) add('redirects', line, 'redirect.self', `${String(r.from_name)} redirects to itself`)
    // A redirect exists so a stored id keeps resolving. One pointing nowhere is
    // worse than none: the consumer follows it and lands on nothing.
    if (!ids.has(`${String(r.gearbook_kind)}:${String(r.to_id)}`)) {
      add('redirects', line, 'redirect.dangling', `${String(r.from_name)} -> ${String(r.to_name)}: target is not in the asset`)
    }
    if (ids.has(`${String(r.gearbook_kind)}:${String(r.from_id)}`)) {
      add('redirects', line, 'redirect.live-source', `${String(r.from_name)} is redirected yet still a live record`)
    }
  }

  return {
    ok: issues.length === 0,
    contract: ASSET_CONTRACT,
    counts: {
      cameras: input.cameras.length,
      lenses: input.lenses.length,
      aliases: input.aliases.length,
      redirects: (input.redirects ?? []).length,
    },
    issues,
  }
}

/** Render a result for a terminal — used by the forge gate and by CI. */
export function formatValidation(r: ValidationResult, label = 'gearbook asset'): string {
  const counts = Object.entries(r.counts).map(([k, v]) => `${k}:${v}`).join('  ')
  if (r.ok) return `✓ ${label} satisfies contract v${r.contract}  (${counts})`
  const byCode = new Map<string, number>()
  for (const i of r.issues) byCode.set(i.code, (byCode.get(i.code) ?? 0) + 1)
  const lines = [
    `✗ ${label} FAILS contract v${r.contract} — ${r.issues.length} issue(s)  (${counts})`,
    ...[...byCode.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `    ${String(n).padStart(6)}  ${c}`),
    '',
    ...r.issues.slice(0, 15).map((i) => `    ${i.file}:${i.line}  ${i.code}  ${i.message}`),
  ]
  if (r.issues.length > 15) lines.push(`    … and ${r.issues.length - 15} more`)
  return lines.join('\n')
}
