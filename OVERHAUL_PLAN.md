# Tim's Arcade — Complete Overhaul Plan

**Status: the full 5-step sequencing this document laid out has now shipped.** This was written as a planning-only document before any of it was built; it's kept as-is (mostly) for the historical record of the brainstorm, with the items that have since landed marked "✅ SHIPPED" inline rather than rewritten away. Anything not marked shipped is still just an idea, not committed to. It covers the app shell and all 6 games, split into gameplay/mechanics ideas and artistic-overhaul ideas, with a rough sense of how big each change is and what it would touch.

Legend for size: **S** = small, self-contained, a session or less. **M** = medium, touches a few files or one meaningful new system. **L** = large, a new subsystem or a real arc of its own.

---

## 1. The App Shell

Everything outside the 6 games: profiles, menu, leaderboards, achievements, settings, navigation.

### What's already strong (don't disturb)

The four-tier scoring model (my-last / my-best / overall-best / overall-score), the unified input system across keyboard/gamepad/touch, the clean engine/UI split, the accessibility trio (reduced motion, independent audio mute/volume, color-independent indicators), and the fact that achievements are *derived* from stats rather than stored as flags (so they can't drift out of sync). The idle "attract mode" ticker on the menu is a nice touch worth keeping.

### Additive features

- **Data export/import (backup & restore) — S/M. ✅ SHIPPED** (`src/lib/storage.ts`'s `exportStateJson`/`importStateJson`, wired into Settings).
- **PWA / installability — S. ✅ SHIPPED** (`vite-plugin-pwa`, see `vite.config.ts`).
- **First-run onboarding — M. ✅ SHIPPED** (`src/components/Welcome.tsx`, gated on `profiles.length === 0` — see `App.tsx`).
- **Daily challenge / featured game — S.** A deterministic "pick of the day" highlighted on the menu — no new storage needed, pure presentation logic.
- **Session stats (time played) — S.** Track playtime per session and roll it into profile stats.
- **Per-profile difficulty memory — S/M.** Remember the last difficulty picked per profile per game, so kids don't have to re-pick every time.
- **Keyboard-shortcuts overlay — S.** A "?" panel listing the controls, since the vocabulary is already centralized.
- **Screenshot / share-a-score — S.** Compose the canvas + score text into a downloadable image on game over.
- **Parent/guardian summary view — S/M.** A read-only screen aggregating stats across all profiles (time played, favorite game) — mostly built from data that already exists.
- **Cross-game mascot / meta-progression — L. ✅ SHIPPED** (scoped down to a level/title/XP-bar readout — see `getMascotProgress` in `src/lib/storage.ts` — rather than a full avatar system, deliberately kept bounded).

### Modifications to existing systems

- **Leaderboard trend/history** — surface *when* a streak broke, not just the best score; the underlying history data already exists.
- **Achievements categorization** — split the flat grid into per-game vs. cross-game sections.
- **Profile color choice** — let a kid pick their own accent color instead of auto-assignment.
- **Settings panel restructure** — split into tabs (Sound / Comfort / Data) now, before it gets crowded with more accessibility options.

### Removals/simplifications

Nothing reads as overbuilt — the scope is already lean for a kid-facing app. The previously-flagged "achievement already-seen resets on reload" concern turned out not to be a real bug on inspection (`AchievementToasts.tsx` already baselines its seen-set on mount without celebrating, so a reload just re-baselines silently) — no fix was needed, this note is now stale and kept only for the record.

### Architecture notes for whoever implements any of this

- `localStorage` writes fail silently on quota/private-mode. **✅ SHIPPED**: a visible signal now exists — `saveState()` in `storage.ts` calls an optional failure listener, `ArcadeContext` registers one and exposes `storageError`/`dismissStorageError`, and `src/components/StorageErrorBanner.tsx` renders a dismissible top banner app-wide when it fires.
- The existing migration pattern (shallow-merge parsed state over defaults) should be followed for any new top-level state field.
- New derived stats should follow the existing "derive in storage.ts, memoize in context" shape rather than storing computed values.
- Per-profile difficulty presets would need to flow in as a new prop on `GameComponentProps`, not have games reach into the arcade context directly — that would break the "engine files never import React" rule.

---

## 2. Per-Game Plans

### 2.1 Wiggle Worm (Snake)

**Status: this section is now stale relative to the code — an earlier "Step 2" gameplay pass already shipped almost everything below, but the bullets were never updated to say so.** Confirmed by re-reading `src/games/snake/engine.ts`: speed ramps with score, three food types (normal/golden/shrink), wave-based obstacle layouts, and a real wave counter are all already implemented. Only one item from the original list is still genuinely open.

**Gameplay & mechanics**
- Speed ramps with score — **✅ SHIPPED** (`TICK_MS_BASE`/`TICK_MS_MIN`/`SPEED_RAMP_SCORE_STEP` in `engine.ts`).
- Multiple food types (normal, golden, shrink) — **✅ SHIPPED** (`FoodKind` in `engine.ts`).
- Obstacles / hand-authored maze layouts selected by wave — **✅ SHIPPED** (`wallsForWave` in `engine.ts`).
- A real wave/level counter tied to foods eaten, driving both layout and pacing — **✅ SHIPPED** (`FOOD_PER_WAVE` in `engine.ts`).
- Portals (a linked pair of teleporting cells) — still open, minor — **S**.
- A rival AI snake (starting as a simple random-walker) — still open, the one genuinely meaningful gap left in this game — **M/L**.
- Pointer/touch control currently reads a single tap-vector rather than a drag — worth smoothing — **S**.

**Artistic overhaul**
- A real snake body/segment sprite instead of flat rounded rects (no snake sprite exists at all today).
- Locomotion wiggle, a squash/stretch on eating, and a death particle burst using the existing particle toolkit (`sparks`/`debris` presets are ready-made and currently unused here).
- A faint motion trail behind the head (the `trail()` particle preset already exists for exactly this).
- Dedicated sound effects instead of borrowed generic ones (eating and dying currently reuse the same blips every other game uses).
- Its own music mood — currently falls through to the shared generic "action" loop, same as Munch Maze.
- HUD text routed through the shared outlined-text/banner helpers instead of raw canvas font calls, plus a banner moment on eating or game over.

### 2.2 Munch Maze (Pac-Man)

**Status: this section is also stale relative to the code — the same "Step 2" pass covered this game too.** Confirmed by re-reading `src/games/pacman/engine.ts`: ghost personalities, alternate maze layouts, a fruit bonus, a speed-boost power-up, and real wave-tied difficulty escalation are all already implemented. Only the boss-ghost idea is still genuinely open.

**Gameplay & mechanics**
- Ghost personalities (chaser, late-activator, wanderer, ambusher, gradually added as waves climb) — **✅ SHIPPED** (`ghostCountForWave` and per-slot behavior in `engine.ts`).
- 2–3 alternate maze layouts selected by wave — **✅ SHIPPED** (`buildMaze` alternation in `engine.ts`).
- A fruit bonus item — **✅ SHIPPED** (`FRUIT_MS`/`FRUIT_SCORE` in `engine.ts`).
- A power-up beyond the base ghost-eating pellet (a speed boost) — **✅ SHIPPED** (`SPEED_TICK_DIVISOR`/`SPEED_BOOST_MS`/`SPEED_PELLET_SCORE` in `engine.ts`; a second "freeze" variant remains a possible future addition, not required).
- Real difficulty escalation tied to wave number (faster ghosts, shorter power duration) — **✅ SHIPPED** (`scaredMsForWave`/`ghostTickMsForWave` in `engine.ts`).
- A boss-style "king ghost" every 5th wave that can't be eaten and must be avoided — still open, the one genuinely meaningful gap left in this game — **M**.
- Controls are already in good shape (correct one-cell-ahead turn buffering) — no changes needed there.

**Artistic overhaul**
- A real player sprite with directional facing (currently a hand-drawn mouth-wedge arc).
- Idle animation for ghosts (float/bob) — right now they're static despite one being named "ghostFloat."
- A particle burst + screen shake when a ghost is eaten or the player is caught, instead of a silent teleport-back.
- Dedicated sound effects and its own music mood (shares the generic fallback with Snake today).
- HUD replaced with the shared outlined-text helpers (currently raw font + a repeated heart emoji for lives), plus a "WAVE CLEAR!" banner moment.

### 2.3 Star Defender

**Status:** already deep-overhauled gameplay-wise (bunkers, 3 enemy types, boss waves, 4 power-ups, bonus UFO, difficulty tiers) and got a partial sprite pass. Genuinely solid already — these are "next level," not "missing basics."

**Gameplay & mechanics**
- Boss fights are one pattern repeated at every boss wave, just scaled by difficulty — a second boss phase under 50% HP (faster sweep, homing burst) would make later bosses feel distinct — **M**.
- Enemy formations are always the same grid shape — alternate formations would raise variety cheaply — **S/M**.
- Diving enemies pick a target once and never re-aim — letting them adjust mid-dive raises the skill ceiling — **S**.
- No combo/streak scoring multiplier despite kill events already firing individually — **S**.
- An endless/survival mode is nearly free since wave difficulty already scales with no hard cap — mostly a matter of surfacing it as a real mode with its own leaderboard column — **S/M**.

**Artistic overhaul**
- The boss and UFO are the two most visible set-pieces in the game and are still flat canvas shapes (a rect + emoji, and two ellipses) — the last real visual gap since everything else already has sprites.
- Bunkers are flat filled rectangles with no texture at all — a simple tile sprite per surviving cell would read far better.
- No starfield/parallax background at all — currently a flat solid-color fill.
- Zero use of the particle toolkit — no debris/sparks on kills, no screen shake on boss hits or player death, despite the toolkit already existing and being wired into other games.
- HUD is raw canvas text, and there's no banner moment for wave-clear or boss-defeat.
- No dedicated music mood (shares the generic fallback) and no distinct boss-hit/UFO-specific sound effects.

### 2.4 Rumble Ring

**Status:** already deep-overhauled gameplay-wise (3 characters, super meter, throws, best-of-3, difficulty-tiered AI). Legitimately deep as a small fighting game already. This is the least visually developed game in the arcade, though — the clearest artistic-overhaul candidate.

**Gameplay & mechanics**
- No combo system at all — every attack resolves in isolation with no chain/cancel window. Even a minimal 2-hit chain would add real depth and is the single biggest "next level" item — **M/L. ✅ SHIPPED** (a player-only 2-hit buffered chain, capped, 75% damage on the 2nd hit — see `src/games/fighter/engine.ts`).
- The stage is completely static — no hazards, no variety round to round — **M**.
- CPU only has one behavioral profile per difficulty tier (numeric scaling only) — pairing a "personality" (zoner vs. rusher) with each character would add variety cheaply — **M**.
- Movement is shallow — no dash, no crouch beyond full block, no attack option while jumping — **M**.
- No character-select "vs" screen beat before round 1 — **S**.

**Artistic overhaul**
- Fighters are still flat colored rounded-rectangles — the only fighting-specific art asset that exists is a punch-impact sprite. This is the single biggest visual gap in the whole arcade; every other game has real character/vehicle art except this one. Even simple silhouette sprites per character would be a large leap.
- No arena/crowd theming at all — a flat two-color gradient background with a single horizon line, no ring ropes, no crowd.
- Zero use of the particle toolkit (no hit sparks, no screen shake on knockout) despite it being fully built and unused here.
- The round-result banner is hand-rolled instead of using the shared slam-in banner helper — an easy swap for free polish.
- No dedicated music mood, and several sound effects do double duty in ways that undersell the game (the same sound plays for both "punch thrown" and "hit blocked"). There's also a synthesized crowd-ambience system already built (for soccer) that's a very natural fit here and currently unused.

### 2.5 Kickoff Clash

**Status:** deep-overhauled gameplay-wise (2v2, charge shots, stamina, halves, penalty shootout). **The most "shovel-ready" game in the arcade for an artistic pass** — new player sprites, particle toolkit, text helpers, and a full audio expansion (crowd ambience, kick/whistle/goal-horn sounds, a dedicated "sports" music mood) were already built and curated in a prior session, but none of it is wired into the game yet. Everyone on the pitch is still a flat colored circle, and the sound effects are still placeholders (a shot fires the menu's UI blip sound; there's no whistle or goal horn anywhere).

**Gameplay & mechanics**
- No set pieces at all — no throw-ins, corners, or free kicks; the ball currently just bounces infinitely off the boundary — **M**.
- Only one fixed formation every kickoff — a couple of alternate presets (attacking vs. defensive) would add variety cheaply — **S/M**.
- The AI teammate's behavior never adapts to the score or clock — biasing it late in a losing game would be a cheap improvement — **S**.
- No weather/pitch variation (e.g. a "rain" mode with more slippery physics) — **S/M**.
- No tournament/season structure — currently always a single one-off match — **M**.

**Artistic overhaul (this one is mostly a wire-in job, not new invention)**
- Swap every player's flat circle for the already-imported player sprites, rotated to face their direction of travel.
- Use the already-built particle toolkit for dribble dust, a goal confetti burst, and screen shake on either team scoring.
- Route all HUD/banner text through the shared text helpers already built, including a real "GOAL!"/"HALFTIME!"/"FULL TIME" banner treatment.
- Add real pitch detail (penalty boxes, center spot, mown-stripe shading, a simple crowd band along the touchlines) instead of a flat green fill.
- Fix the sound wiring: shots should play the dedicated kick sound (not the menu blip), goals should trigger the goal horn and crowd cheer, kickoff/halftime/full-time should blow the whistle, and the game should switch to its own dedicated music mood instead of the generic shared one.
- Add a proper 3-2-1-GO kickoff countdown with the announcer voice lines that already exist for it, and start/stop the synthesized crowd ambience around the match.

### 2.6 Turbo Dash

**Status:** deep-overhauled gameplay-wise (laps, nitro, crash-penalty system, 3 named rivals). Same situation as Kickoff Clash — new rival-car sprites, roadside scenery sprites, cloud sprites, a start-light gantry sprite, and dedicated crash/boost sound effects plus a "race" music mood were already curated and built, but the render code still draws every rival car as a flat colored box and there's no roadside scenery, sky, or start-light sequence on screen at all.

**Gameplay & mechanics**
- The track is an endless straight 3-lane road with no curvature at all — the single biggest gameplay gap. A render-time-only curve effect (without touching the actual collision math) is realistic scope — **M. ✅ SHIPPED** (a render-only sinusoidal S-curve, see `curveOffsetAtY` in `src/games/racing/render.ts` — collision/lane math in `engine.ts` untouched, as scoped).
- No drift mechanic — lane changes are instant snaps — **S/M**.
- No car customization — only one player skin exists despite other car sprites already being in the asset library — **S/M**.
- Only one race mode (lap circuit) — a time-trial or elimination mode would reuse most of the existing systems — **M**.
- The three named rivals only differ cosmetically, not behaviorally — giving each a fixed personality trait would make the roster feel distinct — **S**.

**Artistic overhaul (also mostly a wire-in job)**
- Swap the flat rectangle rival cars for the already-imported rival car sprites (already ordered to match the roster).
- Add scrolling roadside scenery and a parallax cloud layer — both sprite sets already exist and are currently unused.
- Wire in the already-imported start-light gantry sprite for a real "lights out" countdown sequence, paired with the announcer voice lines that already exist for it.
- Replace the smoke puff with a continuous nitro flame trail using the particle toolkit, and add crash sparks/debris/screen shake.
- Route HUD text through the shared text helpers, and give the lap banner the shared slam-in treatment.
- Fix sound wiring: nitro should play its dedicated boost sound (not the generic powerup blip), crashes should play the dedicated crash sound (not the generic hit blip), and the race should already be using its own dedicated music mood rather than a generic one.

---

## 3. Suggested Sequencing

Roughly in order of effort-to-payoff, if useful as a starting point for deciding what to do next:

1. **Kickoff Clash + Turbo Dash artistic wire-in** — the highest payoff-per-effort item in the whole plan, since all the art/audio/particle assets already exist and just need to be connected. This was in progress before and is the most "ready to go" work available. **✅ SHIPPED.**
2. **Snake + Munch Maze gameplay deep-overhaul** — these are the two games still behind the other four in depth; bringing them up to par (wave escalation, ghost personalities, food variety) would even out the arcade. **✅ SHIPPED** (see corrected 2.1/2.2 above — only a rival AI snake and a king-ghost boss remain open).
3. **Star Defender + Rumble Ring artistic pass** — both are gameplay-complete but visually behind; Rumble Ring in particular has zero character art, which is the single most visible gap left in the arcade. **✅ SHIPPED.**
4. **App shell additions** — data export/import and PWA installability are both cheap, high-value, and independent of anything game-specific, so they can slot in whenever there's a break between game-focused sessions. **✅ SHIPPED.**
5. **Larger systems** (combo system for Rumble Ring, cross-game mascot/meta-progression, track curvature for Turbo Dash) — save these for when there's appetite for a bigger standalone arc, since each is a real subsystem rather than an incremental add. **✅ SHIPPED.**

Nothing here needs to happen in this order — it's just one reasonable path through the list.
