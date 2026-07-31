// View renderers — landing, search results, spec sheets, browse.
// Each returns HTML (all record data escaped) and wires events after mount.

import { getEngine, getFacets, loadCatalog, loadRecord } from './data'
import { fmtFocal } from './format'
import { slugify } from './engine/normalize'
import { BODY_TYPE_LABELS, TRAIT_LABELS } from './engine/schema'
import { mapLegacyParams } from './legacy-params'
import {
  esc, navHtml, footerHtml, hitRowHtml, recordHref,
  attachTypeahead, attachNavSearch, SEARCH_ICON, EXTERNAL_ICON,
} from './ui'
import type { CatalogRecord, GearRecord, Kind, Variant } from './types'
import type { BodyType, Trait } from './engine/schema'

const app = () => document.getElementById('app')!

const REPO_URL = 'https://github.com/ewalfish/gearbook-explorer'

/**
 * Finding 8: every facet/chip/sort click re-renders the whole browse page,
 * and main.ts's route() unconditionally scrolls to top afterward — dropping
 * a keyboard user back to page 1 after every refinement. Set by the click
 * (see renderBrowse's delegated listener) just before the browser's own
 * hash navigation fires; read once by the render that follows, then
 * cleared. A route-level entry into browse (landing search, a pasted URL)
 * never sets this, so it keeps the normal scroll-to-top.
 */
let pendingRestore: { facet: string; scrollY: number } | null = null

/** Prefilled GitHub issue-form link for a record correction. */
function correctionIssueHref(name: string, kind: Kind, id: string): string {
  const params = new URLSearchParams({
    template: 'correction.yml',
    title: `[correction] ${name}`,
    record: `${name} (${kind} ${id})`,
  })
  return `${REPO_URL}/issues/new?${params.toString()}`
}

// ── Landing ────────────────────────────────────────────────────────────────

export function renderLanding(): void {
  const f = getFacets()
  const counts = f?.counts
  const fmt = (n: number) => n.toLocaleString('en-US')
  const sub = counts
    ? `Type a name — even misspelled, even a nickname. ${fmt(counts.cameras)} cameras, ${fmt(counts.lenses)} lenses, ${fmt(counts.aliases)} cross-market names.`
    : 'Type a name — even misspelled, even a nickname.'
  const curated = (f?.curated ?? []).map((c) => `
    <a class="gb-entry" href="${esc(c.href)}">
      <span class="gb-entry-kicker">${esc(c.kicker)}</span>
      <span class="gb-entry-title">${esc(c.title)}</span>
      <span class="text-muted gb-entry-meta">${fmt(c.count)} ${esc(c.unit)} <span class="gb-arrow">→</span></span>
    </a>`).join('')

  document.title = 'Gearbook Explorer'
  app().innerHTML = `
  <div class="page">
    ${navHtml(null, false)}
    <div class="hero">
      <div class="kicker">Fact-only spec index · v${esc(f?.version ?? '…')}</div>
      <h1 class="hero-h1">Find any camera or lens.</h1>
      <p class="text-muted hero-sub">${esc(sub)}</p>
      <div class="hero-search" data-typeahead-hero>
        ${SEARCH_ICON}
        <input type="search" placeholder='Search "AE-1", "µ-II", "Rolleiflex 2,8", "Autoboy"…'
          aria-label="Search cameras and lenses" role="combobox" aria-expanded="false"
          aria-haspopup="listbox" aria-autocomplete="list" autocomplete="off" autofocus>
        <span class="kbd-chip" aria-hidden="true">↵</span>
      </div>
      <p class="text-muted hero-status" id="index-status" hidden></p>
    </div>
    <div class="curated">
      <div class="section-label">
        <h6>Start exploring</h6>
        <a href="#/browse?facet=manufacturer" class="section-link">All manufacturers →</a>
      </div>
      <div class="curated-grid">${curated}</div>
    </div>
    ${footerHtml()}
  </div>`

  const heroBox = app().querySelector<HTMLElement>('[data-typeahead-hero]')
  if (heroBox) attachTypeahead(heroBox, { hero: true })
  app().querySelector('input')?.focus()
}

/** Determinate index-loading state (PRD §6). */
export function updateIndexStatus(frac: number | null, ready: boolean): void {
  const el = document.getElementById('index-status')
  if (!el) return
  if (ready) {
    el.hidden = true
  } else {
    el.hidden = false
    el.textContent = frac === null
      ? 'Loading search index…'
      : `Loading search index… ${Math.round(frac * 100)}%`
  }
}

// ── Full search results ────────────────────────────────────────────────────

export async function renderSearch(q: string): Promise<void> {
  document.title = q ? `${q} — Gearbook` : 'Search — Gearbook'
  await loadCatalog()
  const engine = getEngine()
  const hits = engine && q ? engine.search(q, 50) : []
  const rows = hits.map((h) => hitRowHtml(h, false)).join('')
  app().innerHTML = `
  <div class="page">
    ${navHtml(null, false)}
    <div class="search-page">
      <div class="hero-search hero-search-open" data-typeahead-hero>
        ${SEARCH_ICON}
        <input type="search" aria-label="Search cameras and lenses" role="combobox"
          aria-expanded="false" aria-haspopup="listbox" aria-autocomplete="list" autocomplete="off">
        <span class="text-muted result-count">${hits.length ? `${hits.length}${hits.length === 50 ? '+' : ''} matches` : ''}</span>
      </div>
      <div class="results-list" role="list">
        ${rows || (q ? `<p class="text-muted empty-note">No matches for “${esc(q)}”. Check the spelling — or try just the model name, like “AE-1” or “K1000”.</p>` : `<p class="text-muted empty-note">Type a camera or lens name above.</p>`)}
      </div>
    </div>
    ${footerHtml()}
  </div>`
  const box = app().querySelector<HTMLElement>('[data-typeahead-hero]')
  if (box) attachTypeahead(box, { hero: true, initial: q })
}

// ── Spec sheets ────────────────────────────────────────────────────────────

function dtDd(label: string, valueHtml: string): string {
  return `<dt>${esc(label)}</dt><dd>${valueHtml}</dd>`
}

function browseMountHref(mount: string): string {
  return `#/browse?mount=${encodeURIComponent(slugify(mount))}`
}

function cameraSpecRows(d: GearRecord['data']): string {
  const rows: string[] = []
  const typeBits = [
    d.format && d.format !== 'digital' ? d.format : '',
    d.body_type ? (BODY_TYPE_LABELS[d.body_type as BodyType] ?? d.body_type) : '',
  ].filter(Boolean).join(' ')
  if (typeBits) rows.push(dtDd('Type', esc(typeBits)))
  if (d.traits?.length) {
    // Finding 11: plain comma-separated red text didn't read as clickable.
    // The .chip pill (already the browse page's language for "this filters
    // the catalog") signals it; .chip-link adds a hover state since these,
    // unlike a chip's usual ✕-to-remove use, are plain navigation.
    const links = d.traits
      .map((t) => `<a class="chip chip-link" href="#/browse?traits=${encodeURIComponent(t)}">${esc(TRAIT_LABELS[t as Trait] ?? t)}</a>`)
      .join('')
    rows.push(dtDd('Traits', `<span class="chip-row">${links}</span>`))
  }
  if (d.medium) {
    const fmt = [
      d.medium === 'film' ? (d.format && d.format !== 'digital' ? `${d.format} film` : 'film') : d.medium,
      d.frame_size ? `${d.frame_size} frame` : '',
    ].filter(Boolean).join(' · ')
    rows.push(dtDd('Medium · Format', esc(fmt)))
  }
  if (d.lens_mount) {
    rows.push(dtDd('Lens mount', `<a href="${browseMountHref(d.lens_mount)}">${esc(d.lens_mount)}</a>`))
  } else if (d.fixed_lens) {
    const fl = d.fixed_lens
    const focal = fmtFocal(fl.focal_length, fl.focal_min_mm, fl.focal_max_mm)
    const flName = (fl.name ?? '').replace(/\s*-\s*$/, '').trim()
    const bits = [flName !== '-' ? flName : '', focal, fl.max_aperture ?? '']
      .filter(Boolean).join(' · ')
    if (bits) rows.push(dtDd('Fixed lens', esc(bits)))
  }
  if (d.shutter_type) rows.push(dtDd('Shutter', esc(cap(d.shutter_type))))
  if (d.shutter_speeds) rows.push(dtDd('Speeds', esc(d.shutter_speeds)))
  if (d.metered != null) {
    const m = d.metered
      ? ['Metered', d.meter_type ? `${d.meter_type} meter` : ''].filter(Boolean).join(' · ')
      : 'Unmetered'
    rows.push(dtDd('Metering', esc(m)))
  }
  if (d.batteries?.length) rows.push(dtDd('Battery', esc(d.batteries.join(' / '))))
  if (d.sensor_tech || d.sensor_size || d.sensor_resolution_mp) {
    const s = [
      d.sensor_resolution_mp ? `${d.sensor_resolution_mp} MP` : '',
      d.sensor_tech ?? '', d.sensor_size ? `${d.sensor_size}` : '',
    ].filter(Boolean).join(' · ')
    rows.push(dtDd('Sensor', esc(s)))
  }
  if (d.country) rows.push(dtDd('Country', esc(d.country)))
  const years = yearsRange(d)
  if (years) rows.push(dtDd('Years', esc(years)))
  return rows.join('')
}

function lensSpecRows(d: GearRecord['data']): string {
  const rows: string[] = []
  if (d.mounts?.length) {
    const links = d.mounts.map((m) => `<a href="${browseMountHref(m)}">${esc(m)}</a>`).join(', ')
    rows.push(dtDd('Mount', links))
  }
  const focal = fmtFocal(d.focal_length, d.focal_min_mm, d.focal_max_mm, ' – ')
  if (focal) rows.push(dtDd('Focal length', esc(focal.replace(/mm$/, ' mm'))))
  if (d.lens_type) rows.push(dtDd('Type', esc(cap(d.lens_type))))
  if (d.max_aperture) {
    rows.push(dtDd('Aperture', esc(d.min_aperture ? `${d.max_aperture} – ${d.min_aperture}` : d.max_aperture)))
  }
  if (d.filter_size) rows.push(dtDd('Filter size', esc(`${d.filter_size} mm`)))
  if (d.elements_groups) rows.push(dtDd('Elements / groups', esc(d.elements_groups)))
  if (d.min_focus) rows.push(dtDd('Min focus', esc(d.min_focus)))
  const years = yearsRange(d)
  if (years) rows.push(dtDd('Years', esc(years)))
  return rows.join('')
}

const MARKET_LABEL: Record<string, string> = {
  us: 'US', intl: 'international', eu: 'Europe', jp: 'Japan',
}

/**
 * "Also sold as …" under the heading.
 *
 * The heading already carries the merged label, but a slash form only tells you
 * the names exist — not which market each belongs to. A buyer who arrived
 * searching "Espio 70" needs to see, in words, that this is the same camera
 * they were looking at somewhere else. That confirmation is the whole reason
 * the cross-market work exists; without it the page is a dead end for anyone
 * who came by the other name.
 */
function alsoKnownAsHtml(rec: GearRecord): string {
  const others = (rec.data.market_names ?? []).filter((m) => m.name !== rec.name)
  if (!others.length) return ''
  const parts = others.map(
    (m) => `<strong>${esc(m.name)}</strong>${MARKET_LABEL[m.market] ? ` <span class="text-muted">(${MARKET_LABEL[m.market]})</span>` : ''}`,
  )
  return `<div class="detail-aka text-muted">Also sold as ${parts.join(' · ')}</div>`
}

function variantsHtml(variants: Variant[]): string {
  if (!variants.length) return ''
  const cols = variants.length === 1 ? 1 : variants.length === 2 || variants.length === 4 ? 2 : 3
  const cells = variants.map((v) => `
    <div class="variant-cell${v.premium ? ' is-premium' : ''}">
      <div class="variant-head">
        <h5>${esc(v.name)}</h5>
        <span class="tag ${v.premium ? 'tag-accent' : 'tag-neutral'}">${v.premium ? 'PREMIUM' : 'BASELINE'}</span>
      </div>
      <p>${esc(v.tell)}</p>
    </div>`).join('')
  return `
  <section class="variants">
    <div class="section-label">
      <h4>Variants</h4>
      <span class="text-muted variants-note">Tells are how to identify the one in hand — not valuation claims.</span>
    </div>
    <div class="variants-grid cols-${cols}">${cells}</div>
  </section>`
}

function relatedListHtml(title: string, note: string, items: CatalogRecord[]): string {
  if (!items.length) return ''
  const rows = items.map((r) => `
    <a class="gb-related" href="${recordHref(r)}"><span>${esc(r.name)}</span><span class="text-muted gb-arrow">→</span></a>`).join('')
  return `<div><h6>${esc(title)}${note ? ` <span class="h6-note text-muted">— ${esc(note)}</span>` : ''}</h6>${rows}</div>`
}

function yearsRange(d: GearRecord['data']): string {
  if (d.year_introduced && d.year_discontinued) return `${d.year_introduced} – ${d.year_discontinued}`
  if (d.year_introduced) return `${d.year_introduced}`
  return ''
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Year-proximity distance for relatedness sorts (finding 9) — a record with
 * no year is always farthest away, never mistaken for a same-year match by
 * collapsing to a 0 diff. `baseYear` of 0 (the anchor record itself has no
 * year) makes proximity meaningless, so every dated record ties at 0 rather
 * than one arbitrarily outranking another.
 */
function yearDistance(year: number, baseYear: number): number {
  if (!year) return Infinity
  if (!baseYear) return 0
  return Math.abs(year - baseYear)
}

/**
 * Freeform-value fallback formatter — dash-to-space, no casing table. Used
 * for lens types (never enumerated, so there is no label map for them) and
 * as the fallback for anything BODY_TYPE_LABELS/TRAIT_LABELS doesn't cover.
 * Used to also carry `slr`/`tlr`/`point-and-shoot` camera_type casing; that
 * vocabulary has its own label maps now (BODY_TYPE_LABELS, TRAIT_LABELS),
 * so this function no longer needs to know it.
 */
function prettyType(t?: string): string {
  if (!t) return ''
  return t.replace(/-/g, ' ')
}

export async function renderDetail(kind: Kind, id: string): Promise<void> {
  app().innerHTML = `<div class="page">${navHtml(kind === 'camera' ? 'cameras' : 'lenses', true)}<div class="detail-loading text-muted">Loading…</div>${footerHtml()}</div>`
  attachNavSearch(app())
  const [rec, catalog] = await Promise.all([loadRecord(id), loadCatalog()])
  if (!rec) {
    app().querySelector('.detail-loading')!.innerHTML =
      `Record not found. <a href="#/">Back to search</a> — the id may predate the current data version.`
    return
  }
  const d = rec.data
  const variants = rec.data.variants ?? rec.variants ?? []
  document.title = `${rec.name} — Gearbook`

  const metaBits = [
    d.manufacturer,
    kind === 'lens' && d.mounts?.length ? `${d.mounts[0]} mount` : '',
    d.country,
    yearsRange(d).replace(/ /g, ''),
  ].filter(Boolean).join(' · ')

  const mounts = kind === 'camera' ? (d.lens_mount ? [d.lens_mount] : []) : (d.mounts ?? [])
  const recType = kind === 'camera' ? (d.body_type ?? '') : (d.lens_type ?? '')
  const recTraits = d.traits ?? []
  const recYear = d.year_introduced ?? 0
  const sameMfr = catalog
    .filter((r) => r.manufacturer === d.manufacturer && r.kind === kind && r.id !== id)
    .sort((a, b) => {
      const ta = a.type === recType ? 0 : 1
      const tb = b.type === recType ? 0 : 1
      if (ta !== tb) return ta - tb
      // Trait overlap tiebreak: more shared traits sorts first.
      const oa = recTraits.filter((t) => a.traits.includes(t)).length
      const ob = recTraits.filter((t) => b.traits.includes(t)).length
      if (oa !== ob) return ob - oa
      if (recYear) return Math.abs((a.year || recYear) - recYear) - Math.abs((b.year || recYear) - recYear)
      return 0
    })
    .slice(0, 4)
  const crossKind: Kind = kind === 'camera' ? 'lens' : 'camera'
  // Finding 9: catalog order is arbitrary (import order, not relevance) —
  // sort so a same-maker match leads, then by closeness in time to this
  // record, before slicing to 4. Same comparator shape as `sameMfr` above
  // (bucket first, numeric tiebreak second) but with its own bucket
  // (manufacturer, not type/traits) since these are cross-kind matches.
  const mountMatches = mounts.length
    ? catalog
        .filter((r) => r.kind === crossKind && r.mounts.some((m) => mounts.some((mm) => m.toLowerCase() === mm.toLowerCase())))
        .sort((a, b) => {
          const ma = a.manufacturer === d.manufacturer ? 0 : 1
          const mb = b.manufacturer === d.manufacturer ? 0 : 1
          if (ma !== mb) return ma - mb
          return yearDistance(a.year, recYear) - yearDistance(b.year, recYear)
        })
        .slice(0, 4)
    : []
  const primaryMount = mounts[0] ?? ''

  const crumbs = `
    <div class="crumbs">
      <a href="#/browse?kind=${kind}">${kind === 'camera' ? 'Cameras' : 'Lenses'}</a><span class="text-muted"> / </span><a href="#/browse?manufacturer=${encodeURIComponent(slugify(d.manufacturer ?? ''))}">${esc(d.manufacturer ?? '')}</a>
    </div>`

  const partial = rec.confidence !== 'high'
    ? '<span class="text-muted partial-note">Partial specs</span>' : ''

  // (correction links are the second permitted outbound class: the repo's
  // issue form, prefilled with the record identity)
  // manual_url is the only permitted outbound URL class (PRD §3.3) — and only
  // ever as an http(s) link, never embedded or proxied.
  const manualBtn = d.manual_url && /^https?:\/\//i.test(d.manual_url)
    ? `<a class="btn btn-secondary manual-btn" href="${esc(d.manual_url)}" target="_blank" rel="noopener">Manual ${EXTERNAL_ICON}</a>`
    : ''

  app().innerHTML = `
  <div class="page">
    ${navHtml(kind === 'camera' ? 'cameras' : 'lenses', true)}
    <div class="detail">
      ${crumbs}
      <div class="detail-head">
        <div>
          <div class="detail-tags">
            <span class="tag ${kind === 'camera' ? 'tag-neutral' : 'tag-outline'}">${kind === 'camera' ? 'CAMERA' : 'LENS'}</span>
            ${partial}
          </div>
          <h1 class="detail-h1">${esc(rec.recommended_name)}</h1>
          <div class="text-muted detail-meta">${esc(metaBits)}</div>
          ${alsoKnownAsHtml(rec)}
        </div>
        ${manualBtn}
      </div>
      <hr class="hr">
      <div class="detail-grid">
        <div>
          <dl class="spec-dl">${kind === 'camera' ? cameraSpecRows(d) : lensSpecRows(d)}</dl>
          ${variantsHtml(variants)}
          <p class="text-muted correction-note">Spotted an error?
            <a href="${esc(correctionIssueHref(rec.name, kind, rec.id))}" target="_blank" rel="noopener">Report a correction ${EXTERNAL_ICON}</a>
          </p>
        </div>
        <aside class="detail-aside">
          ${relatedListHtml(`More from ${d.manufacturer ?? 'this maker'}`, '', sameMfr)}
          ${relatedListHtml(
            kind === 'camera' ? `${primaryMount} lenses` : `${primaryMount} bodies`,
            kind === 'camera' ? 'fits this mount' : 'fits these',
            mountMatches,
          )}
        </aside>
      </div>
    </div>
    ${footerHtml()}
  </div>`
  attachNavSearch(app())
}

// ── Browse ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 60

export async function renderBrowse(params: URLSearchParams): Promise<void> {
  app().innerHTML = `<div class="page">${navHtml('browse', true)}<div class="detail-loading text-muted">Loading…</div>${footerHtml()}</div>`
  attachNavSearch(app())
  const catalog = await loadCatalog()

  // Manufacturer directory view
  if (params.get('facet') === 'manufacturer') {
    renderManufacturerDirectory()
    return
  }

  // Legacy `?type=` links keep resolving — mapped once, up front, so
  // filtering, chips and facet links downstream all agree with the modern
  // params instead of the old ones.
  params = mapLegacyParams(params)

  const kind = params.get('kind')
  const body = params.get('body')
  const ltype = params.get('ltype')
  const traits = (params.get('traits') ?? '').split(',').map((t) => t.trim()).filter(Boolean)
  const format = params.get('format')
  const mount = params.get('mount')
  const manufacturer = params.get('manufacturer')
  const medium = params.get('medium')
  const sort = params.get('sort') === 'year' ? 'year' : 'name'
  const expand = params.get('expand')

  // One predicate per facet param. The results list applies every one of
  // them; a facet GROUP's own counts apply every one EXCEPT its own — so
  // selecting a value narrows every OTHER group instead of collapsing the
  // group it came from to just itself (disjunctive counting). `kind` isn't
  // a facet group rendered in the sidebar, so it's never excluded — it
  // always applies, to every group including its own scoping below.
  const predicates: Record<string, ((r: CatalogRecord) => boolean) | null> = {
    kind: kind ? (r) => r.kind === kind : null,
    body: body ? (r) => r.kind === 'camera' && r.type === body : null,
    ltype: ltype ? (r) => r.kind === 'lens' && r.type === ltype : null,
    // AND semantics: a record must hold every selected trait, not just one.
    traits: traits.length ? (r) => traits.every((t) => r.traits.includes(t)) : null,
    format: format ? (r) => r.format === format : null,
    medium: medium ? (r) => r.medium === medium : null,
    mount: mount ? (r) => r.mounts.some((m) => slugify(m) === mount) : null,
    manufacturer: manufacturer ? (r) => slugify(r.manufacturer) === manufacturer : null,
  }
  function filterExcept(...exclude: string[]): CatalogRecord[] {
    const active = Object.entries(predicates).filter(([k, p]) => p && !exclude.includes(k)).map(([, p]) => p!)
    return catalog.filter((r) => active.every((p) => p(r)))
  }

  let rows = filterExcept()
  if (sort === 'year') {
    // A historical index: oldest first, unknown/zero years pushed to the
    // end. Array#sort is stable, so ties keep the pipeline's default order.
    rows = [...rows].sort((a, b) => (a.year || Infinity) - (b.year || Infinity))
  }

  const filters: { label: string; param: string; value?: string }[] = []
  if (kind) filters.push({ label: kind === 'camera' ? 'Cameras' : 'Lenses', param: 'kind' })
  if (body) filters.push({ label: BODY_TYPE_LABELS[body as BodyType] ?? body, param: 'body' })
  if (ltype) filters.push({ label: prettyType(ltype), param: 'ltype' })
  for (const t of traits) filters.push({ label: TRAIT_LABELS[t as Trait] ?? t, param: 'traits', value: t })
  if (format) filters.push({ label: format, param: 'format' })
  if (medium) filters.push({ label: medium, param: 'medium' })
  if (mount) filters.push({ label: rows[0]?.mounts.find((m) => slugify(m) === mount) ?? mount, param: 'mount' })
  if (manufacturer) filters.push({ label: rows[0]?.manufacturer ?? manufacturer, param: 'manufacturer' })

  document.title = filters.length
    ? `${filters.map((f) => f.label).join(' · ')} — Gearbook`
    : 'Browse — Gearbook'

  // `data-facet="param:value"` below is a stable click identity (finding 8)
  // — captured on click, then used by the render that follows to put focus
  // back where the click left it. A chip's identity is the same string its
  // corresponding facet-link would carry (the value being removed), so
  // removing a filter tries to land focus back on that value's toggle.
  const chip = (f: { label: string; param: string; value?: string }) => {
    const next = new URLSearchParams(params)
    next.delete('expand') // a filter change is never momentary — expansion doesn't survive it
    const identityValue = f.value ?? params.get(f.param) ?? ''
    if (f.param === 'traits' && f.value !== undefined) {
      // Remove just this trait — the others stay selected.
      const remaining = traits.filter((t) => t !== f.value)
      if (remaining.length) next.set('traits', remaining.join(','))
      else next.delete('traits')
    } else {
      next.delete(f.param)
    }
    const qs = next.toString()
    // `data-chip`, not `data-facet`: the restore query prefers the sidebar
    // link, and a chip sharing the identity attribute would shadow it — the
    // chip sits in the header, usually far above the preserved scroll.
    return `<a class="chip" data-chip="${esc(`${f.param}:${identityValue}`)}" href="#/browse${qs ? `?${qs}` : ''}">${esc(f.label)} ✕</a>`
  }

  const facetLink = (param: string, value: string, label: string, count: number) => {
    const next = new URLSearchParams(params)
    next.delete('expand')
    next.set(param, value)
    return `<a class="facet-link${params.get(param) === value ? ' is-active' : ''}" data-facet="${esc(`${param}:${value}`)}" href="#/browse?${next.toString()}">${esc(label)} <span class="text-muted">${count.toLocaleString('en-US')}</span></a>`
  }

  // Traits toggle rather than replace: clicking an unselected trait adds it
  // to the AND set, clicking a selected one removes it, everything else on
  // the URL is untouched.
  const traitLink = (value: string, count: number) => {
    const active = traits.includes(value)
    const next = new URLSearchParams(params)
    next.delete('expand')
    const nextTraits = active ? traits.filter((t) => t !== value) : [...traits, value]
    if (nextTraits.length) next.set('traits', nextTraits.join(','))
    else next.delete('traits')
    const label = TRAIT_LABELS[value as Trait] ?? value
    return `<a class="facet-link${active ? ' is-active' : ''}" data-facet="${esc(`traits:${value}`)}" href="#/browse?${next.toString()}">${esc(label)} <span class="text-muted">${count.toLocaleString('en-US')}</span></a>`
  }

  const countBy = (fn: (r: CatalogRecord) => string | string[], source: CatalogRecord[]) => {
    const m = new Map<string, number>()
    for (const r of source) {
      const v = fn(r)
      for (const x of Array.isArray(v) ? v : [v]) {
        if (x) m.set(x, (m.get(x) ?? 0) + 1)
      }
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }

  // Top-10 + "Show all (N)" per group, driven by `expand=<groupKey>` — one
  // group at a time. An active value that fell outside the top 10 is folded
  // back in: a selected filter must never disappear from its own group.
  // Expansion is momentary — chip/facetLink/traitLink above all drop
  // `expand`, so picking any other filter collapses it back.
  const expandLink = (groupKey: string, total: number) => {
    const next = new URLSearchParams(params)
    next.set('expand', groupKey)
    return `<a class="facet-link facet-more" href="#/browse?${next.toString()}">Show all (${total.toLocaleString('en-US')})</a>`
  }
  const collapseLink = () => {
    const next = new URLSearchParams(params)
    next.delete('expand')
    const qs = next.toString()
    return `<a class="facet-link facet-more" href="#/browse${qs ? `?${qs}` : ''}">Show fewer</a>`
  }
  const truncate = (
    groupKey: string, sorted: [string, number][], isActive: (value: string) => boolean,
  ): { entries: [string, number][]; lead: string; footer: string } => {
    if (sorted.length <= 10) return { entries: sorted, lead: '', footer: '' }
    // An expanded group can run to thousands of rows — the collapse control
    // renders at both ends so neither direction of regret needs a scroll.
    if (expand === groupKey) return { entries: sorted, lead: collapseLink(), footer: collapseLink() }
    const top = sorted.slice(0, 10)
    const kept = new Set(top.map(([v]) => v))
    const missingActive = sorted.filter(([v]) => isActive(v) && !kept.has(v))
    const entries = [...top, ...missingActive].sort((a, b) => b[1] - a[1])
    return { entries, lead: '', footer: expandLink(groupKey, sorted.length) }
  }

  // Body type / Traits / Medium are camera-only axes; Lens type is
  // lens-only. Scoping the source rows (not just hiding the rendered group)
  // keeps a camera body_type value from ever showing up as a "lens type" —
  // and, combined with `kind` always being one of the active predicates,
  // means a `kind` filter empties the wrong-kind groups without a separate
  // `kind === 'lens' ? '' : …` guard at every call site.
  const mfrBase = filterExcept('manufacturer')
  const bodyBase = filterExcept('body').filter((r) => r.kind === 'camera')
  const traitsBase = filterExcept('traits').filter((r) => r.kind === 'camera')
  const ltypeBase = filterExcept('ltype').filter((r) => r.kind === 'lens')
  const formatBase = filterExcept('format')
  const mediumBase = filterExcept('medium').filter((r) => r.kind === 'camera')
  const mountBase = filterExcept('mount')

  const mfrSorted = countBy((r) => r.manufacturer, mfrBase)
  const mfrTrunc = truncate('manufacturer', mfrSorted, (v) => manufacturer !== null && slugify(v) === manufacturer)
  const mfrFacet = mfrTrunc.lead + mfrTrunc.entries.map(([v, n]) => facetLink('manufacturer', slugify(v), v, n)).join('')
  const mfrFooter = `${mfrTrunc.footer}<a class="facet-link facet-directory" href="#/browse?facet=manufacturer">All manufacturers →</a>`

  const bodySorted = countBy((r) => r.type, bodyBase)
  const bodyTrunc = truncate('body', bodySorted, (v) => v === body)
  const bodyFacet = bodyTrunc.lead + bodyTrunc.entries.map(([v, n]) => facetLink('body', v, BODY_TYPE_LABELS[v as BodyType] ?? v, n)).join('')

  // Traits is multi-valued with AND semantics, so a group-wide countBy over
  // one base isn't enough — per the finding, the count for candidate trait T
  // is "rows matching all other facets AND all currently selected traits AND
  // T" (adding T narrows to N). A selected trait shows the AND-set's actual
  // size, since adding it back to itself is a no-op.
  const traitsSelected = traits.length
    ? traitsBase.filter((r) => traits.every((t) => r.traits.includes(t)))
    : traitsBase
  const traitValues = new Set<string>()
  for (const r of traitsBase) for (const t of r.traits) traitValues.add(t)
  const traitsSorted: [string, number][] = [...traitValues]
    .map((t): [string, number] => [
      t,
      traits.includes(t) ? traitsSelected.length : traitsSelected.filter((r) => r.traits.includes(t)).length,
    ])
    .filter(([v, n]) => n > 0 || traits.includes(v))
    .sort((a, b) => b[1] - a[1])
  const traitsTrunc = truncate('traits', traitsSorted, (v) => traits.includes(v))
  const traitsFacet = traitsTrunc.lead + traitsTrunc.entries.map(([v, n]) => traitLink(v, n)).join('')

  const ltypeSorted = countBy((r) => r.type, ltypeBase)
  const ltypeTrunc = truncate('ltype', ltypeSorted, (v) => v === ltype)
  const ltypeFacet = ltypeTrunc.lead + ltypeTrunc.entries.map(([v, n]) => facetLink('ltype', v, prettyType(v), n)).join('')

  const formatSorted = countBy((r) => r.format, formatBase)
  const formatTrunc = truncate('format', formatSorted, (v) => v === format)
  const formatFacet = formatTrunc.lead + formatTrunc.entries.map(([v, n]) => facetLink('format', v, v, n)).join('')

  const mediumSorted = countBy((r) => r.medium, mediumBase)
  const mediumTrunc = truncate('medium', mediumSorted, (v) => v === medium)
  const mediumFacet = mediumTrunc.lead + mediumTrunc.entries.map(([v, n]) => facetLink('medium', v, cap(v), n)).join('')

  const mountSorted = countBy((r) => r.mounts, mountBase)
  const mountTrunc = truncate('mount', mountSorted, (v) => mount !== null && slugify(v) === mount)
  const mountFacet = mountTrunc.lead + mountTrunc.entries.map(([v, n]) => facetLink('mount', slugify(v), v, n)).join('')

  // 'Name' is the pipeline's default order (no param); 'Year' is a view
  // preference, so — unlike a facet pick — it survives on `params` untouched
  // (expand included) rather than being explicitly carried forward.
  const sortLink = (value: 'name' | 'year', label: string) => {
    const next = new URLSearchParams(params)
    if (value === 'year') next.set('sort', 'year')
    else next.delete('sort')
    return `<a class="sort-link${sort === value ? ' is-active' : ''}" data-facet="${esc(`sort:${value}`)}" href="#/browse?${next.toString()}">${label}</a>`
  }
  const sortControl = `<div class="sort-control"><span class="text-muted sort-control-label">Sort</span>${sortLink('name', 'Name')}${sortLink('year', 'Year')}</div>`

  // Finding 2a: at phone width, ~70 facet values ahead of the first result
  // is a wall — render each group as a native <details> accordion instead.
  // Decided at render time (not persisted): a group holding an active
  // filter value opens by default so that context stays visible even though
  // the rest re-collapse on the next render.
  const isMobile = window.matchMedia('(max-width: 760px)').matches

  const shown = rows.slice(0, PAGE_SIZE)
  const listRows = shown.map((r) => browseRowHtml(r)).join('')
  // Zero results used to leave chips as the only way out, because every
  // facet group counts to zero too — disjunctive counting above already
  // fixes most of that, but a direct exit still belongs here. `kind` is the
  // one facet that isn't itself a sidebar group, so it's the one worth
  // preserving (Cameras vs. Lenses is closer to a section choice than a
  // filter).
  const emptyNote = `<p class="text-muted empty-note">Nothing matches this combination.
    <a class="empty-clear" href="#/browse${kind ? `?kind=${kind}` : ''}">Clear all filters</a></p>`

  app().innerHTML = `
  <div class="page">
    <a class="skip-link" href="#browse-list">Skip to results</a>
    ${navHtml('browse', true)}
    <div class="browse">
      <div class="browse-head">
        <h2>Browse</h2>
        <div class="chips">${filters.map(chip).join('')}</div>
        <span class="text-muted browse-count">${rows.length.toLocaleString('en-US')} records</span>
        ${sortControl}
      </div>
      <div class="browse-grid">
        <aside class="facet-col">
          ${facetGroup('Manufacturer', mfrFacet, mfrFooter, { groupKey: 'manufacturer', active: manufacturer !== null, mobile: isMobile })}
          ${facetGroup('Body type', bodyFacet, bodyTrunc.footer, { groupKey: 'body', active: body !== null, mobile: isMobile })}
          ${facetGroup('Traits', traitsFacet, traitsTrunc.footer, { groupKey: 'traits', active: traits.length > 0, mobile: isMobile })}
          ${facetGroup('Lens type', ltypeFacet, ltypeTrunc.footer, { groupKey: 'ltype', active: ltype !== null, mobile: isMobile })}
          ${facetGroup('Film format', formatFacet, formatTrunc.footer, { groupKey: 'format', active: format !== null, mobile: isMobile })}
          ${facetGroup('Medium', mediumFacet, mediumTrunc.footer, { groupKey: 'medium', active: medium !== null, mobile: isMobile })}
          ${facetGroup('Mount', mountFacet, mountTrunc.footer, { groupKey: 'mount', active: mount !== null, mobile: isMobile })}
        </aside>
        <div class="browse-list" id="browse-list" tabindex="-1">${listRows || emptyNote}
          ${rows.length > PAGE_SIZE ? `<button class="btn btn-secondary load-more" id="load-more">Show more (${(rows.length - PAGE_SIZE).toLocaleString('en-US')} remaining)</button>` : ''}
        </div>
      </div>
    </div>
    ${footerHtml()}
  </div>`
  attachNavSearch(app())

  let offset = PAGE_SIZE
  document.getElementById('load-more')?.addEventListener('click', function grow() {
    const btn = document.getElementById('load-more')!
    const more = rows.slice(offset, offset + PAGE_SIZE).map((r) => browseRowHtml(r)).join('')
    btn.insertAdjacentHTML('beforebegin', more)
    offset += PAGE_SIZE
    if (offset >= rows.length) btn.remove()
    else btn.textContent = `Show more (${(rows.length - offset).toLocaleString('en-US')} remaining)`
  })

  // Finding 2b: manually managed so the router (hash-based) never sees
  // `#browse-list` as a route — a real anchor jump here would set
  // location.hash to a string parseRoute doesn't recognize and land on
  // `landing` instead of the results.
  app().querySelector<HTMLAnchorElement>('.skip-link')?.addEventListener('click', (e) => {
    e.preventDefault()
    document.getElementById('browse-list')?.focus()
  })

  // Finding 8: capture the clicked identity + scroll position before the
  // browser's default hash navigation runs (delegated on `.browse`, which
  // is discarded — and its listener with it — on the next render, so this
  // never double-attaches).
  app().querySelector<HTMLElement>('.browse')?.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-facet], [data-chip]')
    if (target) pendingRestore = { facet: (target.dataset.facet ?? target.dataset.chip)!, scrollY: window.scrollY }
  })

  if (pendingRestore) {
    const { facet, scrollY } = pendingRestore
    pendingRestore = null
    // main.ts's route() calls `window.scrollTo(0, 0)` synchronously right
    // after this render's promise settles (there is no `await` between
    // them) — a macrotask runs after that microtask-chained call, which is
    // what lets this restore win instead of being immediately undone.
    setTimeout(() => {
      window.scrollTo(0, scrollY)
      restoreFacetFocus(facet)
    }, 0)
  }

  function renderManufacturerDirectory(): void {
    const f = getFacets()
    document.title = 'Manufacturers — Gearbook'
    const items = (f?.manufacturers ?? [])
      .map(([name, count]) => `<a class="gb-related" href="#/browse?manufacturer=${encodeURIComponent(slugify(name))}"><span>${esc(name)}</span><span class="text-muted">${count.toLocaleString('en-US')} →</span></a>`)
      .join('')
    app().innerHTML = `
    <div class="page">
      ${navHtml('browse', true)}
      <div class="browse">
        <div class="browse-head"><h2>All manufacturers</h2><span class="text-muted browse-count">${(f?.manufacturers.length ?? 0).toLocaleString('en-US')} makes</span></div>
        <div class="mfr-grid">${items}</div>
      </div>
      ${footerHtml()}
    </div>`
    attachNavSearch(app())
  }
}

interface FacetGroupOpts {
  /** URL param this group filters on — also the `data-facet-group` used by
   *  restoreFacetFocus's group-heading fallback (finding 8). */
  groupKey?: string
  /** Group holds a currently-selected value — keeps a mobile <details> open
   *  across re-renders instead of collapsing away the active context. */
  active?: boolean
  /** Render as a native <details>/<summary> accordion (finding 2a). */
  mobile?: boolean
}

function facetGroup(title: string, linksHtml: string, footer = '', opts: FacetGroupOpts = {}): string {
  if (!linksHtml) return ''
  const { groupKey = '', active = false, mobile = false } = opts
  const groupAttr = groupKey ? ` data-facet-group="${esc(groupKey)}"` : ''
  if (mobile) {
    return `<details class="facet-group"${groupAttr}${active ? ' open' : ''}><summary>${esc(title)}</summary>${linksHtml}${footer}</details>`
  }
  // tabindex so restoreFacetFocus can land here when the exact clicked
  // element (e.g. a removed chip) no longer exists after the re-render.
  return `<div class="facet-group"${groupAttr}><h6 tabindex="-1">${esc(title)}</h6>${linksHtml}${footer}</div>`
}

/**
 * Finding 8's landing spot: the element carrying `facet` ("param:value") if
 * it still exists post-render, else the heading of the group it belonged
 * to, else the results container. `facet` is always one of our own
 * `data-facet` values (slugs, enum keys, or the fixed 'kind'/'sort' params)
 * — never arbitrary text — so it's safe to drop straight into an attribute
 * selector.
 */
function restoreFacetFocus(facet: string): void {
  const exact = app().querySelector<HTMLElement>(`[data-facet="${facet}"]`)
  if (exact) {
    exact.focus({ preventScroll: true })
    return
  }
  const [groupKey] = facet.split(':')
  const heading = app().querySelector<HTMLElement>(`[data-facet-group="${groupKey}"] h6, [data-facet-group="${groupKey}"] summary`)
  if (heading) {
    heading.focus({ preventScroll: true })
    return
  }
  document.getElementById('browse-list')?.focus({ preventScroll: true })
}

function browseRowHtml(r: CatalogRecord): string {
  return `
  <a class="gb-row gb-hit" href="${recordHref(r)}">
    <span class="tag ${r.kind === 'camera' ? 'tag-neutral' : 'tag-outline'}">${r.kind === 'camera' ? 'CAMERA' : 'LENS'}</span>
    <span class="gb-hit-main">
      <span class="gb-hit-title"><strong>${esc(r.name)}</strong>${r.manufacturer ? `<span class="text-muted gb-hit-mfr">${esc(r.manufacturer)}</span>` : ''}</span>
      ${r.line ? `<span class="text-muted gb-hit-line">${esc(r.line)}</span>` : ''}
    </span>
    ${r.year ? `<span class="text-muted gb-hit-year">${r.year}</span>` : ''}
  </a>`
}
