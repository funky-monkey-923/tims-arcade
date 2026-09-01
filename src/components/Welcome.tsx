import { useArcade } from "../context/ArcadeContext";
import { GameIcon } from "../lib/gameIcons";
import MascotAvatar from "./MascotAvatar";
import { engine } from "../lib/audio";
import type { AccentColor } from "../lib/storage";

interface WelcomeProps {
  onDone: () => void;
}

const TEXT_COLOR: Record<AccentColor, string> = {
  coral: "text-coral",
  teal: "text-teal",
  sun: "text-sun",
  lime: "text-lime",
};

// The app's first-ever screen for a brand-new visitor — gated in App.tsx on
// `profiles.length === 0`, so returning players never see this again once
// even one profile exists. Before this existed, the very first thing anyone
// saw was the full "Who's Playing?" profile-creation flow with zero context
// about what the app even is; this is the one-time card that was missing.
export default function Welcome({ onDone }: WelcomeProps) {
  const { games } = useArcade();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10 text-center">
      <MascotAvatar tierIndex={0} size={84} className="mb-4" />
      <h1 className="font-display font-extrabold text-4xl sm:text-5xl text-cloud mb-2">
        Welcome to Tim's <span className="text-coral">Arcade</span>!
      </h1>
      <p className="text-cloud/70 max-w-md mb-8">
        Six games, your own profile, and a scoreboard that remembers you. No accounts, no internet needed after
        the first visit — just pick your name and start playing.
      </p>

      <div className="w-full max-w-2xl grid grid-cols-2 sm:grid-cols-3 gap-3 mb-10">
        {games.map((g) => (
          <div key={g.id} className="rounded-cabinet border-2 border-violet-2 bg-violet/60 p-3 flex flex-col items-center gap-1.5">
            <GameIcon id={g.id} className={`w-7 h-7 ${TEXT_COLOR[g.color]}`} />
            <p className="font-display font-bold text-xs text-cloud">{g.title}</p>
            <p className="text-cloud/50 text-[11px] leading-tight">{g.subtitle}</p>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => {
          engine.unlock();
          engine.playSfx("start");
          onDone();
        }}
        className="rounded-full bg-coral px-10 py-4 font-display font-extrabold text-xl text-ink hover:bg-coral-2 active:scale-95 transition-transform transition-colors"
      >
        Let's Play! 🕹️
      </button>
    </div>
  );
}
