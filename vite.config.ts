import { defineConfig } from 'vite'

// Relative base so the site works from any GitHub Pages project subpath
// (https://ewalfish.github.io/gearbook-explorer/) without configuration.
// Hash routing means deep links never need server rewrites.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
  },
})
