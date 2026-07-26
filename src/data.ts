// Client data loading — eager search index, lazy catalog + record shards.

import { SearchEngine, buildEngineInputs } from './engine/search'
import type {
  SearchIndexFile, CatalogFile, CatalogRecord, FacetsFile, GearRecord, Kind,
} from './types'

const BASE = import.meta.env.BASE_URL + 'data/'

// Injected by vite (see vite.config.ts). Appended to every data request so a
// deploy is visible immediately instead of up to ten minutes later.
declare const __BUILD_STAMP__: string
const CACHE_BUST = `?v=${__BUILD_STAMP__}`

let engine: SearchEngine | null = null
let facets: FacetsFile | null = null
let catalog: CatalogRecord[] | null = null
let catalogPromise: Promise<CatalogRecord[]> | null = null
const shardCache = new Map<string, Record<string, GearRecord & { kind: Kind }>>()

export function getEngine(): SearchEngine | null {
  return engine
}

export function getFacets(): FacetsFile | null {
  return facets
}

/** Eager boot payload: facets (tiny) first for the landing page, then the
 *  search index. onProgress gets 0..1 while the index streams in. */
export async function boot(onProgress: (frac: number | null) => void): Promise<void> {
  const facetsPromise = fetchJson<FacetsFile>('facets.json').then((f) => {
    facets = f
  })
  const index = await fetchJsonWithProgress<SearchIndexFile>('index.json', onProgress)
  const catalogFile = await fetchJsonWithProgress<CatalogFile>('catalog.json', null)
  catalog = parseCatalog(catalogFile)
  const inputs = buildEngineInputs(index.entries, catalogFile.records)
  engine = new SearchEngine(inputs.entries, inputs.meta)
  await facetsPromise
}

export async function loadCatalog(): Promise<CatalogRecord[]> {
  if (catalog) return catalog
  if (!catalogPromise) {
    catalogPromise = fetchJson<CatalogFile>('catalog.json').then((f) => {
      catalog = parseCatalog(f)
      return catalog
    })
  }
  return catalogPromise
}

export function getCatalogSync(): CatalogRecord[] | null {
  return catalog
}

export async function loadRecord(id: string): Promise<(GearRecord & { kind: Kind }) | null> {
  const key = id.slice(0, 2)
  if (!shardCache.has(key)) {
    try {
      shardCache.set(key, await fetchJson(`shards/${key}.json`))
    } catch {
      return null
    }
  }
  return shardCache.get(key)![id] ?? null
}

function parseCatalog(f: CatalogFile): CatalogRecord[] {
  return f.records.map((r) => ({
    id: r[0],
    kind: r[1] === 'c' ? 'camera' : 'lens',
    name: r[2],
    manufacturer: r[3],
    year: r[4],
    confidence: r[5] === 'h' ? 'high' : r[5] === 'l' ? 'low' : 'medium',
    line: r[6],
    type: r[7],
    format: r[8],
    mounts: r[9],
    medium: r[10],
  }))
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path + CACHE_BUST)
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
  return res.json()
}

async function fetchJsonWithProgress<T>(
  path: string, onProgress: ((frac: number | null) => void) | null,
): Promise<T> {
  const res = await fetch(BASE + path + CACHE_BUST)
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
  const total = Number(res.headers.get('Content-Length')) || 0
  if (!onProgress || !res.body || !total) {
    onProgress?.(null)
    return res.json()
  }
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.length
    onProgress(Math.min(1, received / total))
  }
  const buf = new Uint8Array(received)
  let off = 0
  for (const c of chunks) {
    buf.set(c, off)
    off += c.length
  }
  return JSON.parse(new TextDecoder().decode(buf))
}
