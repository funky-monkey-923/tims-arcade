import { useEffect, useState } from "react";
import { ArcadeProvider, useArcade } from "./context/ArcadeContext";
import { attachGlobalInput } from "./lib/input";
import { loadDisplayFont } from "./lib/font";
import Starfield from "./components/Starfield";
import ProfilePicker from "./components/ProfilePicker";
import GameMenu from "./components/GameMenu";
import Leaderboard from "./components/Leaderboard";
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
  showConfirm?: boolean;
  showCancel?: boolean;
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
    touchOptions: { showDpad: true, showConfirm: false },
  },
  pacman: {
    title: "Munch Maze",
    subtitle: "Eat every dot!",
    instructions: "Steer with arrows, WASD, a controller, on-screen buttons, or by clicking a direction. Grab a glowing power dot to turn the chasers blue and gobble them up!",
    Component: MunchMaze,
    touchOptions: { showDpad: true, showConfirm: false },
  },
  invaders: {
    title: "Star Defender",
    subtitle: "Defend the galaxy!",
    instructions: "Move left/right with arrows, WASD, a controller, on-screen buttons, or by dragging on the screen. Press confirm/A/tap the fire button to blast the invaders!",
    Component: StarDefender,
    touchOptions: { showDpad: true, showConfirm: true },
  },
  fighter: {
    title: "Rumble Ring",
    subtitle: "Ready... Fight!",
    instructions: "Move with arrows/WASD/controller/d-pad, jump with up, block with down, punch with confirm/A, kick with cancel/B. Knock out the rival before time runs out!",
    Component: RumbleRing,
    touchOptions: { showDpad: true, showConfirm: true, showCancel: true },
  },
  soccer: {
    title: "Kickoff Clash",
    subtitle: "First to score wins!",
    instructions: "Run into the ball to dribble it, move with arrows/WASD/controller/d-pad, and press confirm/A near the ball to blast a shot on goal!",
    Component: KickoffClash,
    touchOptions: { showDpad: true, showConfirm: true },
  },
  racing: {
    title: "Turbo Dash",
    subtitle: "Don't crash!",
    instructions: "Switch lanes with left/right on arrows/WASD/controller/d-pad, and hit confirm/A for a nitro boost that smashes through traffic!",
    Component: TurboDash,
    touchOptions: { showDpad: true, showConfirm: true },
  },
};

type View = "profiles" | "menu" | "leaderboard" | "game";

function Screens() {
  const { activeProfileId } = useArcade();
  const [view, setView] = useState<View>(activeProfileId ? "menu" : "profiles");
  const [gameId, setGameId] = useState<GameId | null>(null);

  useEffect(() => {
    loadDisplayFont();
    const detach = attachGlobalInput();
    return detach;
  }, []);

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

  return (
    <>
      <Starfield />
      {view === "profiles" && <ProfilePicker onDone={() => setView("menu")} />}
      {view === "menu" && (
        <GameMenu
          onPlay={handlePlay}
          onLeaderboard={() => setView("leaderboard")}
          onSwitchProfile={() => setView("profiles")}
        />
      )}
      {view === "leaderboard" && <Leaderboard onBack={() => setView("menu")} />}
      {view === "game" && gameId && meta && (
        <GameShell
          gameId={gameId}
          title={meta.title}
          subtitle={meta.subtitle}
          instructions={meta.instructions}
          GameComponent={meta.Component}
          touchOptions={meta.touchOptions}
        />
      )}
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
