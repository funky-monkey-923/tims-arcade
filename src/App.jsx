import { useEffect, useState } from "react";
import { ArcadeProvider, useArcade } from "./context/ArcadeContext";
import { attachGlobalInput } from "./lib/input";
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

const GAME_META = {
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

function ComingSoonModal({ game, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-night/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-cabinet border-4 border-teal bg-violet p-6 text-center">
        <p className="text-5xl mb-3">🚧</p>
        <p className="font-display font-extrabold text-xl mb-2">{game.title} is being built!</p>
        <p className="text-cloud/70 mb-5">Come back soon to play this one. Try Wiggle Worm for now!</p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-teal px-6 py-2 font-display font-extrabold text-ink hover:brightness-110"
        >
          Okay!
        </button>
      </div>
    </div>
  );
}

function Screens() {
  const { activeProfileId, games } = useArcade();
  const [view, setView] = useState(activeProfileId ? "menu" : "profiles");
  const [gameId, setGameId] = useState(null);
  const [comingSoon, setComingSoon] = useState(null);

  useEffect(() => {
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

  const handlePlay = (id) => {
    if (GAME_META[id]) {
      setGameId(id);
      setView("game");
    } else {
      setComingSoon(games.find((g) => g.id === id));
    }
  };

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
      {view === "game" && gameId && GAME_META[gameId] && (
        <GameShell
          gameId={gameId}
          title={GAME_META[gameId].title}
          subtitle={GAME_META[gameId].subtitle}
          instructions={GAME_META[gameId].instructions}
          GameComponent={GAME_META[gameId].Component}
          touchOptions={GAME_META[gameId].touchOptions}
        />
      )}
      {comingSoon && <ComingSoonModal game={comingSoon} onClose={() => setComingSoon(null)} />}
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
