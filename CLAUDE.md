# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Vite dev server with HMR
npm run build      # tsc -b (typecheck, no emit) then production build -> dist/
npm run typecheck  # tsc -b only, no build
npm run lint       # oxlint (react + oxc plugins)
npm run preview    # serve the built bundle
```

There is no test runner. `npm run typecheck` and `npm run lint` are the automated checks; both also run in CI as part of the build step before deploy (see "Deployment" below).

## Project shape

Tim's Arcade — a kid-friendly retro arcade of canvas mini-games. React 19 + Vite 8 + TypeScript (strict) + Tailwind v4, all client-side, no backend and no network calls at runtime except a Google Fonts link in `index.html` for `Nunito`/`Press Start 2P`. Everything persists to `localStorage`.

`Baloo 2` was replaced with a self-hosted `Lilita One` (`src/assets/game/fonts/`, SIL OFL license) as the display font. It's registered at runtime via the `FontFace` API in `src/lib/font.ts` (called once from `App.tsx`) rather than a static CSS `@font-face` rule — a static rule's `url()` is resolved at CSS-parse time against the page root and doesn't pick up Vite's `base` path, which breaks under the GitHub Pages project-site subpath. `FontFace` uses the real bundled asset URL from a Vite import instead.

## Architecture

**Screen routing** — `src/App.tsx` holds a single `view` string (`profiles | menu | leaderboard | game`) in `useState`. There is no router. Games are registered in the `GAME_META` map in `App.tsx`, typed as `Record<GameId, GameMetaEntry>` so every id in the `GameId` union (defined in `src/lib/storage.ts`) must have an entry — adding a game to `GAMES` without adding it to `GAME_META` is now a compile error, not a silent "Coming Soon" fallback. Exiting a game is done by dispatching a global `arcade:exit-game` CustomEvent on `window` — `GameShell` fires it, `App.tsx` listens — so deeply nested game chrome doesn't need a callback threaded down.

**Global state** — `src/context/ArcadeContext.tsx` wraps the whole app and is the only React-side owner of arcade state. It holds one immutable state object and delegates every mutation to a pure function in `src/lib/storage.ts`, which writes to `localStorage` (key `tims-arcade:v1`) and returns the next state. Consumers use `useArcade()`. The canonical game list (`GAMES`), avatars, and profile colors live in `storage.ts`, not in components. The context's own value object is memoized (`useMemo`) so unrelated re-renders don't recreate it — but nearly every field still depends on the single `state` object, so this only helps when state itself hasn't changed, not real "selector" granularity; splitting into multiple contexts would be the next step if a specific screen's re-render cost ever becomes a real problem.

**Derived-not-stored pattern** — several features compute their entire value live from `state` rather than persisting a dedicated field, specifically so there's nothing that can drift out of sync or need a migration when the derivation logic changes: `getOverallScore`/`getOverallScoreboard` (sum of personal bests across games), `getUnlockedAchievementIds` (checked against `ProfileStats` + `scores` every call), and `getMascotProgress` (the cross-game level/title/XP readout — its XP formula reads `ProfileStats` + per-game scores + achievement count, with no XP field in `ArcadeState` at all). When adding a new "stat-like" feature, prefer this pattern over adding a new stored field unless the value is genuinely expensive to recompute.

**Singletons in `src/lib/`** — deliberately outside React, since games read them every animation frame:
- `input.ts` normalizes keyboard, pointer, touch buttons, and the Gamepad API (polled on a `requestAnimationFrame` loop) down to one action set: `up/down/left/right/confirm/cancel/pause` plus a raw pointer position. Two consumption modes: `subscribeMenuInput(fn)` for edge-triggered menu navigation, and the mutable `controls` object for per-frame polling inside game loops. Multi-source held-state is reference-counted via the `heldEdge` map, so releasing a key doesn't clear a direction the gamepad is still holding. `attachGlobalInput()` is called once from `App.tsx` and is idempotent.
- `audio.ts` exports `engine`, a Web Audio chiptune synth with real-sample enhancement: SFX (`move`, `select`, `back`, `coin`, `hit`, `powerup`, `clear`, `gameover`, `start`, `jump`, `shoot`, `skid`, plus several added since — see `SfxName` for the current full list) first try a decoded CC0 Ogg sample (imported from `src/assets/game/sfx/` as real Vite module URLs — see CREDITS.md), falling back per-name to a synthesized blip if the sample never loaded or the browser can't decode Ogg Vorbis (Safari/iOS) — no game breaks over missing audio. Music is a lookahead step sequencer with a `MusicMood` per game (`menu`, `action`, `sports`, `race`, `space`, `fight`, `maze` — Snake and Munch Maze deliberately share `maze` rather than each getting their own, a judgment call made when it was added); Turbo Dash additionally layers a looping `engine.ogg` hum via `playEngineLoop()`/`setEngineRate()`/`stopEngineLoop()`. Browsers block autoplay, so `engine.unlock()` must be called from a real user gesture — every interactive control calls it before playing anything.
- `sprites.ts` exports a few preloaded `<img>` elements (coin, sparkle, shadow, smoke — same CC0 asset packs, imported from `src/assets/game/sprites/`) plus `drawShadow()`; games check `isReady(img)` before `drawImage`, falling back to the original hand-drawn canvas shape if a sprite hasn't loaded.

**Game contract** — `src/games/GameShell.tsx` owns all chrome shared by every game: the square responsive stage (sized by a `ResizeObserver`, always `min(width, height)`), the ready/paused/gameover overlays, score display, music start/stop, score recording, and mounting `TouchControls`. A game component only receives exactly `{ width, height, paused, onScoreUpdate, onGameOver }` (the `GameComponentProps` type in `src/games/engineTypes.ts`).

**Engine/UI split** — every game is three files, not one, following the contract documented at the top of `src/games/engineTypes.ts`:
- `<game>/engine.ts` — pure game state and logic. No React, no canvas, no DOM, no audio imports. Exports a state interface, `createState(width, height)`, `step(state, input: EngineInput, dtMs, tsMs): EngineEvents` (and `onPointer(state, action)` for games with click/drag input). Anything that was previously a React ref holding mutable game data (timers, edge-detection flags, AI decision counters) now lives as a plain field on the state object, since the engine owns all mutable state.
- `<game>/render.ts` — a single `draw(ctx, state, ts, width, height)` function with every `CanvasRenderingContext2D` call. Reads sprites from `src/lib/sprites.ts`.
- `<game>/<Name>.tsx` — the only file in each game that touches React, refs, or the DOM. Owns the `<canvas>` element, runs the `requestAnimationFrame` loop, reads the global `controls` object each frame to build an `EngineInput`, calls `step()` then `draw()`, translates pointer events into canvas-relative coordinates for `onPointer`, and decides which sound effect to play based on the `EngineEvents` returned by `step()` (engine files never call `engine.playSfx()` directly — that's a UI-layer side effect). Several games extend the base `EngineEvents` with extra optional fields (e.g. `ateGhost`, `shotFired`, `hitLanded`) so the UI can distinguish which specific sfx to trigger; `score`/`gameOver` always keep the meaning `GameShell` expects.
- Reference implementation: `src/games/snake/{engine,render,SnakeGame}.ts(x)` — read this first when adding a new game or touching an existing one.

This split was retrofitted onto all 6 games (they originally interleaved logic and rendering in one `tick()` function per game) specifically so a game's rules can be unit-tested or swapped out without touching canvas code, and so the rendering/juice can be reworked without risk of changing game balance.

## Typography

Three type families, each with one job — written down here because the rule previously only existed as scattered class names across a dozen files:
- **`font-display`** (`Lilita One`) — screen titles, big numbers/scores, banner/celebration text, and anything meant to feel like the loudest thing on screen.
- **`font-pixel`** (`Press Start 2P`) — compact stat/HUD-style labels only (play counts, XP readouts, "WAVE 3", badge counters) — always small (`text-[8px]` to `text-[10px]`), never body copy, since it's illegible at normal paragraph sizes.
- **`font-body`** (`Nunito`, the default via `body`'s `font-family`) — everything else: instructions, descriptions, button labels that aren't a HUD stat, settings copy.

If a new screen needs a type choice that doesn't obviously fit one of these three, default to `font-body` and reconsider whether it's really a "loud" (`display`) or "HUD" (`pixel`) moment before reaching for one of the other two.

## Design/architecture patterns worth reusing

- **Derived, not stored** — `getOverallScore`/`getOverallScoreboard`, `getUnlockedAchievementIds`, and `getMascotProgress` (the cross-game level/title/XP readout) all compute their entire value live from `ArcadeState` rather than persisting a dedicated field, specifically so nothing can drift out of sync or need a migration when the derivation logic changes. Prefer this over a new stored field for any new "stat-like" feature unless the value is genuinely expensive to recompute.
- **Accent-colored, currentColor SVG icons** (`src/lib/gameIcons.tsx`, `src/components/MascotAvatar.tsx`) — small inline SVGs that draw with `fill/stroke="currentColor"` and take their color from a `text-{accent}` class or a CSS custom property, rather than a hardcoded hex. This is the pattern to follow for any new icon/mascot art rather than sourcing another asset pack — no new asset curation needed, and the icon automatically stays correct if a game's accent color ever changes.

## TypeScript

Strict mode (`tsconfig.app.json`), `tsc -b` project references, no `any` except where genuinely unavoidable around canvas/DOM APIs. One recurring pattern worth knowing: inside a game's `<Name>.tsx`, the `requestAnimationFrame` loop is typically set up as `const ctx = canvas?.getContext("2d"); if (!ctx) return; function tick(ts) { ... draw(ctx!, ...) }` — TypeScript can't narrow `ctx` across that nested-function closure boundary even though it's checked non-null just above, so a `ctx!` non-null assertion (with a short comment) is the accepted workaround, not a bug to "fix" by restructuring.

A handful of superseded `.js`/`.jsx` files still exist alongside their `.ts`/`.tsx` replacements (e.g. `src/lib/audio.js`, `src/games/snake/SnakeGame.jsx`) containing only a one-line re-export shim (`export * from "./audio.ts"` or `export { default } from "./Name.tsx"`). These are harmless leftovers from a sandbox limitation that prevented deleting files created in an earlier session — they are dead code, nothing imports them, and they're safe to delete by hand locally; don't be alarmed if you see both a `.jsx` and `.tsx` version of the same file.

## Deployment

`.github/workflows/deploy.yml` builds and deploys to GitHub Pages on every push to `main` (or manual dispatch): `npm ci` → `npm run build` (which runs `tsc -b` then `vite build`) with `BASE_PATH` set to `/${{ github.event.repository.name }}/` → `actions/upload-pages-artifact` → `actions/deploy-pages`. `vite.config.ts` reads `base` from `process.env.BASE_PATH`, defaulting to `/` for local dev and any non-Pages host. This matters because every asset URL (fonts, sfx, sprites, the JS/CSS bundle itself) needs the `/tims-arcade/` prefix to resolve correctly once the site is served from `https://<user>.github.io/tims-arcade/` instead of a domain root — that's also why fonts/sfx/sprites are real Vite module imports rather than hardcoded `/game-assets/...` strings (see CREDITS.md).

To enable Pages for this repo (one-time, done in the GitHub UI, not in code): Settings → Pages → Source → "GitHub Actions".

## Known gotchas

`public/assets/` (raw Kenney source packs, each with its own nested `.git`) has repeatedly been used as the drop location for new asset packs (three times so far, 2026-08-31) and each time had to be moved to `asset-packs/` at the project root and gitignored — anything inside `public/` is copied verbatim into every production build, and these are unmodified, tens-of-MB-per-batch downloads, not shippable assets. **If the user drops more packs in `public/assets/` (or anywhere else under `public/`) later, check for this before running a production build** — move the raw pack folders into `asset-packs/`, and only copy the small curated files actually used by a game into `src/assets/game/` (imported as real Vite modules, never referenced by a hardcoded path string). If a raw pack folder can't be deleted (`rm -rf` failing with `EPERM` is a known recurring sandbox limitation), try `mv`-ing it out of `public/` instead — that's succeeded even when `rm` on the same folder hasn't, since moving it out of `public/` is all that actually matters for build size. See `CREDITS.md` for what came from where and under what license, including a "Where things live" note about this exact recurring pattern. (A stale duplicate copy of assets used to also live at `public/game-assets/` from before the TypeScript migration — it's since been deleted; if it ever reappears, that's the same class of mistake and should be removed again.)

Ogg Vorbis (the format all the bundled SFX/music samples are in) has no native decode support in Safari/iOS's Web Audio API. `audio.ts` treats every sample as an optional enhancement — `playSfx()` always has a synthesized fallback, so this degrades silently rather than breaking.

A few leftover build-verification folders (`dist2`-`dist5`, `dist-verify*`) may exist at the project root from one-off sandboxed build checks; they're gitignored and safe to delete by hand.
