import { Component, useEffect, useState, type ReactNode } from "react";
import { ArcadeProvider, useArcade } from "./context/ArcadeContext";
import { attachGlobalInput } from "./lib/input";
import { setReducedMotion } from "./lib/motion";
import { loadDisplayFont } from "./lib/font";
import Starfield from "./components/Starfield";
import ProfilePicker from "./components/ProfilePicker";
import GameMenu from "./components/GameMenu";
import Leaderboard from "./components/Leaderboard";
import AchievementsScreen from "./components/AchievementsScreen";
import AchievementToasts from "./components/AchievementToasts";
import StorageErrorBanner from "./components/StorageErrorBanner";
import Welcome from "./components/Welcome";
import GameShell from "./games/GameShell";
import SnakeGame from "./games/snake/SnakeGame";
import MunchMaze from "./games/pacman/MunchMaze";
import StarDefender from "./games/invaders/StarDefender";
import RumbleRing from "./games/fighter/RumbleRing";
import KickoffClash from "./games/soccer/KickoffClash";
import TurboDash from "./games/racing/TurboDash";
import type { GameId } from "./lib/storage";
import type { GameComponentProps } from "./games/engineTypes";
import type { ComponentType } from "react";

interface TouchOptions {
  showDpad?: boolean;
  showPrimary?: boolean;
  showSecondary?: boolean;
}

interface GameMetaEntry {
  title: string;
  subtitle: string;
  instructions: string;
  Component: ComponentType<GameComponentProps>;
  touchOptions: TouchOptions;
}

// Every id in storage.ts's GAMES list must have an entry here — that's
// what makes a cabinet launchable instead of falling through to a
// "coming soon" state. All 6 games are built, so all 6 are registered.
const GAME_META: Record<GameId, GameMetaEntry> = {
  snake: {
    title: "Wiggle Worm",
    subtitle: "Munch the coins!",
    instructions: "Use arrows, WASD, a controller d-pad, on-screen buttons, or click a direction to steer. Don't hit the walls or yourself!",
    Component: SnakeGame,
    touchOptions: { showDpad: true, showPrimary: false },
  },
  pacman: {
    title: "Munch Maze",
    subtitle: "Eat every dot!",
    instructions: "Steer with arrows, WASD, a controller, on-screen buttons, or by clicking a direction. Grab a glowing power dot to turn the chasers blue and gobble them up!",
    Component: MunchMaze,
    touchOptions: { showDpad: true, showPrimary: false },
  },
  invaders: {
    title: "Star Defender",
    subtitle: "Defend the galaxy!",
    instructions:
      "Pick a difficulty, then defend behind your bunkers! Move left/right with arrows, WASD, a controller, on-screen buttons, or by dragging on the screen. Press the action button/A/tap the fire button to blast invaders — watch for shielded enemies (2 hits), diving attackers, catchable power-up drops, a bonus UFO, and a boss every 3rd wave!",
    Component: StarDefender,
    touchOptions: { showDpad: true, showPrimary: true },
  },
  fighter: {
    title: "Rumble Ring",
    subtitle: "Ready... Fight!",
    instructions:
      "Pick a fighter and a difficulty, then go best-of-3! Move with arrows/WASD/controller/d-pad, jump with up, block with down, punch with the action button/A, kick with the second button/B. Tap both action buttons together for a throw that beats block — hold them together once your meter is full to unleash a super move!",
    Component: RumbleRing,
    touchOptions: { showDpad: true, showPrimary: true, showSecondary: true },
  },
  soccer: {
    title: "Kickoff Clash",
    subtitle: "2v2 — first to score wins!",
    instructions:
      "Pick a difficulty, then play 2v2 with an AI teammate across two halves! Move with arrows/WASD/controller/d-pad, run into the ball to dribble, and hold the action button/A near the ball to charge up a shot — the longer you hold, the harder it flies. Watch your stamina, flick a direction and back quickly to juke a defender, and if it's tied after both halves it goes to penalties!",
    Component: KickoffClash,
    touchOptions: { showDpad: true, showPrimary: true },
  },
  racing: {
    title: "Turbo Dash",
    subtitle: "3-lap race — don't crash!",
    instructions:
      "Pick a difficulty, then race 3 laps against 3 rival racers! Switch lanes with left/right on arrows/WASD/controller/d-pad, and hit the action button/A for a nitro boost that smashes through traffic. Best finish and fastest time score the most!",
    Component: TurboDash,
    touchOptions: { showDpad: true, showPrimary: true },
  },
};

type View = "welcome" | "profiles" | "menu" | "leaderboard" | "achievements" | "game";

function Screens() {
  const { activeProfileId, profiles, settings } = useArcade();
  // Gated on `profiles.length === 0` (a genuinely brand-new install), not
  // on `!activeProfileId` (which is also true right after deleting the last
  // active profile, or before picking one on a device other people already
  // set up profiles on) — a returning household shouldn't see the "welcome"
  // pitch again just because nobody's currently selected.
  const [view, setView] = useState<View>(profiles.length === 0 ? "welcome" : activeProfileId ? "menu" : "profiles");
  const [gameId, setGameId] = useState<GameId | null>(null);

  useEffect(() => {
    loadDisplayFont();
    const detach = attachGlobalInput();
    // Removes the plain-HTML splash (see index.html) now that React has
    // actually mounted and painted a real screen — a brief fade-out reads
    // better than a hard pop, but the removal itself must not be delayed by
    // it (a slow device shouldn't keep the splash up any longer than
    // necessary just for a transition to play).
    const splash = document.getElementById("splash");
    if (splash) {
      splash.style.transition = "opacity 0.25s ease-out";
      splash.style.opacity = "0";
      setTimeout(() => splash.remove(), 260);
    }
    return detach;
  }, []);

  // Mirrors ArcadeSettings.reducedMotion onto a `.reduce-motion` class on
  // <html>, matched in index.css alongside the OS-level
  // prefers-reduced-motion media query — so the in-app setting works
  // whether or not the device's own OS preference is set.
  //
  // The same effect pushes it into the `motion` singleton in lib/motion.ts,
  // which is what the canvas games read each frame (they can't see React
  // state from inside a rAF loop). Doing both in one place is deliberate:
  // if they were set separately the CSS and canvas accommodations could
  // drift out of sync.
  useEffect(() => {
    document.documentElement.classList.toggle("reduce-motion", settings.reducedMotion);
    setReducedMotion(settings.reducedMotion);
  }, [settings.reducedMotion]);

  useEffect(() => {
    const onExit = () => {
      setGameId(null);
      setView("menu");
    };
    window.addEventListener("arcade:exit-game", onExit);
    return () => window.removeEventListener("arcade:exit-game", onExit);
  }, []);

  const handlePlay = (id: GameId) => {
    setGameId(id);
    setView("game");
  };

  const meta = gameId ? GAME_META[gameId] : null;

  const screen =
    view === "welcome" ? (
      <Welcome onDone={() => setView("profiles")} />
    ) : view === "profiles" ? (
      <ProfilePicker onDone={() => setView("menu")} />
    ) : view === "menu" ? (
      <GameMenu
        onPlay={handlePlay}
        onLeaderboard={() => setView("leaderboard")}
        onAchievements={() => setView("achievements")}
        onSwitchProfile={() => setView("profiles")}
      />
    ) : view === "leaderboard" ? (
      <Leaderboard onBack={() => setView("menu")} />
    ) : view === "achievements" ? (
      <AchievementsScreen onBack={() => setView("menu")} />
    ) : view === "game" && gameId && meta ? (
      <GameShell
        gameId={gameId}
        title={meta.title}
        subtitle={meta.subtitle}
        instructions={meta.instructions}
        GameComponent={meta.Component}
        touchOptions={meta.touchOptions}
      />
    ) : null;

  return (
    <>
      <Starfield />
      <StorageErrorBanner />
      <AchievementToasts />
      {/* `key={view}` forces a remount on every screen switch, so the fade
          + slight rise defined by .animate-screen-enter replays each time
          instead of only once ever — cheap way to make navigating between
          screens feel like a deliberate transition instead of a hard cut.
          Already neutralized by the reduced-motion CSS override, so no
          extra JS branching needed here. */}
      <div key={view} className="animate-screen-enter">
        {screen}
      </div>
    </>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <ArcadeProvider>
        <Screens />
      </ArcadeProvider>
    </AppErrorBoundary>
  );
}

interface AppErrorBoundaryState {
  crashed: boolean;
}

// GameShell already has its own boundary around each individual game
// canvas — this is the same idea one level up, around everything else
// (profile picker, menu, leaderboard, achievements, settings). Without it, a
// bad value slipping through `isPlausibleState` (e.g. a hand-edited or
// corrupted backup file restored via Settings > Data) could white-screen
// the entire arcade with no way back in, since none of those screens read
// state through anything that can catch its own errors. The reset button is
// a deliberately blunt escape hatch — it's what actually gets a stuck kid
// unstuck, at the cost of losing local scores (already-broken data can't be
// un-broken from inside a crashed React tree).
class AppErrorBoundary extends Component<{ children: ReactNode }, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { crashed: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { crashed: true };
  }

  componentDidCatch(error: unknown): void {
    console.error("Arcade crashed:", error);
  }

  render() {
    if (this.state.crashed) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-night p-6 text-center text-cloud">
          <p className="font-display font-extrabold text-2xl text-coral">Something went wrong.</p>
          <p className="text-cloud/70 max-w-sm">
            The arcade hit an unexpected error — this usually means a corrupted save (e.g. a bad restored backup).
            Resetting clears all local profiles and scores so it can load again.
          </p>
          <button
            type="button"
            onClick={() => {
              localStorage.clear();
              window.location.reload();
            }}
            className="rounded-full bg-coral px-6 py-3 font-display font-extrabold text-ink hover:bg-coral-2 transition-colors"
          >
            Reset arcade data &amp; reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
