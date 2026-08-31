import { useArcade } from "../context/ArcadeContext";
import { useGridNav } from "../hooks/useGridNav";
import CabinetCard from "./CabinetCard";
import TopBar from "./TopBar";
import { engine } from "../lib/audio";

const PLAYABLE = new Set(["snake"]);

export default function GameMenu({ onPlay, onLeaderboard, onSwitchProfile }) {
  const { games, activeProfile } = useArcade();
  const columns = () => (window.innerWidth >= 1024 ? 3 : window.innerWidth >= 640 ? 2 : 1);

  const [focused, setFocused] = useGridNav({
    count: games.length,
    columns,
    onConfirm: (i) => {
      engine.unlock();
      engine.playSfx("select");
      onPlay(games[i].id);
    },
  });

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar showProfile={true} />
      <main className="flex-1 flex flex-col items-center px-4 pb-16">
        <h1 className="font-display font-extrabold text-4xl sm:text-5xl text-center mt-2 mb-2 text-cloud">
          Tim's <span className="text-coral">Arcade</span>
        </h1>
        <p className="text-cloud/60 mb-8 text-center">
          {activeProfile ? `Pick a game, ${activeProfile.name}!` : "Pick a game to play!"}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 w-full max-w-5xl">
          {games.map((g, i) => (
            <CabinetCard
              key={g.id}
              game={g}
              focused={focused === i}
              comingSoon={!PLAYABLE.has(g.id)}
              onFocus={() => setFocused(i)}
              onSelect={() => {
                engine.unlock();
                engine.playSfx("select");
                onPlay(g.id);
              }}
            />
          ))}
        </div>

        <div className="flex flex-wrap gap-4 justify-center mt-10">
          <button
            type="button"
            onClick={() => {
              engine.unlock();
              engine.playSfx("select");
              onLeaderboard();
            }}
            className="rounded-full bg-teal/90 text-ink font-display font-extrabold px-6 py-3 hover:bg-teal transition-colors"
          >
            🏆 Leaderboard
          </button>
          <button
            type="button"
            onClick={() => {
              engine.unlock();
              engine.playSfx("back");
              onSwitchProfile();
            }}
            className="rounded-full bg-violet/80 border-2 border-violet-2 font-display font-extrabold px-6 py-3 hover:bg-violet-2 transition-colors"
          >
            🔁 Switch Player
          </button>
        </div>
      </main>
    </div>
  );
}
