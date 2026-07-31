import './styles.css'
import { boot } from './data'
import { parseRoute } from './router'
import { renderLanding, renderSearch, renderDetail, renderBrowse, updateIndexStatus } from './views'

let booted = false

async function route(): Promise<void> {
  const r = parseRoute(location.hash)
  switch (r.view) {
    case 'landing':
      renderLanding()
      if (!booted) updateIndexStatus(null, false)
      break
    case 'search':
      await renderSearch(r.q)
      break
    case 'detail':
      await renderDetail(r.kind, r.id)
      break
    case 'browse':
      await renderBrowse(r.params)
      break
  }
  window.scrollTo(0, 0)
}

window.addEventListener('hashchange', () => {
  void route()
})

// The detail view picks its wide/narrow markup at render time while the CSS
// switches on a media query — crossing 1400px with stale markup renders the
// wide tree as naked unstyled text (a window snap from maximized is exactly
// this gesture). Re-route on the boundary so markup and CSS agree again.
window.matchMedia('(min-width: 1400px)').addEventListener('change', () => {
  if (parseRoute(location.hash).view === 'detail') void route()
})

async function start(): Promise<void> {
  // Paint the shell immediately; the index streams in behind it.
  void route()
  try {
    await boot((frac) => updateIndexStatus(frac, false))
    booted = true
    updateIndexStatus(null, true)
    // Landing and search both render before the index arrives — the landing
    // just lacks its counts, but a cold-loaded search URL computed its hits
    // against a not-yet-loaded engine and showed "No matches" forever.
    // Re-render either once the index is ready.
    const r = parseRoute(location.hash)
    if (r.view === 'landing') renderLanding()
    else if (r.view === 'search') await renderSearch(r.q)
  } catch (err) {
    const el = document.getElementById('index-status')
    if (el) {
      el.hidden = false
      el.textContent = 'Could not load the search index — reload to retry.'
    }
    console.error(err)
  }
}

void start()
