// Shared chrome (nav, footer, result rows) + the typeahead combobox.

import { getEngine, getCatalogSync, getFacets } from './data'
import { slugify } from './normalize'
import type { SearchHit } from './engine'
import type { CatalogRecord } from './types'

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export const SEARCH_ICON =
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.2-3.2"></path></svg>'

export const EXTERNAL_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8"></path></svg>'

export function recordHref(rec: Pick<CatalogRecord, 'kind' | 'id' | 'name'>): string {
  return `#/${rec.kind}/${rec.id}/${slugify(rec.name)}`
}

export function navHtml(current: 'cameras' | 'lenses' | 'browse' | null, withSearch: boolean): string {
  return `
  <div class="nav">
    <a class="nav-brand" href="#/"><span class="brand-mark"></span>GEARBOOK</a>
    <a href="#/browse?kind=camera"${current === 'cameras' ? ' aria-current="page"' : ''}>Cameras</a>
    <a href="#/browse?kind=lens"${current === 'lenses' ? ' aria-current="page"' : ''}>Lenses</a>
    <a href="#/browse"${current === 'browse' ? ' aria-current="page"' : ''}>Browse</a>
    ${withSearch ? `
    <div class="nav-search" data-typeahead-compact>
      ${SEARCH_ICON}
      <input type="search" placeholder="Search…" aria-label="Search cameras and lenses"
        role="combobox" aria-expanded="false" aria-haspopup="listbox" aria-autocomplete="list" autocomplete="off">
    </div>` : ''}
  </div>`
}

export function footerHtml(): string {
  const version = getFacets()?.version ?? '…'
  return `
  <footer class="gb-footer">
    <span>GEARBOOK · anonymized fact index</span>
    <span>data version ${esc(version)}</span>
  </footer>`
}

export function hitRowHtml(hit: SearchHit, selected: boolean, compact = false): string {
  const rec = getCatalogSync()?.find((r) => r.id === hit.id)
  if (!rec) return ''
  const kindTag = hit.kind === 'camera' ? (compact ? 'CAM' : 'CAMERA') : (compact ? 'LENS' : 'LENS')
  const tagClass = hit.kind === 'camera' ? 'tag-neutral' : 'tag-outline'
  const mfrBits = [rec.manufacturer, rec.medium === 'digital' ? 'digital' : ''].filter(Boolean)
  return `
  <a class="gb-row gb-hit${selected ? ' is-selected' : ''}" role="option" href="${recordHref(rec)}"
     aria-selected="${selected}" id="ta-opt-${esc(hit.id)}" data-id="${esc(hit.id)}">
    <span class="tag ${tagClass}">${kindTag}</span>
    <span class="gb-hit-main">
      <span class="gb-hit-title"><strong>${esc(rec.name)}</strong>${mfrBits.length ? `<span class="text-muted gb-hit-mfr">${esc(mfrBits.join(' · '))}</span>` : ''}</span>
      ${rec.line ? `<span class="text-muted gb-hit-line">${esc(rec.line)}</span>` : ''}
      ${hit.matchedAlias ? `<span class="gb-hit-alias"><em>${esc(hit.matchedAlias)}</em><span class="text-muted"> → matched name</span></span>` : ''}
    </span>
    ${rec.year ? `<span class="text-muted gb-hit-year">${rec.year}</span>` : ''}
  </a>`
}

interface TypeaheadOpts {
  /** Hero variant renders the dropdown attached below the big search box. */
  hero?: boolean
  initial?: string
}

/** WAI-ARIA combobox typeahead (PRD §4.1). Matching runs on every keystroke —
 *  only the render is frame-batched. */
export function attachTypeahead(container: HTMLElement, opts: TypeaheadOpts = {}): void {
  const input = container.querySelector('input')
  if (!input) return
  if (opts.initial) input.value = opts.initial

  const dropdown = document.createElement('div')
  dropdown.className = `ta-dropdown${opts.hero ? ' ta-dropdown-hero' : ''}`
  dropdown.setAttribute('role', 'listbox')
  dropdown.setAttribute('aria-label', 'Suggestions')
  dropdown.hidden = true
  container.appendChild(dropdown)
  container.classList.add('ta-container')

  let hits: SearchHit[] = []
  let active = -1
  let raf = 0

  const close = () => {
    dropdown.hidden = true
    input.setAttribute('aria-expanded', 'false')
    active = -1
  }

  const render = () => {
    const q = input.value.trim()
    if (!q || hits.length === 0) {
      if (q && getEngine()) {
        dropdown.hidden = false
        input.setAttribute('aria-expanded', 'true')
        dropdown.innerHTML = `<div class="ta-empty text-muted">No matches — try fewer words or a different spelling.</div>`
      } else {
        close()
      }
      return
    }
    dropdown.hidden = false
    input.setAttribute('aria-expanded', 'true')
    const rows = hits.map((h, i) => hitRowHtml(h, i === active)).join('')
    dropdown.innerHTML = `
      ${rows}
      <div class="ta-footer">
        <span class="ta-keys">↑↓ navigate · ↵ open · esc dismiss</span>
        <a href="#/search?q=${encodeURIComponent(q)}">See all results →</a>
      </div>`
    if (active >= 0) {
      input.setAttribute('aria-activedescendant', `ta-opt-${hits[active].id}`)
    } else {
      input.removeAttribute('aria-activedescendant')
    }
  }

  const update = () => {
    const engine = getEngine()
    const q = input.value.trim()
    hits = engine && q ? engine.search(q, 10) : []
    active = -1
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(render)
  }

  input.addEventListener('input', update)
  input.addEventListener('focus', () => {
    if (input.value.trim()) update()
  })
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (hits.length === 0) return
      e.preventDefault()
      active = e.key === 'ArrowDown'
        ? (active + 1) % hits.length
        : (active - 1 + hits.length) % hits.length
      render()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const q = input.value.trim()
      if (active >= 0 && hits[active]) {
        const rec = getCatalogSync()?.find((r) => r.id === hits[active].id)
        location.hash = rec ? recordHref(rec) : `#/${hits[active].kind}/${hits[active].id}`
      } else if (q) {
        location.hash = `#/search?q=${encodeURIComponent(q)}`
      }
      close()
    } else if (e.key === 'Escape') {
      close()
    }
  })
  document.addEventListener('click', (e) => {
    if (!container.contains(e.target as Node)) close()
  })
}

/** Wire the compact nav search present on detail/browse pages. */
export function attachNavSearch(rootEl: HTMLElement): void {
  const compact = rootEl.querySelector<HTMLElement>('[data-typeahead-compact]')
  if (compact) attachTypeahead(compact)
}
