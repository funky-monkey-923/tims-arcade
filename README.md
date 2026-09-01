# 🕹️ Tim's Arcade

### six games. zero servers. zero chill.

**Six classic-inspired mini-games. Zero servers. Zero sign-ups. 100% built by learning Claude, Claude Code, and AI-assisted development from scratch — no cap.**

This is a browser-based arcade cabinet that showed up one `npm create vite@latest` at a time and never left. Snake, Pac-Man, Space Invaders, a fighting game, soccer, and racing — all reimagined with their own physics, power-ups, difficulty tiers, and boss fights, because apparently "just make Snake" was never actually on the table. Everything runs client-side, saves locally, and works offline. No backend, no database, no tracking, no cookie banner asking permission to exist — just pick a profile and go feral on a leaderboard.

> Built as a hands-on project to learn Claude, Claude Code, and AI-assisted development, one feature at a time, mostly by yelling "can we make it bigger" at an AI until it agreed. If you're curious what "vibe-coding a whole app with an AI pair programmer" actually looks like end-to-end — commits, scope creep, six overhaul passes, and all — this repo is the paper trail. 📜✨

---

## 🎮 Play Six Games, Not One (we checked, it's six)

| Game | What it is | What makes it more than the classic |
|---|---|---|
| 🐍 **Wiggle Worm** | Snake | Munch coins, don't hit the walls or yourself. Groundbreaking stuff, truly. |
| 👻 **Munch Maze** | Pac-Man | Power dots turn the chasers blue — turn the tables and gobble them up. The turn of the century, honestly. |
| 🚀 **Star Defender** | Space Invaders | Destructible bunkers, shielded and diving enemy types, a bonus UFO, power-up drops, and a boss battle every 3rd wave. The aliens did NOT see this coming. |
| 🥊 **Rumble Ring** | Street Fighter–style 1v1 | Pick a fighter, best-of-3 rounds, punches/kicks/throws, blocking, and a super meter for a match-ending finisher. It's giving main character energy. |
| ⚽ **Kickoff Clash** | 2v2 soccer | Charge-up shots, a stamina bar, juke moves, two halves with a halftime break, and penalty shootouts when it's tied. Football (soccer) but make it dramatic. |
| 🏎️ **Turbo Dash** | Top-down racing | Lap-based circuits, nitro boosts, rival AI racers, a curving road (we found out roads can just... curve, and it changed us), and a crash-penalty system instead of instant death. Mercy is a game mechanic now. |

Every game has its own difficulty tiers, its own sound effects and music, and its own scoring — no two cabinets feel the same, and yes we are still emotionally invested in whether you beat your personal best in Wiggle Worm. We NEED to know.

## ✨ Why It's More Than "6 Simple Games" 🚨

Look. LOOK. We could have stopped at "six canvas games in a folder." We did not stop. Here's the receipts:

- **Up to 6 local profiles** — everyone in the house gets their own name, avatar, and scores, no accounts, no passwords, no "forgot password" email spiral at 11pm.
- **Real leaderboards** — personal best, last run, an all-time record across every profile, plus an aggregate **Overall Score** across all 6 games, because one number to rule them all hits different.
- **An achievements system** that actually unlocks — no flags to reset, no save file to corrupt; every badge is computed live from your stats, so it can't lie to you even if it wanted to.
- **A synthesized chiptune audio engine**, built from scratch with the Web Audio API, because buying sound effects is for cowards. Independent music/SFX volume and mute, plus real royalty-free sound design on top, because we DO have some self-respect.
- **Built for every input** — keyboard, gamepad, on-screen touch controls, even pointer drag, all through one unified control scheme, so it plays as well on a tablet as it does at a desk at 2am making Very Important Decisions about Rumble Ring's hitstun timing.
- **Accessibility, not an afterthought** — a reduced-motion mode, color-independent gameplay indicators (nothing important is EVER color-only, we checked, twice), and high-contrast focus rings. Everyone deserves to lose to a boss fairly.
- **Fully offline-capable** — everything after the first load lives in `localStorage`, and it's installable as a real PWA (add-to-home-screen, offline service worker), so it works with zero internet connection at all. Take it to the airport. Take it to the moon. It does not care.
- **Backup & restore** — a "download my arcade" export and a matching import, in case browser storage ever gets cleared by forces beyond mortal comprehension. Local-only data doesn't have to mean fragile data, it just has to mean WE learned that the hard way once.
- **A cross-game arcade rank** — a level and title that climbs from combined play across all 6 games, because grinding one game for XP is out, grinding SIX games for XP is a lifestyle.

## 🛠️ Built With (a suspicious amount of confidence)

- **React 19** + **Vite** for the app shell and UI
- **TypeScript**, strict mode, project references — every game's logic is fully typed, no `any` allowed to just wander around unsupervised
- **Tailwind CSS v4** for the retro-cabinet visual design system
- **Canvas 2D** for every game — no game engine, no physics library, hand-rolled rendering and collision for all 6 games, artisanal, small-batch, gluten-free
- **Web Audio API** — a custom synthesized sound engine, no audio middleware, no middlemen, no notes
- Royalty-free CC0 art and sound assets from [Kenney.nl](https://kenney.nl) (an actual hero) (see [`CREDITS.md`](./CREDITS.md) for the full very-detailed receipts)

Each game is split cleanly into three layers — a pure game-logic engine, a canvas renderer, and a thin React wrapper — so the "rules" of a game never touch the DOM and the drawing code never touches game state. It's the same pattern across all 6 games, which made this a genuinely good way to learn how to structure something bigger than a toy script, and also a genuinely good way to learn what "separation of concerns" means beyond a LinkedIn buzzword. 💼🔥

## 🚀 Running It Locally

```bash
git clone <this-repo>
cd tims-arcade
npm install
npm run dev
```

Then open the local URL Vite prints. That's it. No environment variables, no API keys, no database setup, no 45-minute cloud config odyssey. If it doesn't work, it's probably Node — it's always Node.

Other useful commands:

```bash
npm run build       # type-check + production build
npm run typecheck    # TypeScript project-wide check
npm run lint         # oxlint
npm run preview      # preview the production build locally
```

## 🌐 Deployment

Ships to **GitHub Pages** automatically via GitHub Actions on every push to `main` — see `.github/workflows/deploy.yml`. The build is base-path-aware, so it works whether it's hosted at the domain root or under a `/repo-name/` project-site path. It just... deploys itself. We stand back and watch. It's beautiful. 🥲

## 📄 Credits & License

The code in this repo is licensed under [GPL-3.0](./LICENSE). All third-party art, audio, and fonts are credited separately in [`CREDITS.md`](./CREDITS.md) — everything used is CC0 (public domain), courtesy of the incredible [Kenney.nl](https://kenney.nl) asset library, patron saint of side projects everywhere.

---

*A learning project, built one session at a time — new games, features, and polish keep getting added as the journey continues, and honestly at this point the arcade has more scope creep than most Fortune 500 roadmaps. We regret nothing. 🎉🕹️✨*
