// Superseded by vite.config.ts — kept only as a re-export because this
// sandbox can't unlink files created in an earlier tool call. Turns out Vite
// actually resolves vite.config.js before vite.config.ts when both exist, so
// this file must forward to the real config rather than being empty. Safe to
// delete manually once vite.config.ts is the only one left.
export { default } from './vite.config.ts'
