import { defineConfig } from 'vite'

// Relative base so the site works from any GitHub Pages project subpath
// (https://ewalfish.github.io/gearbook-explorer/) without configuration.
// Hash routing means deep links never need server rewrites.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    // dist/ belongs to the LIBRARY build (tsc -p tsconfig.lib.json — the
    // package.json exports point there). The SPA bundle goes to dist-app/.
    outDir: 'dist-app',
  },
})
