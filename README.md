# 🕹️ Tim's Arcade

**Six classic-inspired mini-games. Zero servers. Zero sign-ups. 100% built by learning Claude, Claude Code, and AI-assisted development from scratch.**

This is a browser-based arcade cabinet — snake, pac-man, space invaders, a fighting game, soccer, and racing, all reimagined with their own physics, power-ups, difficulty tiers, and boss fights. Everything runs client-side, saves locally, and works offline. No backend, no database, no tracking — just pick a profile and start playing.

> Built as a hands-on project to learn Claude, Claude Code, and AI-assisted development, one feature at a time. If you're curious what "vibe-coding a whole app with an AI pair programmer" actually looks like end-to-end, this repo is the paper trail.

---

## 🎮 Play Six Games, Not One

| Game | What it is | What makes it more than the classic |
|---|---|---|
| 🐍 **Wiggle Worm** | Snake | Munch coins, don't hit the walls or yourself |
| 👻 **Munch Maze** | Pac-Man | Power dots turn the chasers blue — turn the tables and gobble them up |
| 🚀 **Star Defender** | Space Invaders | Destructible bunkers, shielded and diving enemy types, a bonus UFO, power-up drops, and a boss battle every 3rd wave |
| 🥊 **Rumble Ring** | Street Fighter–style 1v1 | Pick a fighter, best-of-3 rounds, punches/kicks/throws, blocking, and a super meter for a match-ending finisher |
| ⚽ **Kickoff Clash** | 2v2 soccer | Charge-up shots, a stamina bar, juke moves, two halves with a halftime break, and penalty shootouts when it's tied |
| 🏎️ **Turbo Dash** | Top-down racing | Lap-based circuits, nitro boosts, rival AI racers, and a crash-penalty system instead of instant death |

Every game has its own difficulty tiers, its own sound effects and music, and its own scoring — no two cabinets feel the same.

## ✨ Why It's More Than "6 Simple Games"

- **Up to 6 local profiles** — everyone in the house gets their own name, avatar, and scores, no accounts required.
- **Real leaderboards** — track your personal best, your last run, and an all-time record across every profile, plus an aggregate **Overall Score** across all 6 games.
- **An achievements system** that actually unlocks — no flags to reset, no save file to corrupt; every badge is computed live from your stats.
- **A synthesized chiptune audio engine** — built from scratch with the Web Audio API, with independent music/SFX volume and mute, plus real royalty-free sound design layered on top.
- **Built for every input** — keyboard, gamepad, on-screen touch controls, even pointer drag, all through one unified control scheme so it plays as well on a tablet as it does at a desk.
- **Accessibility, not an afterthought** — a reduced-motion mode, color-independent gameplay indicators (nothing important is ever color-only), and high-contrast focus rings.
- **Fully offline-capable** — everything after the first load lives in `localStorage`. No account, no internet connection required once it's open.

## 🛠️ Built With

- **React 19** + **Vite** for the app shell and UI
- **TypeScript**, strict mode, project references — every game's logic is fully typed
- **Tailwind CSS v4** for the retro-cabinet visual design system
- **Canvas 2D** for every game — no game engine, no physics library, hand-rolled rendering and collision for all 6 games
- **Web Audio API** — a custom synthesized sound engine, no audio middleware
- Royalty-free CC0 art and sound assets from [Kenney.nl](https://kenney.nl) (see [`CREDITS.md`](./CREDITS.md) for the full breakdown)

Each game is split cleanly into three layers — a pure game-logic engine, a canvas renderer, and a thin React wrapper — so the "rules" of a game never touch the DOM and the drawing code never touches game state. It's the same pattern across all 6 games, which made the project a genuinely good way to learn how to structure something bigger than a toy script.

## 🚀 Running It Locally

```bash
git clone <this-repo>
cd tims-arcade
npm install
npm run dev
```

Then open the local URL Vite prints — that's it, no environment variables, no API keys, no database setup.

Other useful commands:

```bash
npm run build      # type-check + production build
npm run typecheck   # TypeScript project-wide check
npm run lint        # oxlint
npm run preview     # preview the production build locally
```

## 🌐 Deployment

Ships to **GitHub Pages** automatically via GitHub Actions on every push to `main` — see `.github/workflows/deploy.yml`. The build is base-path-aware, so it works whether it's hosted at the domain root or under a `/repo-name/` project-site path.

## 📄 Credits & License

All third-party art, audio, and fonts are credited in [`CREDITS.md`](./CREDITS.md) — everything used is CC0 (public domain), courtesy of the incredible [Kenney.nl](https://kenney.nl) asset library.

---

*A learning project, built one session at a time — new games, features, and polish keep getting added as the journey continues. 🎉*
