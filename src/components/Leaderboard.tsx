import { useState } from "react";
import { useArcade } from "../context/ArcadeContext";
import TopBar from "./TopBar";
import Sparkline from "./Sparkline";
import { useCountUp } from "../hooks/useCountUp";
import { SPRITES, isReady } from "../lib/sprites";
import type { OverallBestEntry, OverallScoreEntry, ScoreEntry } from "../lib/storage";

function fmt(entry: ScoreEntry | OverallBestEntry | null): string {
  if (!entry) return "—";
  return entry.value.toLocaleString();
}

const MEDALS = ["🥇", "🥈", "🥉"];

interface LeaderboardProps {
  onBack: () => void;
}

function OverallScoreHero({ activeProfileName, avatar, gamesCount, overallScore }: { activeProfileName: string; avatar: string; gamesCount: number; overallScore: number }) {
  const animated = useCountUp(overallScore);
  return (
    <div className="w-full max-w-3xl rounded-cabinet border-4 border-sun bg-violet/70 p-4 sm:p-5 mb-4 flex items-center justify-between gap-4">
      <div>
        <p className="font-pixel text-[8px] text-sun mb-1">OVERALL SCORE</p>
        <p className="text-xs text-cloud/50">
          {avatar} {activeProfileName}&rsquo;s best score, added up across all {gamesCount} games
        </p>
      </div>
      <p className="font-display font-extrabold text-3xl text-sun shrink-0">{animated.toLocaleString()}</p>
    </div>
  );
}

function ChampionRow({ entry, rank }: { entry: OverallScoreEntry; rank: number }) {
  const animated = useCountUp(entry.overallScore);
  return (
    <div className="flex items-center justify-between rounded-lg bg-night/40 px-3 py-2 text-sm">
      <span className="flex items-center gap-2">
        <span className="font-pixel text-[10px] text-cloud/50 w-6 text-center">{MEDALS[rank] ?? rank + 1}</span>
        <span>{entry.profile.avatar}</span>
        <span className="font-display font-bold">{entry.profile.name}</span>
      </span>
      <span className="font-display font-extrabold text-sun">{animated.toLocaleString()}</span>
    </div>
  );
}

type SortMode = "score" | "name";

export default function Leaderboard({ onBack }: LeaderboardProps) {
  const { games, statsFor, activeProfile, overallScore, overallScoreboard } = useArcade();
  const [sortMode, setSortMode] = useState<SortMode>("score");

  const sortedScoreboard =
    sortMode === "name"
      ? [...overallScoreboard].sort((a, b) => a.profile.name.localeCompare(b.profile.name))
      : overallScoreboard;

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
          <OverallScoreHero
            activeProfileName={activeProfile.name}
            avatar={activeProfile.avatar}
            gamesCount={games.length}
            overallScore={overallScore}
          />
        )}
        {activeProfile && overallScore === 0 && (
          <p className="text-cloud/50 text-sm mb-8 text-center max-w-sm">
            Nothing on the board yet — play any game once and your best run shows up right here. 🎮
          </p>
        )}

        {overallScoreboard.length > 1 && (
          <div className="w-full max-w-3xl rounded-cabinet border-4 border-violet-2 bg-violet/50 p-4 sm:p-5 mb-8">
            <div className="flex items-center justify-between mb-3">
              <p className="font-display font-bold text-sm text-cloud/70">🏅 Arcade Champions (Overall Score)</p>
              <div className="flex gap-1 text-xs">
                {(["score", "name"] as SortMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setSortMode(mode)}
                    className={`rounded-full px-3 py-1 font-display font-bold transition-colors ${
                      sortMode === mode ? "bg-sun text-ink" : "bg-night/50 text-cloud/60 hover:bg-night/70"
                    }`}
                  >
                    {mode === "score" ? "By score" : "A–Z"}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-2">
              {sortedScoreboard.map((entry, i) => (
                <ChampionRow key={entry.profile.id} entry={entry} rank={sortMode === "score" ? i : overallScoreboard.indexOf(entry)} />
              ))}
            </div>
          </div>
        )}

        <div className="w-full max-w-3xl grid gap-4">
          {games.map((g) => {
            const stats = statsFor(g.id);
            const history = stats.myHistory.map((h) => h.value);
            return (
              <div key={g.id} className="rounded-cabinet border-4 border-violet-2 bg-violet/70 p-4 sm:p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-display font-bold text-lg sm:text-xl">{g.title}</h2>
                  <div className="flex items-center gap-3">
                    {history.length >= 2 && <Sparkline values={history} />}
                    <span className="text-cloud/50 text-sm">{g.subtitle}</span>
                  </div>
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
