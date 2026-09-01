# Credits

Tim's Arcade uses a handful of royalty-free assets pulled from Kenney asset
packs, added in two batches (2026-08-31, morning and afternoon). Everything
is by **Kenney (www.kenney.nl)** and every pack's actual art, audio, and font
assets are **CC0** (public domain — no attribution legally required, but
credited here anyway). Where a pack bundles a Godot project template, that
surrounding code is separately MIT-licensed and was not used, since this is a
React/Canvas 2D app, not a Godot project.

Homepage: https://www.kenney.nl

## Batch 1 — Starter Kit series (Godot 4.6 templates)

- Starter Kit 3D Platformer
- Starter Kit Racing
- Starter Kit Match-3
- Starter Kit FPS
- Starter Kit City Builder
- Starter Kit Basic Scene (bundles the CC0 "Mini Arena" pack, additional credit: Tony Schär)

Only 2D sprites, short sound effects, and a font were usable — everything
else in those packs is 3D models (`.glb`/`.fbx`) and Godot scenes/scripts
(`.tscn`/`.gd`), which don't apply to a 2D `<canvas>` game and were left
alone.

### Font

| File | From | License |
|---|---|---|
| `src/assets/game/fonts/LilitaOne-Regular.ttf` | Starter Kit 3D Platformer (`fonts/lilita_one_regular.ttf`) | SIL Open Font License 1.1 (full text: `src/assets/game/fonts/LilitaOne-LICENSE.txt`). Font author: Juan Montoreano. |

Used as the app's display font (`--font-display` in `src/index.css`), registered
at runtime via the `FontFace` API in `src/lib/font.ts` rather than a static CSS
`@font-face` rule — see "Where things live" below for why. Replaces the
previous Google-Fonts-hosted Baloo 2.

### Sound effects

Decoded and played by `src/lib/audio.ts` when the browser supports it, with a
synthesized fallback for every one (see `CLAUDE.md` — Safari/iOS can't decode
Ogg Vorbis via Web Audio, so those users transparently get the synth blip
instead).

| File | From (original name) | Used for |
|---|---|---|
| `sfx/coin.ogg` | 3D Platformer `sounds/coin.ogg` | Coin/dot pickups (Wiggle Worm, Munch Maze), scoring a goal (Kickoff Clash) |
| `sfx/jump.ogg` | 3D Platformer `sounds/jump.ogg` | Jumping (Rumble Ring), game-start cue (all games) |
| `sfx/blaster.ogg` | Starter Kit FPS `sounds/blaster.ogg` | Firing (Star Defender) |
| `sfx/enemy-destroy.ogg` | Starter Kit FPS `sounds/enemy_destroy.ogg` | Clearing a wave/board (Star Defender, Munch Maze) |
| `sfx/tile-match.ogg` | Starter Kit Match-3 `sounds/tile-match.ogg` | Power-ups (Munch Maze power pellet, Turbo Dash nitro) |
| `sfx/tile-swap.ogg` | Starter Kit Match-3 `sounds/tile-swap.ogg` | Menu navigation / general movement cue (`move`) |
| `sfx/placement.ogg` | Starter Kit City Builder `sounds/placement-a.ogg` | Menu confirm/select |
| `sfx/engine.ogg` | Starter Kit Racing `audio/engine.ogg` | Looping engine hum (Turbo Dash) |
| `sfx/impact.ogg` | Starter Kit Racing `audio/impact.ogg` | Taking a hit / crashing (Rumble Ring, Kickoff Clash concede, Turbo Dash crash) |
| `sfx/skid.ogg` | Starter Kit Racing `audio/skid.ogg` | Changing lanes (Turbo Dash) |

### Sprites

| File | From (original name) | Used for |
|---|---|---|
| `sprites/coin.png` | 3D Platformer `sprites/coin.png` | Food pickup (Wiggle Worm) |
| `sprites/sparkle.png` | Starter Kit Match-3 `sprites/particles/sparkle.png` | Power pellet (Munch Maze) |
| `sprites/shadow.png` | 3D Platformer `sprites/blob_shadow.png` | Drop shadow under characters/cars (Rumble Ring, Kickoff Clash, Turbo Dash) |
| `sprites/smoke.png` | Starter Kit Racing `sprites/smoke.png` | Nitro boost trail (Turbo Dash) |

Every sprite draw has a hand-drawn canvas-shape fallback if the image hasn't
loaded yet, so nothing is ever left blank.

Not used from Batch 1: the 3D models, Godot scenes (`.tscn`), GDScript
(`.gd`), city/building/track meshes, weapon/vehicle models, and the Match-3
tile/cursor/background sprites — no fit for this app's 2D canvas engine.

## Batch 2 — added 2026-08-31 (afternoon), under `public/assets/`

- **Racing Pack** (`kenney_racing-pack`) — top-down cars, motorcycles, characters, road/track tiles, roadside props
- **Space Shooter Extension** (`kenney_space-shooter-extension`) — ships, missiles, meteors, effects, astronauts, stations
- **Sports Pack** (`kenney_sports-pack`) — balls, equipment, team characters, flags
- **Abstract Platformer** (`kenney_abstract-platformer`) — enemies, players, items, tiles
- **UI Pack 2.0** (`kenney_ui-pack`) — buttons, icons, sliders, stars
- **Platformer Art Deluxe** (`kenney_platformer-art-deluxe`), **Platformer Pack Remastered** (`kenney_platformer-pack-remastered`), **RPG Urban Pack** (`kenney_rpg-urban-pack`) — scanned, but nothing usable found (platformer tilesets / top-down RPG city tiles don't fit any of the 6 existing games; kept on disk under `asset-packs/` in case a future game wants them)

Scanned by filename/category (Cars, Ships, Meteors, Missiles, Effects,
Equipment, Enemies, Items, star icon, etc.) and hand-picked for a clear game
fit. Every new sprite has a fallback to the pre-existing hand-drawn canvas
shape if it hasn't loaded yet, same as Batch 1.

### Sprites

| File | From (pack / original name) | Used for |
|---|---|---|
| `sprites/car-player.png` | Racing Pack `PNG/Cars/car_blue_1.png` | Turbo Dash — player's car |
| `sprites/car-black.png`, `car-green.png`, `car-yellow.png`, `car-red.png` | Racing Pack `PNG/Cars/car_{color}_1.png` | Turbo Dash — obstacle traffic (random per obstacle, stable for its lifetime) |
| `sprites/ship-player.png` | Space Shooter Extension `PNG/Sprites/Ships/spaceShips_001.png` | Star Defender — player ship |
| `sprites/meteor-1.png`…`meteor-4.png` | Space Shooter Extension `PNG/Sprites/Meteors/spaceMeteors_00{1-4}.png` | Star Defender — enemy formation (cycled for variety) |
| `sprites/missile-player.png` | Space Shooter Extension `PNG/Sprites/Missiles/spaceMissiles_010.png` | Star Defender — player bullets |
| `sprites/missile-enemy.png` | Space Shooter Extension `PNG/Sprites/Missiles/spaceMissiles_005.png` | Star Defender — enemy bullets |
| `sprites/explosion.png` | Space Shooter Extension `PNG/Sprites/Effects/spaceEffects_012.png` | Star Defender — brief fading flash when an enemy is destroyed |
| `sprites/soccer-ball.png` | Sports Pack `PNG/Equipment/ball_soccer1.png` | Kickoff Clash — the ball |
| `sprites/corner-flag.png` | Sports Pack `PNG/Equipment/flag_green.png` | Kickoff Clash — decorative corner flags |
| `sprites/glove-impact.png` | Sports Pack `PNG/Equipment/boxing_glove.png` | Rumble Ring — punch/kick impact flash |
| `sprites/ghost-walk.png` | Abstract Platformer `PNG/Enemies/enemyWalking_1.png` | Munch Maze — ghost #1 |
| `sprites/ghost-fly.png` | Abstract Platformer `PNG/Enemies/enemyFlying_1.png` | Munch Maze — ghost #2 |
| `sprites/ghost-float.png` | Abstract Platformer `PNG/Enemies/enemyFloating_2.png` | Munch Maze — spare ghost slot (only 2 ghosts currently spawn, kept for a future 3rd/4th ghost) |
| `sprites/ghost-spike.png` | Abstract Platformer `PNG/Enemies/enemySpikey_1.png` | Munch Maze — spare ghost slot |
| `sprites/dot-gem.png` | Abstract Platformer `PNG/Items/blueGem.png` | Munch Maze — regular dots |
| `sprites/star-badge.png` | UI Pack `PNG/Yellow/Default/star.png` | Leaderboard — "Top Player" badge icon |

Each ghost in Munch Maze gets its own distinct creature sprite (like the
original Pac-Man, where each ghost has its own silhouette/personality) rather
than one shape recolored per ghost.

## Batch 3 — added 2026-08-31 (evening), under `public/assets/`

Mostly sound-effect packs this time:

- **Voiceover Pack #1** (`kenney_voiceover-pack`) — short spoken callouts (Male voice)
- **Music Jingles** (`kenney_music-jingles`) — short musical stingers
- **Interface Sounds** (`kenney_interface-sounds`) — menu/UI clicks, switches, toggles
- **Impact Sounds**, **Digital Audio**, **RPG Audio**, **Sci-Fi Sounds**, **UI SFX Set** (`kenney_impact-sounds`, `kenney_digital-audio`, `kenney_rpg-audio`, `kenney_sci-fi-sounds`, `kenney_ui-audio`) — scanned; nothing pulled in this batch beyond what's listed below (existing sfx already cover these games well — see "not used" note)
- **Background Elements Remastered**, **Hexagon Pack**, **New Platformer Pack 1.1**, **Shape Characters**, **Simplified Platformer Pack**, **Toon Characters**, **UI Pack: Sci-fi** (`kenney_background-elements-remastered`, `kenney_hexagon-pack`, `kenney_new-platformer-pack-1.1`, `kenney_shape-characters`, `kenney_simplified-platformer-pack`, `kenney_toon-characters`, `kenney_ui-pack-space-expansion`) — sprite packs, scanned; no fit for the 6 existing games (side-scrolling platformer tiles/backgrounds, hex tiles, or full character rigs — none of the 6 games are platformers or need new profile-avatar art without a larger redesign). Kept on disk under `asset-packs/` in case a future game or avatar system wants them.
- `kenney_abstract-platformer` was included again in this drop — it's an exact duplicate of the copy already pulled in Batch 2, so it wasn't re-used; the duplicate folder was discarded rather than kept a second time.

### Sound effects

Two of these landed in the regular sample-with-synth-fallback system (`src/lib/audio.ts`, `SfxName`/`playSfx()`); three are a new, separate "announcer" layer (`AnnouncerName`/`playAnnouncer()`) that plays a short spoken line *alongside* the existing sfx/music rather than replacing it — announcer clips have no synthesized fallback (if the sample doesn't decode, that one line is just silently skipped).

| File | From (pack / original name) | Used for |
|---|---|---|
| `sfx/highscore.ogg` | Music Jingles `Audio/Steel jingles/jingles_STEEL00.ogg` | New `"highscore"` sfx — plays instead of `"gameover"` when a run beats the profile's own top score for that game |
| `sfx/back.ogg` | Interface Sounds `Audio/back_004.ogg` | New sample for the existing `"back"` sfx (previously synthesized-only) |
| `sfx/voice-ready.ogg` | Voiceover Pack #1, Male `ready.ogg` | Announcer line played when a round starts (alongside the existing `"start"` sfx) |
| `sfx/voice-gameover.ogg` | Voiceover Pack #1, Male `you_lose.ogg` | Announcer line played on a normal game over |
| `sfx/voice-highscore.ogg` | Voiceover Pack #1, Male `new_highscore.ogg` | Announcer line played when a run sets a new personal best |

Wired into `GameShell.tsx` (shared by every game, not per-game) since it's about the moment — round start / game over / new best — not about any one game's mechanics.

## Batch 4 — added 2026-09-01, artistic overhaul of Kickoff Clash / Turbo Dash

Curated from packs already downloaded for Batch 2/3 (`kenney_sports-pack`,
`kenney_racing-pack`, `kenney_background-elements-remastered`), plus more
Impact Sounds, Music Jingles, Interface Sounds, Sci-Fi Sounds, and Voiceover
Pack #1 clips for the new dedicated SFX/announcer lines. Everything below has
a hand-drawn canvas fallback if it hasn't loaded yet, same as every prior
batch.

### Sprites

| File | From (pack / original name) | Used for |
|---|---|---|
| `sprites/player-blue-a.png`, `player-blue-b.png` | Sports Pack `PNG/Blue/characterBlue (1/5).png` | Kickoff Clash — player + teammate |
| `sprites/player-red-a.png`, `player-red-b.png` | Sports Pack `PNG/Red/characterRed (2/9).png` | Kickoff Clash — the two CPU opponents |
| `sprites/keeper-green.png` | Sports Pack `PNG/Green/characterGreen (4).png` | Kickoff Clash — penalty-shootout keeper |
| `sprites/car-rival-red.png`, `car-rival-blue.png`, `car-rival-yellow.png` | Racing Pack `PNG/Cars/car_{red,blue,yellow}_2.png` | Turbo Dash — the 3 named AI rivals (Red Comet/Blue Blaze/Gold Rush). Deliberately the "\_2" body shape, distinct from the "\_1" shape used by the player car and traffic obstacles. |
| `sprites/roadside-bush-1.png`, `roadside-bush-2.png` | Background Elements Remastered `bush1.png`/`bush2.png` | Turbo Dash — roadside scenery |
| `sprites/roadside-cone.png`, `roadside-barrel.png`, `roadside-barrier.png` | Racing Pack `PNG/Objects/cone_straight.png`/`barrel_red.png`/`barrier_white_race.png` | Turbo Dash — roadside scenery |
| `sprites/cloud-1.png`, `cloud-2.png` | Background Elements Remastered `cloud1.png`/`cloud3.png` | Turbo Dash — drifting sky parallax layer |
| `sprites/start-lights.png` | Racing Pack `PNG/Objects/lights.png` | Turbo Dash — pre-race start gantry (the actual red→green countdown lights are drawn as an overlay, since this sprite has no baked light-state frames) |

Player sprites face **+X (right)** at rest — `PLAYER_SPRITE_FACING = 0` in
`src/lib/sprites.ts` documents this so a future asset swap only needs to
change one constant if the new art's rest orientation differs.

### Sound effects

| File | From (pack / original name) | Used for |
|---|---|---|
| `sfx/kick.ogg` | Impact Sounds `impactSoft_heavy_002.ogg` | Kickoff Clash — striking the ball |
| `sfx/net.ogg` | Impact Sounds `impactSoft_medium_004.ogg` | Kickoff Clash — ball hitting the net |
| `sfx/crash.ogg` | Impact Sounds `impactMetal_heavy_001.ogg` | Turbo Dash — crashing |
| `sfx/boost.ogg` | Sci-Fi Sounds `thrusterFire_002.ogg` (trimmed/faded) | Turbo Dash — nitro activation |
| `sfx/countdown.ogg` | Interface Sounds `bong_001.ogg` | Shared — pre-round "3…2…1" beat (Kickoff Clash kickoff, Turbo Dash start lights) |
| `sfx/goal-horn.ogg` | Music Jingles `Steel jingles/jingles_STEEL02.ogg` | Kickoff Clash — a goal |
| `sfx/fanfare.ogg` | Music Jingles `8-Bit jingles/jingles_NES00.ogg` | Shared — match/race win |
| `sfx/voice-1.ogg`, `voice-2.ogg`, `voice-3.ogg`, `voice-go.ogg`, `voice-set.ogg` | Voiceover Pack #1, Male `1.ogg`/`2.ogg`/`3.ogg`/`go.ogg`/`set.ogg` | Shared — countdown announcer ("three"/"two"/"one"/"set"/"go") |
| `sfx/voice-final-round.ogg` | Voiceover Pack #1, Male `final_round.ogg` | Kickoff Clash — second-half kickoff |
| `sfx/voice-hurry-up.ogg` | Voiceover Pack #1, Male `hurry_up.ogg` | Kickoff Clash — closing seconds of a half |
| `sfx/voice-you-win.ogg` | Voiceover Pack #1, Male `you_win.ogg` | Shared — match/race won |
| `sfx/voice-tie.ogg` | Voiceover Pack #1, Male `its_a_tie.ogg` | Kickoff Clash — drawn match |
| `sfx/voice-time-over.ogg` | Voiceover Pack #1, Male `time_over.ogg` | Kickoff Clash — full-time, non-win/tie case |

The referee **whistle** heard at kickoff/halftime/full-time in Kickoff Clash
is fully synthesized (`whistleSynth()` in `src/lib/audio.ts`), not a sample —
no Kenney pack ships one, and it's a sound a kid will recognize instantly, so
it seemed worth getting right rather than approximating with a
close-but-wrong sample. Likewise the synthesized stadium **crowd ambience**
(`startCrowd`/`cheer`/`setCrowdLevel`/`stopCrowd`) is filtered noise, not a
sample — a real crowd loop would have dwarfed every other audio asset in the
bundle for a worse result.

Two new gameplay/UI music moods were added to the existing synthesized
chiptune scheduler (`PATTERNS` in `src/lib/audio.ts`, no new files needed):
`"sports"` (a slower, chant-like stadium anthem) for Kickoff Clash, and
`"race"` (the fastest, most relentless of the four) for Turbo Dash — both
replace the generic `"action"` mood these two games shared with every other
game before this batch.

## Batch 5 — added 2026-09-01, artistic overhaul of Star Defender / Rumble Ring

Curated from packs already downloaded for earlier batches
(`kenney_space-shooter-extension`, `kenney_platformer-pack-remastered`,
`kenney_toon-characters`). This batch closes the last real visual gap in the
arcade — Rumble Ring previously had zero character sprites of any kind.

### Sprites

| File | From (pack / original name) | Used for |
|---|---|---|
| `sprites/boss-ship.png` | Space Shooter Extension `PNG/Sprites/Ships/spaceShips_006.png` | Star Defender — boss enemy. A different, bulkier ship design from the player's own `spaceShips_001` (`ship-player.png`, Batch 2), scaled up, so the boss doesn't share a silhouette with the player. |
| `sprites/bunker-crate.png` | Platformer Pack Remastered `PNG/Tiles/boxCrate.png` | Star Defender — bunker tile texture (tiled per surviving bunker cell, replacing a flat filled rectangle) |
| `sprites/fighter-blaze-*.png` (8 poses: idle/attack0/attackkick/hurt/jump/duck/walk0/walk1) | Toon Characters, Male Adventurer `character_maleAdventurer_*.png` | Rumble Ring — "Blaze" (the balanced fighter) |
| `sprites/fighter-turbo-*.png` (same 8 poses) | Toon Characters, Female Adventurer `character_femaleAdventurer_*.png` | Rumble Ring — "Turbo" (fast & light) |
| `sprites/fighter-titan-*.png` (same 8 poses) | Toon Characters, Robot `character_robot_*.png` | Rumble Ring — "Titan" (slow & heavy) — the blocky mechanical design was picked deliberately to match Titan's "hits like a truck" stats |

No sprite exists in any available pack for a classic flying-saucer UFO —
Star Defender's UFO is fully hand-drawn/procedural instead (gradient-shaded
saucer body, dome, pulsing rim lights, a gentle bob), the same approach used
for the crowd-ambience audio in Batch 4: sometimes a deliberate procedural
effect beats forcing in a mismatched asset.

Every fighter pose set is only drawn once *all 8 frames* have loaded
(`fighterPoseSetReady()` in `src/lib/sprites.ts`) — falling back to the
original flat-rectangle look otherwise — so a slow connection can never show
a character mid-match with some frames as real art and others as placeholder
shapes.

### Music

Two more dedicated moods were added to `PATTERNS` in `src/lib/audio.ts`,
same mechanism as Batch 4's `"sports"`/`"race"`: `"space"` (sparse,
rest-heavy) for Star Defender and `"fight"` (tense, percussive, minor-key)
for Rumble Ring — both replace the generic `"action"` mood these two games
previously shared with every other unassigned game.

## Batch 6 — added 2026-09-01, artistic overhaul of Wiggle Worm / Munch Maze

The smallest batch — only one new sprite. This closes out the "every game
has had an artistic pass" milestone: all 6 games now have their own
dedicated music mood and at least some real sprite work, having started
from a state where only 3 of the 6 did.

### Sprites

| File | From (pack / original name) | Used for |
|---|---|---|
| `sprites/pacman-player-body.png` | Shape Characters `yellow_body_circle.png` | Munch Maze — the player's body (a shaded circle with a gradient/highlight baked into the art). The animated chomping mouth is still cut into it at draw time via canvas compositing (`destination-out`), so the classic open/close animation is preserved on top of a less-flat-looking body. |

No sprite in any available pack fits Wiggle Worm's segments — the only
"snake" art that exists anywhere in these packs is a side-scrolling
platformer enemy illustration, the wrong shape entirely for a per-cell grid
body. That game's overhaul is procedural instead: gradient shading and a
scale-like texture pattern per segment, a redesigned head, and a subtle
per-segment wiggle so the body reads as slithering rather than a rigid rail
of rectangles.

### Music

One new mood, `"maze"` (bouncy, staccato, bpm 150) — added to `PATTERNS` in
`src/lib/audio.ts` and shared by BOTH games (`snake: "maze"`,
`pacman: "maze"` in `GameShell.tsx`'s `MUSIC_MOOD_BY_GAME`), rather than
giving each its own mood, since both are light-hearted maze/grid games with
a similar energy — unlike every other pairing in the app, which each got a
mood of their own.

## App icons & favicon — original 2026-09-01, redesigned 2026-09-01

`public/favicon.svg`, `public/icon-192.png`, `public/icon-512.png`, and `public/icon-512-maskable.png` all now draw the same original mascot mark (see `src/components/MascotAvatar.tsx` for the fuller, tiered version used in-app) — a simple flat-geometric teal "spark buddy" face with a coral cap, on a `--color-night` (`#1a1140`) background. Not from any third-party pack; hand-authored inline SVG/canvas paths, same as `MascotAvatar.tsx` and `src/lib/gameIcons.tsx`. Replaces an earlier icon set derived from the app's old lightning-bolt favicon mark (itself a `cairosvg`-limitation fallback — the original bolt art used SVG `<mask>`/blur-filter elements `cairosvg` can't rasterize, so only a flat, characterless silhouette ever made it into the PWA icons; the new mascot-based art was designed for these sizes from the start, not stripped down from something bigger). The maskable variant has extra safe-area padding since Android crops maskable icons to a circle/squircle. No new licensing to track here — original art, same as the icons it replaces.

## Where things live

- `asset-packs/` — the original, unmodified Kenney downloads for all three batches (source of truth for the above; gitignored, ~170MB combined, not shipped)
- `src/assets/game/` — the small curated subset above (fonts/sfx/sprites), actually shipped with the app. Every file here is imported as a real Vite module (`import url from "./file.ext"`), never referenced by a hardcoded path string — that's what makes the built URLs correctly pick up the `/tims-arcade/` prefix when the site is deployed to a GitHub Pages project subpath instead of a domain root.

Batches 2 and 3 both arrived under `public/assets/` (same mistake as Batch 1 originally did) and were moved into `asset-packs/` before building, for the same reason: anything inside Vite's `public/` directory is copied byte-for-byte into every production build, and these are raw Kenney downloads with nested `.git` folders that were never meant to ship. If more packs get dropped in later, expect to repeat this move — check `public/assets/` (or wherever they land) before building, and relocate anything that isn't already a small curated file living in `src/assets/game/`.
