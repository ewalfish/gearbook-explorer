// View renderers — landing, search results, spec sheets, browse.
// Each returns HTML (all record data escaped) and wires events after mount.

import { getEngine, getFacets, loadCatalog, loadRecord } from './data'
import { fmtFocal } from './format'
import { slugify } from './engine/normalize'
import {
  esc, navHtml, footerHtml, hitRowHtml, recordHref,
  attachTypeahead, attachNavSearch, SEARCH_ICON, EXTERNAL_ICON,
} from './ui'
import type { CatalogRecord, GearRecord, Kind, Variant } from './types'

const app = () => document.getElementById('app')!

const REPO_URL = 'https://github.com/ewalfish/gearbook-explorer'

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
  const typeBits = [d.format && d.format !== 'digital' ? d.format : '', prettyType(d.camera_type)]
    .filter(Boolean).join(' ')
  if (typeBits) rows.push(dtDd('Type', esc(typeBits)))
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
  if (d.mount) {
    const links = d.mount.split(',').map((m) => m.trim()).filter(Boolean)
      .map((m) => `<a href="${browseMountHref(m)}">${esc(m)}</a>`).join(', ')
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

const PRETTY_TYPE: Record<string, string> = {
  'slr': 'SLR', 'tlr': 'TLR', 'point-and-shoot': 'point-and-shoot',
}
function prettyType(t?: string): string {
  if (!t) return ''
  return PRETTY_TYPE[t] ?? t.replace(/-/g, ' ')
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
    kind === 'lens' && d.mount ? `${d.mount.split(',')[0].trim()} mount` : '',
    d.country,
    yearsRange(d).replace(/ /g, ''),
  ].filter(Boolean).join(' · ')

  const mounts = (kind === 'camera' ? d.lens_mount : d.mount)?.split(',').map((m) => m.trim()).filter(Boolean) ?? []
  const recType = kind === 'camera' ? (d.camera_type ?? '') : (d.lens_type ?? '')
  const recYear = d.year_introduced ?? 0
  const sameMfr = catalog
    .filter((r) => r.manufacturer === d.manufacturer && r.kind === kind && r.id !== id)
    .sort((a, b) => {
      const ta = a.type === recType ? 0 : 1
      const tb = b.type === recType ? 0 : 1
      if (ta !== tb) return ta - tb
      if (recYear) return Math.abs((a.year || recYear) - recYear) - Math.abs((b.year || recYear) - recYear)
      return 0
    })
    .slice(0, 4)
  const crossKind: Kind = kind === 'camera' ? 'lens' : 'camera'
  const mountMatches = mounts.length
    ? catalog.filter((r) => r.kind === crossKind && r.mounts.some((m) => mounts.some((mm) => m.toLowerCase() === mm.toLowerCase()))).slice(0, 4)
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

  const kind = params.get('kind')
  const type = params.get('type')
  const format = params.get('format')
  const mount = params.get('mount')
  const manufacturer = params.get('manufacturer')
  const medium = params.get('medium')

  let rows = catalog
  if (kind) rows = rows.filter((r) => r.kind === kind)
  if (type) rows = rows.filter((r) => r.type === type)
  if (format) rows = rows.filter((r) => r.format === format)
  if (medium) rows = rows.filter((r) => r.medium === medium)
  if (mount) rows = rows.filter((r) => r.mounts.some((m) => slugify(m) === mount))
  if (manufacturer) rows = rows.filter((r) => slugify(r.manufacturer) === manufacturer)

  const filters: { label: string; param: string }[] = []
  if (kind) filters.push({ label: kind === 'camera' ? 'Cameras' : 'Lenses', param: 'kind' })
  if (type) filters.push({ label: prettyType(type), param: 'type' })
  if (format) filters.push({ label: format, param: 'format' })
  if (medium) filters.push({ label: medium, param: 'medium' })
  if (mount) filters.push({ label: rows[0]?.mounts.find((m) => slugify(m) === mount) ?? mount, param: 'mount' })
  if (manufacturer) filters.push({ label: rows[0]?.manufacturer ?? manufacturer, param: 'manufacturer' })

  document.title = filters.length
    ? `${filters.map((f) => f.label).join(' · ')} — Gearbook`
    : 'Browse — Gearbook'

  const chip = (f: { label: string; param: string }) => {
    const next = new URLSearchParams(params)
    next.delete(f.param)
    const qs = next.toString()
    return `<a class="chip" href="#/browse${qs ? `?${qs}` : ''}">${esc(f.label)} ✕</a>`
  }

  const facetLink = (param: string, value: string, label: string, count: number) => {
    const next = new URLSearchParams(params)
    next.set(param, value)
    return `<a class="facet-link${params.get(param) === value ? ' is-active' : ''}" href="#/browse?${next.toString()}">${esc(label)} <span class="text-muted">${count.toLocaleString('en-US')}</span></a>`
  }

  const countBy = (fn: (r: CatalogRecord) => string | string[]) => {
    const m = new Map<string, number>()
    for (const r of rows) {
      const v = fn(r)
      for (const x of Array.isArray(v) ? v : [v]) {
        if (x) m.set(x, (m.get(x) ?? 0) + 1)
      }
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }

  const typeFacet = countBy((r) => r.type).slice(0, 10)
    .map(([v, n]) => facetLink('type', v, prettyType(v), n)).join('')
  const formatFacet = countBy((r) => r.format).slice(0, 10)
    .map(([v, n]) => facetLink('format', v, v, n)).join('')
  const mountFacet = countBy((r) => r.mounts).slice(0, 10)
    .map(([v, n]) => facetLink('mount', slugify(v), v, n)).join('')
  const mfrFacet = countBy((r) => r.manufacturer).slice(0, 10)
    .map(([v, n]) => facetLink('manufacturer', slugify(v), v, n)).join('')

  const shown = rows.slice(0, PAGE_SIZE)
  const listRows = shown.map((r) => browseRowHtml(r)).join('')

  app().innerHTML = `
  <div class="page">
    ${navHtml('browse', true)}
    <div class="browse">
      <div class="browse-head">
        <h2>Browse</h2>
        <div class="chips">${filters.map(chip).join('')}</div>
        <span class="text-muted browse-count">${rows.length.toLocaleString('en-US')} records</span>
      </div>
      <div class="browse-grid">
        <aside class="facet-col">
          ${facetGroup('Manufacturer', mfrFacet)}
          ${facetGroup('Type', typeFacet)}
          ${facetGroup('Film format', formatFacet)}
          ${facetGroup('Mount', mountFacet)}
        </aside>
        <div class="browse-list" id="browse-list">${listRows || '<p class="text-muted empty-note">Nothing matches this combination.</p>'}
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

function facetGroup(title: string, linksHtml: string): string {
  if (!linksHtml) return ''
  return `<div class="facet-group"><h6>${esc(title)}</h6>${linksHtml}</div>`
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
