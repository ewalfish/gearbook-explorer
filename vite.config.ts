import { defineConfig } from 'vite'

// Relative base so the site works from any GitHub Pages project subpath
// (https://ewalfish.github.io/gearbook-explorer/) without configuration.
// Hash routing means deep links never need server rewrites.
export default defineConfig({
  base: './',
  // Stamp the build so data fetches can be cache-busted. GitHub Pages serves
  // /data/*.json with `Cache-Control: max-age=600` and those filenames are NOT
  // content-hashed (only the JS/CSS bundles are), so for ten minutes after a
  // deploy a returning visitor reads a fresh app against a stale index — which
  // is exactly how a masthead ends up quoting last week's record counts.
  define: {
    __BUILD_STAMP__: JSON.stringify(process.env.GEARBOOK_BUILD || String(Date.now())),
  },
  build: {
    target: 'es2022',
    // dist/ belongs to the LIBRARY build (tsc -p tsconfig.lib.json — the
    // package.json exports point there). The SPA bundle goes to dist-app/.
    outDir: 'dist-app',
  },
})
