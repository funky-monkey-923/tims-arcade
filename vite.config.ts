import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
