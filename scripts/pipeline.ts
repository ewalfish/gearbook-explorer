// Build-time data pipeline (PRD §3.2). Reads the published Gearbook asset
// (data/gearbook/*.jsonl) and emits the static files the app fetches:
//
//   public/data/index.json     eager search index (normalization precomputed)
//   public/data/catalog.json   lite per-record rows (typeahead display, browse, related)
//   public/data/facets.json    landing-page counts + manufacturer directory
//   public/data/shards/XX.json full records keyed by 2-hex-char id prefix (lazy)
//
// Raw JSONL never ships to the browser.

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalize } from '../src/engine/normalize'
import { BODY_TYPE_LABELS, TRAIT_LABELS, TRAITS } from '../src/engine/schema'
import type { BodyType } from '../src/engine/schema'
import { fmtFocal } from '../src/format'
import type {
  GearRecord, IndexEntryTuple, CatalogRowTuple, CuratedEntry, Kind,
} from '../src/types'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(root, 'data', 'gearbook')
const outDir = join(root, 'public', 'data')

function readJsonl<T>(file: string): T[] {
  return readFileSync(join(srcDir, file), 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as T)
}

interface AliasRow {
  alias: string
  gearbook_kind: Kind
  gearbook_id: string
}

// Traits shown in the facts line, in TRAITS vocab order (not alphabetical —
// form factor first), capped at two: true multi-trait records are rare, and
// a facts line is a one-liner. `point-and-shoot` reads as stuttering next to
// a `compact` body label, so it is dropped there and shown for every other
// body_type. Lowercased for sentence position — see `caseForLine`.
function factsTraits(d: GearRecord['data']): string[] {
  const set = new Set(d.traits ?? [])
  if (d.body_type === 'compact') set.delete('point-and-shoot')
  return TRAITS.filter((t) => set.has(t)).slice(0, 2).map((t) => caseForLine(TRAIT_LABELS[t] ?? t))
}

// A vocab label is Title Case for standalone display (facet chips, filter
// pills). Mid-sentence in factsLine that reads as a capitalized pileup
// ("35mm Motorized Point & Shoot Viewfinder") — word salad, not a sentence.
// The three acronym body labels are an explicit exception, kept whole: "TLR"
// lowercased is unreadable, and "pseudo tlr" loses the acronym entirely.
const KEEP_LABEL_CASE = new Set(['SLR', 'TLR', 'Pseudo TLR'])
function caseForLine(label: string): string {
  if (KEEP_LABEL_CASE.has(label)) return label
  return label.charAt(0).toLowerCase() + label.slice(1)
}

/** The fact one-liner shown under a result row. Never carries the year — every
 *  row that shows this line ALSO right-aligns the year itself. */
export function factsLine(rec: GearRecord, kind: Kind): string {
  const d = rec.data
  const parts: string[] = []
  if (kind === 'camera') {
    const rawBodyLabel = d.body_type ? (BODY_TYPE_LABELS[d.body_type as BodyType] ?? d.body_type) : ''
    const bodyLabel = caseForLine(rawBodyLabel)
    if (d.medium === 'digital') {
      parts.push(`Digital ${bodyLabel || 'camera'}`.trim())
      if (d.sensor_resolution_mp) parts.push(`${d.sensor_resolution_mp}MP`)
    } else {
      const fmt = d.format && d.format !== 'digital' ? d.format : ''
      const traits = factsTraits(d)
      // The trait words glue to the front (format + traits read as one
      // phrase — "35mm motorized point & shoot"); a ' · ' separates that
      // phrase from the body label only when both are present, so a
      // traits-only or body-only record doesn't get a dangling separator.
      const front = [fmt, ...traits].filter(Boolean).join(' ')
      parts.push([front, bodyLabel].filter(Boolean).join(' · '))
      const fl = d.fixed_lens
      if (fl) {
        let focal = fmtFocal(fl.focal_length, fl.focal_min_mm, fl.focal_max_mm)
        if (fl.focal_min_mm && fl.focal_max_mm && fl.focal_min_mm !== fl.focal_max_mm) focal += ' zoom'
        const ap = fl.max_aperture ?? ''
        if (focal || ap) parts.push([focal, ap].filter(Boolean).join(' '))
      }
    }
  } else {
    const focal = fmtFocal(d.focal_length, d.focal_min_mm, d.focal_max_mm)
    if (focal || d.max_aperture) parts.push([focal, d.max_aperture].filter(Boolean).join(' '))
    if (d.mounts?.length) parts.push(d.mounts[0])
  }
  return parts.filter(Boolean).join(' · ')
}

function mountsOf(rec: GearRecord, kind: Kind): string[] {
  if (kind === 'camera') {
    const raw = rec.data.lens_mount
    if (!raw) return []
    return raw.split(',').map((m) => m.trim()).filter(Boolean)
  }
  return rec.data.mounts ?? []
}

export function buildAll() {
  const cameras = readJsonl<GearRecord>('cameras.jsonl')
  const lenses = readJsonl<GearRecord>('lenses.jsonl')
  const aliases = readJsonl<AliasRow>('aliases.jsonl')

  const version = cameras[0]?.gearbook_version ?? 'unknown'
  const byId = new Map<string, { rec: GearRecord; kind: Kind }>()
  for (const rec of cameras) byId.set(rec.id, { rec, kind: 'camera' })
  for (const rec of lenses) byId.set(rec.id, { rec, kind: 'lens' })

  // ── Search index: every alias row + every record name, normalized ────────
  const entries: IndexEntryTuple[] = []
  const seen = new Set<string>()
  const push = (alias: string, kind: Kind, id: string, recordName: string) => {
    const n = normalize(alias)
    if (!n) return
    const key = `${n}|${id}`
    if (seen.has(key)) return
    seen.add(key)
    entries.push([n, kind === 'camera' ? 'c' : 'l', id, alias === recordName ? '' : alias])
  }
  // What a card SHOWS is the merged market label where one exists ("Minolta
  // Riva/Freedom Zoom 105i"); what it is INDEXED and keyed by stays `name`.
  // Keeping those separate is the whole design: a slash in `name` would change
  // the id hash and cost the record its exact-token match.
  // contract v1: every record carries recommended_name, so no fallback
  const titleOf = (rec: GearRecord) => rec.recommended_name
  for (const { rec, kind } of byId.values()) push(rec.name, kind, rec.id, titleOf(rec))
  let orphanAliases = 0
  for (const a of aliases) {
    const target = byId.get(a.gearbook_id)
    if (!target) { orphanAliases++; continue }
    push(a.alias, a.gearbook_kind, a.gearbook_id, titleOf(target.rec))
  }
  entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))

  // ── Catalog (lite rows) ──────────────────────────────────────────────────
  const catalog: CatalogRowTuple[] = []
  for (const { rec, kind } of byId.values()) {
    catalog.push([
      rec.id,
      kind === 'camera' ? 'c' : 'l',
      titleOf(rec),
      rec.data.manufacturer ?? '',
      rec.data.year_introduced ?? 0,
      (rec.confidence?.[0] ?? 'm') as 'h' | 'm' | 'l',
      factsLine(rec, kind),
      (kind === 'camera' ? rec.data.body_type : rec.data.lens_type) ?? '',
      rec.data.format && rec.data.format !== 'digital' ? rec.data.format : '',
      mountsOf(rec, kind),
      kind === 'camera' ? (rec.data.medium ?? '') : '',
      kind === 'camera' ? (rec.data.traits ?? []) : [],
    ])
    // eslint-disable-next-line no-empty
  }
  // Plain name-sort put quoted names ("Carmen") and digit-led names (135mm
  // f/2.8 Revuenon) ahead of everything alphabetic — the ASCII order of `"`
  // and digits is below `A`-`z` — so the first unfiltered Browse screen was
  // led by the corpus's least representative records. Sort by a sanity tier
  // first (manufacturer + high confidence, then manufacturer at any
  // confidence, then no manufacturer at all), and within a tier by name with
  // leading punctuation/digits stripped FOR THE KEY ONLY — the display name
  // (row[2]) is never touched.
  const sortKey = (row: CatalogRowTuple) => {
    const hasMfr = row[3] !== ''
    const tier = !hasMfr ? 2 : row[5] === 'h' ? 0 : 1
    const stripped = row[2].replace(/^[^\p{L}]+/u, '')
    return { tier, stripped }
  }
  catalog.sort((a, b) => {
    const ka = sortKey(a)
    const kb = sortKey(b)
    if (ka.tier !== kb.tier) return ka.tier - kb.tier
    return ka.stripped.localeCompare(kb.stripped) || a[2].localeCompare(b[2]) || a[0].localeCompare(b[0])
  })

  // ── Facets / curated counts ──────────────────────────────────────────────
  const mfrCounts = new Map<string, number>()
  for (const { rec } of byId.values()) {
    const m = rec.data.manufacturer
    if (m) mfrCounts.set(m, (mfrCounts.get(m) ?? 0) + 1)
  }
  const manufacturers = [...mfrCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]))

  const count = (pred: (rec: GearRecord, kind: Kind) => boolean) => {
    let n = 0
    for (const { rec, kind } of byId.values()) if (pred(rec, kind)) n++
    return n
  }
  const curated: CuratedEntry[] = [
    {
      kicker: 'Collection', title: 'Browse by manufacturer', href: '#/browse?facet=manufacturer',
      count: manufacturers.length, unit: 'makes',
    },
    {
      kicker: 'Collection', title: '120 film TLRs', href: '#/browse?format=120&body=tlr',
      count: count((r, k) => k === 'camera' && r.data.format === '120' && r.data.body_type === 'tlr'),
      unit: 'cameras',
    },
    {
      kicker: 'Collection', title: 'M42 mount lenses', href: '#/browse?kind=lens&mount=m42',
      count: count((r, k) => k === 'lens' && mountsOf(r, k).some((m) => m.toLowerCase() === 'm42')),
      unit: 'lenses',
    },
    {
      kicker: 'Collection', title: '35mm rangefinders', href: '#/browse?format=35mm&body=rangefinder',
      count: count((r, k) => k === 'camera' && r.data.format === '35mm' && r.data.body_type === 'rangefinder'),
      unit: 'cameras',
    },
    {
      kicker: 'Collection', title: 'Digital SLRs', href: '#/browse?medium=digital&body=slr',
      count: count((r, k) => k === 'camera' && r.data.medium === 'digital' && r.data.body_type === 'slr'),
      unit: 'cameras',
    },
    {
      kicker: 'Collection', title: 'Instant cameras', href: '#/browse?medium=instant',
      count: count((r, k) => k === 'camera' && r.data.medium === 'instant'),
      unit: 'cameras',
    },
    {
      kicker: 'Collection', title: 'Folding cameras', href: '#/browse?traits=folding',
      count: count((r, k) => k === 'camera' && (r.data.traits ?? []).includes('folding')),
      unit: 'cameras',
    },
    {
      kicker: 'Collection', title: 'Stereo cameras', href: '#/browse?traits=stereo',
      count: count((r, k) => k === 'camera' && (r.data.traits ?? []).includes('stereo')),
      unit: 'cameras',
    },
    {
      kicker: 'Collection', title: 'Subminiature cameras', href: '#/browse?traits=subminiature',
      count: count((r, k) => k === 'camera' && (r.data.traits ?? []).includes('subminiature')),
      unit: 'cameras',
    },
  ]

  // ── Shards: full records by first 2 hex chars of id ─────────────────────
  const shards = new Map<string, Record<string, GearRecord & { kind: Kind }>>()
  for (const { rec, kind } of byId.values()) {
    const key = rec.id.slice(0, 2)
    if (!shards.has(key)) shards.set(key, {})
    shards.get(key)![rec.id] = { ...rec, kind }
  }

  return {
    version,
    counts: { cameras: cameras.length, lenses: lenses.length, aliases: aliases.length },
    entries, catalog, manufacturers, curated, shards, orphanAliases,
  }
}

export function writeOutputs() {
  const t0 = Date.now()
  const b = buildAll()

  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(join(outDir, 'shards'), { recursive: true })

  writeFileSync(join(outDir, 'index.json'), JSON.stringify({
    version: b.version, counts: b.counts, entries: b.entries,
  }))
  writeFileSync(join(outDir, 'catalog.json'), JSON.stringify({
    version: b.version, records: b.catalog,
  }))
  writeFileSync(join(outDir, 'facets.json'), JSON.stringify({
    version: b.version, counts: b.counts,
    manufacturers: b.manufacturers, curated: b.curated,
  }))
  for (const [key, records] of b.shards) {
    writeFileSync(join(outDir, 'shards', `${key}.json`), JSON.stringify(records))
  }

  console.log(
    `gearbook v${b.version}: ${b.counts.cameras} cameras, ${b.counts.lenses} lenses, ` +
    `${b.entries.length} index entries (${b.orphanAliases} orphan aliases skipped), ` +
    `${b.shards.size} shards — ${Date.now() - t0}ms`,
  )
}

