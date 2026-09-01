# Tim's Arcade — Product & Design Review

**Status: implemented 2026-09-01**, except the four items explicitly scoped out (local tournament mode, a parent/guardian summary view, a full alternate light theme, an in-app "What's New" screen) — those remain open ideas, not done. Everything else below shipped in one pass; see `PRODUCT_DESIGN_REVIEW` in memory for the session notes on what was actually built vs. what this doc originally proposed.

A planning-only document, same spirit as `OVERHAUL_PLAN.md` (which was gameplay/mechanics/artistic-per-game). This one steps back from individual games and looks at the *product* — the app as a whole, its audience, its shape — from two angles: a product manager's and a design/artistic lead's. Nothing here is committed to; it's a menu of options, not a sprint plan.

---

## 0. The framing question a PM has to answer first

This app has two audiences that pull in different directions, and almost every recommendation below depends on which one you're optimizing for:

1. **An actual kid at home** (the literal "Tim" in "Tim's Arcade"), playing on a tablet or laptop, who wants fun, fast, forgiving games and does not care about code quality, architecture, or GitHub stars.
2. **Anyone who finds the repo** — other learners, potential employers, future-you — who cares about the *build story*, the engineering choices, and whether this reads as a serious, well-crafted piece of work.

Right now the project is unconsciously optimized mostly for audience 2 (the README says as much: "the paper trail"). That's a legitimate choice, not a mistake — but it should be a *conscious* one, because it changes what's worth building next. Analytics/onboarding/retention-loop polish matters a lot for audience-1 thinking and barely at all for audience-2. A public "devlog"/changelog screen and a slicker first-impression matter a lot for audience-2 and basically nothing for audience-1. Worth deciding this explicitly rather than let it stay implicit.

---

## 1. Product Manager Lens

### 1.1 The biggest structural tension: four progression systems, one attention span

The app has grown, feature by feature, into a genuinely rich meta-game: **My Best / My Last / Arcade Best** per game, an **Overall Score** across all six, a fixed **Achievements** catalog, and now a **Mascot Rank** (level + title + XP bar). Each one was a good idea in isolation and each shipped cleanly. Stacked together, a new player looking at the menu screen sees a play-count, a streak, a badge count, *and* a level/XP bar, before they've even picked a game. For an adult power-user that's satisfying depth. For the actual target player (a kid), that's four different numbers competing for "the one that matters," and it's not obvious which one a first-time player should even look at.

This is worth a deliberate product decision, not just more feature-adding: pick **one** primary progression surface to be the "front door" (my instinct: the Mascot Rank, since it's the only one that rewards *breadth* across the whole arcade rather than skill at one game, and it's the newest/most narratively interesting — "you're becoming an Arcade Legend" is a better hook for a kid than "your Overall Score is 4,210"). Demote the others to a secondary "stats" screen a curious kid or a checking-in parent can dig into, rather than presenting all four with equal visual weight on the main menu.

### 1.2 There is no first-time-user experience at all

Confirmed by re-reading `ProfilePicker.tsx` and grepping the whole `src/` tree for "onboarding"/"tutorial"/"first-run": there is none. A brand-new visitor's very first screen is "Who's Playing?" — a full profile-creation flow — with zero explanation of what the app even is, what the six games are, or that there's a leaderboard/achievements/mascot system waiting for them. Each individual *game* has a nice per-game instructions overlay (`GameShell`'s "ready" phase), but the *app* itself has no equivalent. For a kids' product this is a real gap — the intended player may not be able to read well yet, let alone parse "Who's Playing?" as a returning-user profile switcher versus "Munch Maze" as a proper noun for a game. A minimal fix (a one-time "here's the arcade!" card before the first profile is even created, gated on `profiles.length === 0`) was actually already on the original `OVERHAUL_PLAN.md` brainstorm list and never got built — it's arguably higher-leverage than anything shipped since, precisely because it's the very first thing anyone ever sees.

### 1.3 Empty states are an afterthought, not a designed moment

A brand-new profile's Leaderboard is six cards full of "—", the Achievements screen is seven grayed-out locks, and the Mascot Rank starts at "LV.1 · NEW ARCADER" with an empty bar. None of that is *wrong*, but none of it was designed as a first impression either — it's just what the "real" (populated) UI looks like with the numbers zeroed out. A product person would flag empty states as a first-class design surface, not a fallback: "You haven't played yet — pick a cabinet!" reads very differently from a wall of dashes, and it's the exact screen every single new profile sees first.

### 1.4 No resume/continue shortcut

Every session starts at the menu grid; there's no "you were playing Turbo Dash last time — jump back in?" shortcut. Cheap to add (it's just `lastPlayedGame` in `ProfileStats`, a field this app already has the machinery for), and it directly shortens the path back into play for a returning kid who doesn't want to re-scan six cabinets every time.

### 1.5 The cross-device / data-loss story is a real, unaddressed limitation

`localStorage`-only means: switch browsers, switch devices, or clear site data, and everything is gone — mitigated, but not solved, by the backup/restore feature shipped last session (which still requires a parent to *remember* to do it, unprompted). A PM lens says: this is the single biggest fragility in the product's promise ("your scores are safe"), and the current fix is opt-in and invisible unless you already know to look in Settings. Worth considering a gentle, timed nudge (e.g., "It's been 2 weeks since your last backup — want to grab one?") rather than leaving it purely passive — though this has to be weighed against the app's genuinely nice "no nagging, no dark patterns" character; any nudge here should be exactly one line, dismissible forever, and never a modal.

### 1.6 Feature ideas worth adding (product angle, not art angle)

- **Local multiplayer / pass-and-play tournament mode** — the profile system already models up to 6 players; a lightweight "tournament bracket" mode across 2+ profiles in Rumble Ring especially (it's already 1v1) would turn a solo app into a birthday-party app with no new game logic, just a bracket wrapper around existing matches.
- **A visible "What's New"** — even a tiny one, listing the last few shipped features (mascot rank, backups, PWA install) — turns a static, no-backend app into something that *feels* alive across sessions, without needing an actual backend.
- **Screenshot/share-a-score export** — was on the original brainstorm list, never built; composing the canvas + score into a downloadable image is nearly free given everything already renders to a `<canvas>`, and it's the one feature that turns a private high score into something a kid can show a friend or a parent can post.
- **A parent/guardian summary view** — also on the original brainstorm list, never built; a read-only aggregate ("total time across all profiles this week," "everyone's favorite game") that's mostly assembled from stats this app already tracks. Positions the app as trustworthy to the actual gatekeeper (the parent), not just fun for the kid.

### 1.7 What to reconsider cutting or simplifying

- **`MAX_PROFILES = 6`** is an arbitrary round number, not derived from any real constraint (rendering a 7th `CabinetCard` or leaderboard row costs nothing). Worth deciding if this is genuinely "family-sized" or just a number that felt right — a classroom or bigger-family use case would want more, and there's no technical reason to cap it this low.
- **Settings screen is where power-user features go to hide.** Backup/restore, reduced motion, and audio mixing are all one flat list in `SettingsPanel`. As the app has grown, this screen has grown with it (it already needed `max-h-[90vh] overflow-y-auto` to fit) — worth a pass on whether it needs actual sections/grouping now rather than one long scroll.

---

## 2. Design / Artistic Lead Lens

### 2.1 The mascot has no face

This is the single most glaring miss from a design standpoint, and it's ironic given the feature is *named* "mascot": `getMascotProgress` produces a level, a title, and an XP bar — pure text and a progress bar, no character, no sprite, no visual identity at all. A "mascot" system with zero mascot artwork is a naming mismatch as much as a missed opportunity. This is the highest-leverage single design addition available right now: even a simple evolving icon or small sprite (starts as a plain spark/bolt at level 1, gains a hat/color/accessory at each title tier) would give the whole system the identity its name promises, and it's a natural excuse to finally give "Tim's Arcade" itself a recurring visual character, which it currently doesn't have anywhere.

### 2.2 There's no actual logo — the app icon is a fallback born from a tooling limitation

The PWA icons (`icon-192.png`/`icon-512.png`/`icon-512-maskable.png`) were generated by extracting just the flat-fill bolt path from `favicon.svg`, specifically because `cairosvg` couldn't render the original's `<mask>`/blur-filtered layered art. That was the right pragmatic call at the time, but the *result* — a single flat-color bolt on a solid square — is now the app's most-seen brand mark (home-screen icon, browser tab, PWA splash) and it was never actually designed to be that; it's a technical workaround that became permanent. Worth a real pass at an icon that's designed to work at 192×512px specifically (not derived from a bigger illustration that has to be stripped down), ideally tying into whatever the mascot ends up looking like (2.1) so the two aren't a coincidence.

### 2.3 Heavy reliance on emoji as the primary icon language

Emoji show up constantly and do a lot of real interface work: game icons in `GAME_META`, achievement badges, the leaderboard's medal row, the mascot's star, avatar selection, nearly every button label ("🏆 Leaderboard," "🎖️ Achievements," "🔁 Switch Player"). This is charming and it's genuinely functional (emoji render everywhere, no asset pipeline needed, and they're already colorblind-safe symbols rather than color-only cues, which matters for this app's accessibility stance) — but it also means the interface's iconography is entirely borrowed from the OS's emoji font rather than designed, which sits oddly next to the fact that every *game* now has real custom sprite art, particle effects, and a bespoke pixel/display type system. The inconsistency is: in-game, everything is custom-illustrated; in the shell (menu/leaderboard/achievements/settings), everything is emoji-and-Tailwind. A design pass could pick a few specific, high-visibility spots (the six game icons on the menu grid, specifically) and replace emoji with small custom icon sprites matching each game's actual palette, while keeping emoji everywhere it's working fine (avatars, casual accents) — a full emoji-purge would be over-scoped and would strip out some of the app's genuine charm.

### 2.4 Six games, six art passes, no retrospective consistency check

Every game's artistic overhaul was done well but *separately* — across different sessions, sometimes by different parallel sub-agents — each choosing its own particle intensity, its own banner timing/typography, its own crowd/ambience treatment. Nothing is inconsistent enough to look broken, but nothing has ever been checked side-by-side either. Concretely worth auditing in one pass, now that all six have real art: do "your personal best" / "wave clear" / "goal!" / "K.O." moments all use `drawBanner()` with the same timing curve and roughly matched visual weight, or does one game's celebration feel like a bigger deal than another's purely by accident of which session built it? Same question for particle density (Rumble Ring's hit-spark burst vs. Star Defender's explosion vs. Kickoff Clash's goal confetti) — do they feel like siblings, or like six different artists who never spoke to each other?

### 2.5 Typography has three families and no written hierarchy rule

`Lilita One` (display/headers), `Nunito` (body), and `Press Start 2P` (the tiny pixel-font stat labels, "9px" scattered through the code as `font-pixel text-[9px]`) all coexist, and they clearly *read* correctly today — but the rule for "which typeface for which kind of text" lives only in scattered class names across a dozen files, not written down anywhere (not even in `CLAUDE.md`'s otherwise-thorough architecture notes). Worth documenting explicitly (even a three-line rule: display = screen titles and big numbers, pixel = compact stat labels/HUD chrome, body = everything else) so it stays a deliberate system rather than something a future session could accidentally drift away from just by not knowing the convention existed.

### 2.6 No loading/splash treatment

Between the blank white flash of an unstyled `<div id="root">` and the app's actual first paint, there's a moment governed by web-font loading (`loadDisplayFont()` in `App.tsx`, called once on mount) with no branded loading state in between — just whatever the browser shows by default. For a PWA that's meant to feel like an installed app (not a webpage), a designed splash moment (even just the app's own background color + a simple mark, shown until fonts/critical assets are ready) would meaningfully raise the "this is a real app" feeling on cold loads, especially the very first one.

### 2.7 Single theme, no alternate palette

Every screen and every game uses one dark "night" palette (`--color-night: #1a1140` and friends). That's a legitimate, consistent aesthetic choice — but for a kids' app specifically, a lot of comparable products offer a lighter/brighter alternate theme, both for accessibility (some kids and some rooms genuinely read better against a light background) and just for the fun of letting a kid "choose their arcade's look" the way they'd choose an avatar. Not a must-have, but worth naming as an option alongside the existing (very good) reduced-motion/high-contrast accessibility work, which currently only adjusts *motion*, never *palette*.

### 2.8 Cabinet cards are UI cards, not "cabinets"

The menu's `CabinetCard` grid is clean and functional but visually reads as a standard rounded-card grid — the "arcade cabinet" fantasy the whole app is named after is mostly carried by copy and emoji rather than by the actual card shape/frame. A per-game "marquee" treatment (a top strip echoing that game's palette/sprite, like a real cabinet's header art) would sell the arcade-hall fantasy harder than a uniform card template currently does, and it's a natural place to finally put some of each game's actual character/vehicle art front-and-center on the menu, not just inside the game itself.

---

## 3. If you only picked three things

Given everything above, ranked by (impact) × (how cheap it'd be given what already exists):

1. **Give the mascot a face** (2.1) — the feature's name is a promise the current implementation doesn't keep, and it's the newest system, so it's the freshest opportunity.
2. **Build the missing first-run moment** (1.2) — a single one-time card gating on `profiles.length === 0`, cheap, and it's the very first thing every new player ever sees.
3. **Pick one "front door" progression stat** (1.1) — not a rebuild, just a hierarchy decision about what the menu screen leads with, demoting the other three to a secondary stats view.

Everything else here is a genuine option, not a recommendation to do all of it — same spirit as `OVERHAUL_PLAN.md`: a menu, not a mandate.
