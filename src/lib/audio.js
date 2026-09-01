// Superseded by audio.ts (this project was converted to TypeScript). This
// shim only exists because the build sandbox couldn't delete this file
// when it was renamed — Vite's extensionless module resolution tries .js
// before .ts, so without this re-export, imports of "./audio" would
// silently pick up a stale copy instead of the real TypeScript module.
// Safe to delete once you have normal filesystem access.
export * from "./audio.ts";
