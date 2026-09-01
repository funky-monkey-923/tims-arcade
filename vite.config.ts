import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // The app was already fully offline-capable in spirit (no backend, no
    // network calls after the first load, everything persisted to
    // localStorage) — this just makes that real: a service worker
    // precaches the build output so a repeat visit (or a flaky/offline
    // connection) still loads, and a manifest makes "Add to Home Screen" /
    // desktop install actually work instead of just opening a browser tab.
    VitePWA({
      registerType: 'autoUpdate',
      // Precache everything Vite actually builds (js/css/html/fonts/images/
      // audio) rather than hand-maintaining a list — this app's asset set
      // changes often (new sprites/sfx land in most sessions) and a manual
      // list would silently rot.
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,svg,png,ttf,ogg}'],
        // The chiptune audio engine decodes samples via fetch() at runtime
        // (see src/lib/audio.ts) rather than <audio> tags, and some .ogg
        // files exceed Workbox's conservative default precache size limit —
        // raise it rather than excluding audio from the offline cache.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      manifest: {
        name: "Tim's Arcade",
        short_name: "Tim's Arcade",
        description: "Six easy, colorful mini-games for kids — keyboard, mouse, touch, or controller.",
        // Matches <meta name="theme-color"> in index.html and --color-night
        // in src/index.css, so the OS chrome/splash screen doesn't clash
        // with the app's own background the instant it opens.
        theme_color: '#1a1140',
        background_color: '#1a1140',
        display: 'standalone',
        orientation: 'any',
        // Relative (no leading "/") so these resolve correctly whether the
        // app is deployed at a domain root or, as on GitHub Pages, under a
        // "/tims-arcade/" project-site subpath (see the `base` comment
        // below) — vite-plugin-pwa applies Vite's `base` to these at build.
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  // GitHub Pages project sites are served from https://<user>.github.io/<repo>/,
  // not the domain root, so every asset reference needs that prefix. The
  // deploy workflow sets BASE_PATH to "/<repo-name>/" at build time; local
  // dev and any other host (Vercel/Netlify/custom domain root, etc.) just
  // get the default "/".
  base: process.env.BASE_PATH || '/',
  // .ogg is ambiguous between audio/video — make sure Vite treats it as an
  // importable asset (see src/lib/audio.ts) rather than trying to parse it.
  assetsInclude: ['**/*.ogg'],
})
