import { useArcade } from "../context/ArcadeContext";
import TopBar from "./TopBar";
import { SPRITES, isReady } from "../lib/sprites";
import type { OverallBestEntry, ScoreEntry } from "../lib/storage";

function fmt(entry: ScoreEntry | OverallBestEntry | null): string {
  if (!entry) return "—";
  return entry.value.toLocaleString();
}

interface LeaderboardProps {
  onBack: () => void;
}

export default function Leaderboard({ onBack }: LeaderboardProps) {
  const { games, statsFor, activeProfile, overallScore, overallScoreboard } = useArcade();

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar onBack={onBack} backLabel="Arcade" />
      <main className="flex-1 px-4 pb-16 flex flex-col items-center">
        <h1 className="font-display font-extrabold text-3xl sm:text-4xl text-center mt-2 mb-2">
          🏆 <span className="text-sun">Leaderboard</span>
        </h1>
        <p className="text-cloud/60 mb-8 text-center">
          {activeProfile ? `Best scores, and yours, ${activeProfile.name}` : "Pick a player to see your scores"}
        </p>

        {activeProfile && (
          <div className="w-full max-w-3xl rounded-cabinet border-4 border-sun bg-violet/70 p-4 sm:p-5 mb-4 flex items-center justify-between gap-4">
            <div>
              <p className="font-pixel text-[8px] text-sun mb-1">OVERALL SCORE</p>
              <p className="text-xs text-cloud/50">
                {activeProfile.avatar} {activeProfile.name}&rsquo;s best score, added up across all {games.length} games
              </p>
            </div>
            <p className="font-display font-extrabold text-3xl text-sun shrink-0">{overallScore.toLocaleString()}</p>
          </div>
        )}

        {overallScoreboard.length > 1 && (
          <div className="w-full max-w-3xl rounded-cabinet border-4 border-violet-2 bg-violet/50 p-4 sm:p-5 mb-8">
            <p className="font-display font-bold text-sm text-cloud/70 mb-3">🏅 Arcade Champions (Overall Score)</p>
            <div className="grid gap-2">
              {overallScoreboard.map((entry, i) => (
                <div
                  key={entry.profile.id}
                  className="flex items-center justify-between rounded-lg bg-night/40 px-3 py-2 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <span className="font-pixel text-[10px] text-cloud/50 w-5">{i + 1}</span>
                    <span>{entry.profile.avatar}</span>
                    <span className="font-display font-bold">{entry.profile.name}</span>
                  </span>
                  <span className="font-display font-extrabold text-sun">{entry.overallScore.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="w-full max-w-3xl grid gap-4">
          {games.map((g) => {
            const stats = statsFor(g.id);
            return (
              <div key={g.id} className="rounded-cabinet border-4 border-violet-2 bg-violet/70 p-4 sm:p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-display font-bold text-lg sm:text-xl">{g.title}</h2>
                  <span className="text-cloud/50 text-sm">{g.subtitle}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-night/50 py-3">
                    <p className="font-pixel text-[8px] text-sun mb-1 flex items-center justify-center gap-1">
                      {isReady(SPRITES.starBadge) && (
                        <img src={SPRITES.starBadge.src} alt="" aria-hidden className="w-3 h-3" />
                      )}
                      TOP PLAYER
                    </p>
                    <p className="font-display font-extrabold text-xl">{fmt(stats.overallBest)}</p>
                    {stats.overallBest && (
                      <p className="text-xs text-cloud/50 mt-1">
                        {stats.overallBest.avatar} {stats.overallBest.profileName}
                      </p>
                    )}
                  </div>
                  <div className="rounded-xl bg-night/50 py-3">
                    <p className="font-pixel text-[8px] text-teal mb-1">MY BEST</p>
                    <p className="font-display font-extrabold text-xl">{fmt(stats.myBest)}</p>
                  </div>
                  <div className="rounded-xl bg-night/50 py-3">
                    <p className="font-pixel text-[8px] text-coral mb-1">MY LAST</p>
                    <p className="font-display font-extrabold text-xl">{fmt(stats.myLast)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
