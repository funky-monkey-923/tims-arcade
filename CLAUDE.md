# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Vite dev server with HMR
npm run build    # production build -> dist/
npm run preview  # serve the built bundle
npm run lint     # oxlint (react + oxc plugins)
```

There is no test runner, no TypeScript, and no CI configured. `npm run lint` is the only automated check.

## Project shape

Tim's Arcade — a kid-friendly retro arcade of canvas mini-games. React 19 + Vite 8 + Tailwind v4, all client-side, no backend and no network calls at runtime (only the Google Fonts link in `index.html`). Everything persists to `localStorage`.

Fonts (`Baloo 2`, `Nunito`, `Press Start 2P`) load from a `<link>` in `index.html`, not from CSS.

## Architecture

Three layers, each with one job:

**Screen routing** — `src/App.jsx` holds a single `view` string (`profiles | menu | leaderboard | game`) in `useState`. There is no router. Games are registered in the `GAME_META` map in `App.jsx` (title, subtitle, instructions, component, touch-control options); an id present in `GAME_META` is launchable, an id absent from it falls through to the "Coming Soon" modal. Exiting a game is done by dispatching a global `arcade:exit-game` CustomEvent on `window` — `GameShell` fires it, `App.jsx` listens — so deeply nested game chrome doesn't need a callback threaded down.

**Global state** — `src/context/ArcadeContext.jsx` wraps the whole app and is the only React-side owner of arcade state. It holds one immutable state object and delegates every mutation to a pure function in `src/lib/storage.js`, which writes to `localStorage` (key `tims-arcade:v1`) and returns the next state. Consumers use `useArcade()`. The canonical game list (`GAMES`), avatars, and profile colors live in `storage.js`, not in components.

**Singletons in `src/lib/`** — deliberately outside React, since games read them every animation frame:
- `input.js` normalizes keyboard, pointer, touch buttons, and the Gamepad API (polled on a `requestAnimationFrame` loop) down to one action set: `up/down/left/right/confirm/cancel/pause` plus a raw pointer position. Two consumption modes: `subscribeMenuInput(fn)` for edge-triggered menu navigation, and the mutable `controls` object for per-frame polling inside game loops. Multi-source held-state is reference-counted via the `heldEdge` map, so releasing a key doesn't clear a direction the gamepad is still holding. `attachGlobalInput()` is called once from `App.jsx` and is idempotent.
- `audio.js` exports `engine`, a Web Audio chiptune synth — no audio files exist in the repo. SFX are named blips (`move`, `select`, `back`, `coin`, `hit`, `powerup`, `clear`, `gameover`, `start`); music is a lookahead step sequencer with `menu` and `action` moods. Browsers block autoplay, so `engine.unlock()` must be called from a real user gesture — every interactive control calls it before playing anything.

**Game contract** — `src/games/GameShell.jsx` owns all chrome shared by every game: the square responsive stage (sized by a `ResizeObserver`, always `min(width, height)`), the ready/paused/gameover overlays, score display, music start/stop, score recording, and mounting `TouchControls`. A game component is only a `<canvas>` plus its loop, and receives exactly `{ width, height, paused, onScoreUpdate, onGameOver }`. Game state lives in a `useRef` (never `useState` — the render loop mutates it in place), the loop is a `requestAnimationFrame` tick that early-returns while `paused`, and fixed-step games gate movement on a `TICK_MS` accumulator while still drawing every frame.

## Conventions

## Known gotchas
