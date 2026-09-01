import { useEffect, useState } from "react";
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

type View = "profiles" | "menu" | "leaderboard" | "achievements" | "game";

function Screens() {
  const { activeProfileId, settings } = useArcade();
  const [view, setView] = useState<View>(activeProfileId ? "menu" : "profiles");
  const [gameId, setGameId] = useState<GameId | null>(null);

  useEffect(() => {
    loadDisplayFont();
    const detach = attachGlobalInput();
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
    view === "profiles" ? (
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
    <ArcadeProvider>
      <Screens />
    </ArcadeProvider>
  );
}
