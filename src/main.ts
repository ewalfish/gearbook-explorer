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

async function start(): Promise<void> {
  // Paint the shell immediately; the index streams in behind it.
  void route()
  try {
    await boot((frac) => updateIndexStatus(frac, false))
    booted = true
    updateIndexStatus(null, true)
    // Landing renders before facets/counts arrive — re-render once ready.
    const r = parseRoute(location.hash)
    if (r.view === 'landing') renderLanding()
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
