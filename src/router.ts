// Hash routing (PRD §4.4) — every state is a URL; GitHub Pages has no
// server rewrites. Detail URLs: #/camera/<id>/<slug> — id authoritative,
// slug cosmetic.

export type Route =
  | { view: 'landing' }
  | { view: 'search'; q: string }
  | { view: 'detail'; kind: 'camera' | 'lens'; id: string }
  | { view: 'browse'; params: URLSearchParams }

export function parseRoute(hash: string): Route {
  const h = hash.replace(/^#/, '')
  if (!h || h === '/') return { view: 'landing' }
  const [path, query = ''] = h.split('?')
  const params = new URLSearchParams(query)
  const parts = path.split('/').filter(Boolean)
  if (parts[0] === 'search') return { view: 'search', q: params.get('q') ?? '' }
  if ((parts[0] === 'camera' || parts[0] === 'lens') && parts[1]) {
    return { view: 'detail', kind: parts[0], id: parts[1] }
  }
  if (parts[0] === 'browse') return { view: 'browse', params }
  return { view: 'landing' }
}

export function navigate(hash: string): void {
  location.hash = hash
}
