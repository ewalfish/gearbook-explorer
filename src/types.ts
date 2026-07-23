// Shapes of the published Gearbook asset (see data/gearbook/README) and the
// build-pipeline outputs the app consumes.

export type Kind = 'camera' | 'lens'
export type Confidence = 'high' | 'medium' | 'low'

export interface Variant {
  name: string
  tell: string
  premium?: boolean
}

export interface FixedLens {
  name?: string | null
  focal_length?: string | number | null
  focal_min_mm?: number | null
  focal_max_mm?: number | null
  max_aperture?: string | null
  min_aperture?: string | null
  lens_type?: string | null
  filter_size?: string | number | null
}

export interface GearRecord {
  id: string
  name: string
  gearbook_version: string
  confidence: Confidence
  data: {
    name?: string
    manufacturer?: string
    country?: string
    year_introduced?: number
    year_discontinued?: number
    variants?: Variant[]
    manual_url?: string
    // camera
    camera_type?: string
    folding?: number
    medium?: string
    format?: string
    frame_size?: string
    lens_mount?: string
    fixed_lens?: FixedLens
    shutter_type?: string
    shutter_speeds?: string
    metered?: number
    meter_type?: string
    batteries?: string[]
    sensor_format?: string
    sensor_size?: string
    sensor_tech?: string
    sensor_resolution_mp?: number
    // lens
    mount?: string
    focal_length?: string | number
    focal_min_mm?: number
    focal_max_mm?: number
    lens_type?: string
    max_aperture?: string
    min_aperture?: string
    filter_size?: string | number
    elements_groups?: string
    min_focus?: string
  }
  variants?: Variant[]
}

// ── Build-pipeline outputs ──────────────────────────────────────────────────

/** index.json — eager search index. Tuple keeps the payload small:
 *  [normalizedAlias, kind ('c'|'l'), recordId, displayAlias ('' when it equals the record name)] */
export type IndexEntryTuple = [string, 'c' | 'l', string, string]

export interface SearchIndexFile {
  version: string
  counts: { cameras: number; lenses: number; aliases: number }
  entries: IndexEntryTuple[]
}

/** catalog.json — one lite row per record, for typeahead display, browse and related lists:
 *  [id, kind, name, manufacturer, yearIntroduced, confidence ('h'|'m'|'l'), factsLine, type, format, mounts, medium] */
export type CatalogRowTuple = [
  string, 'c' | 'l', string, string, number | 0, 'h' | 'm' | 'l', string,
  string, string, string[], string,
]

export interface CatalogFile {
  version: string
  records: CatalogRowTuple[]
}

export interface CatalogRecord {
  id: string
  kind: Kind
  name: string
  manufacturer: string
  year: number
  confidence: Confidence
  line: string
  type: string
  format: string
  mounts: string[]
  medium: string
}

export interface CuratedEntry {
  kicker: string
  title: string
  href: string
  count: number
  unit: string
}

export interface FacetsFile {
  version: string
  counts: { cameras: number; lenses: number; aliases: number }
  manufacturers: [string, number][]
  curated: CuratedEntry[]
}
