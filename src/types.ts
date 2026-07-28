// Shapes of the published Gearbook asset (see data/gearbook/README) and the
// build-pipeline outputs the app consumes.

import type { Kind } from './engine/gearbook'
import type { Market, MarketName } from './engine/market-names'

export type { Kind, Market, MarketName }
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
  /** Canonical model name — identity, hashing, matching. Never a slash form. */
  name: string
  /**
   * What to SHOW a person: "Minolta Riva/Freedom Zoom 105i" where the markets
   * disagreed, the plain name everywhere else. Contract v1 puts it on EVERY
   * record so no consumer has to write `?? name`.
   */
  recommended_name: string
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
    /**
     * Every market's name for this camera, when they differ. Present only on
     * records where a merge happened; absent means the camera had one name
     * everywhere. Distinct from `country`, which is where it was BUILT — the
     * Riva and Freedom twins are both `country: "Japan"`.
     */
    market_names?: MarketName[]
    // camera
    /** The viewing/focusing system — single-valued. See BODY_TYPES. */
    body_type?: string
    /** Orthogonal form-factor / purpose modifiers, sorted. See TRAITS. */
    traits?: string[]
    /** @deprecated derived from body_type + traits; removed in contract v2. */
    camera_type?: string
    /** @deprecated use `traits` ∋ 'folding'; removed in contract v2. */
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
