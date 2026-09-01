import { useMemo } from "react";
import { useArcade } from "../context/ArcadeContext";
import { useGridNav } from "../hooks/useGridNav";
import { useIdle } from "../hooks/useIdle";
import CabinetCard from "./CabinetCard";
import TopBar from "./TopBar";
import { engine } from "../lib/audio";
import type { AccentColor, GameId } from "../lib/storage";

interface GameMenuProps {
  onPlay: (id: GameId) => void;
  onLeaderboard: () => void;
  onAchievements: () => void;
  onSwitchProfile: () => void;
}

const GLOW_COLOR: Record<AccentColor, string> = {
  coral: "var(--color-coral)",
  teal: "var(--color-teal)",
  sun: "var(--color-sun)",
  lime: "var(--color-lime)",
};

export default function GameMenu({ onPlay, onLeaderboard, onAchievements, onSwitchProfile }: GameMenuProps) {
  const { games, activeProfile, unlockedAchievementIds, achievements, profileStats, recentHighlights, settings, mascotProgress } =
    useArcade();
  const columns = () => (window.innerWidth >= 1024 ? 3 : window.innerWidth >= 640 ? 2 : 1);
  const idle = useIdle(15000);

  const [focused, setFocused] = useGridNav({
    count: games.length,
    columns,
    onConfirm: (i) => {
      engine.unlock();
      engine.playSfx("select");
      onPlay(games[i].id);
    },
  });

  const focusedColor = games[focused]?.color ?? "coral";

  const ticker = useMemo(() => {
    if (recentHighlights.length === 0) return null;
    return recentHighlights
      .map((h) =>
        h.isNewBest
          ? `🌟 ${h.avatar} ${h.profileName} set a new best in ${h.gameTitle}: ${h.value.toLocaleString()}!`
          : `🎮 ${h.avatar} ${h.profileName} played ${h.gameTitle} — ${h.value.toLocaleString()}`
      )
      .join("     •     ");
  }, [recentHighlights]);

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      {/* Ambient glow that eases toward whichever cabinet currently has
          focus, so the whole screen's mood follows what you're about to
          play instead of staying static. Pure decoration — behind
          everything, ignores pointer events, and just a color transition
          (no shape/position animation) so it isn't gated behind
          reduced-motion. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -z-10 top-1/4 left-1/2 -translate-x-1/2 w-[70vw] h-[70vw] max-w-2xl rounded-full blur-[100px] opacity-20 transition-colors duration-700"
        style={{ backgroundColor: GLOW_COLOR[focusedColor] }}
      />

      <TopBar showProfile={true} />
      <main className="flex-1 flex flex-col items-center px-4 pb-16">
        <h1 className="font-display font-extrabold text-4xl sm:text-5xl text-center mt-2 mb-2 text-cloud">
          Tim's <span className="text-coral">Arcade</span>
        </h1>
        <p className="text-cloud/60 mb-1 text-center">
          {activeProfile ? `Pick a game, ${activeProfile.name}!` : "Pick a game to play!"}
        </p>
        {activeProfile && (
          <p className="font-pixel text-[9px] text-cloud/40 mb-3 text-center">
            🎮 {profileStats.totalPlays} PLAYED · 🔥 {profileStats.currentStreak}-DAY STREAK · 🎖️{" "}
            {unlockedAchievementIds.length}/{achievements.length} BADGES
          </p>
        )}
        {/* Cross-game "arcade rank" — a small level/title/XP readout, not a
            full screen of its own (kept deliberately bounded per the
            overhaul plan). XP is derived live from stats already tracked
            elsewhere (plays, PBs, breadth, badges), so this can never drift
            out of sync with them. */}
        {activeProfile && (
          <div className="w-full max-w-xs mb-8">
            <div className="flex items-center justify-between font-pixel text-[9px] text-cloud/60 mb-1">
              <span>
                ⭐ LV.{mascotProgress.level} · {mascotProgress.title.toUpperCase()}
              </span>
              <span>
                {mascotProgress.xpIntoLevel}/{mascotProgress.xpForNextLevel} XP
              </span>
            </div>
            <div className="h-2 rounded-full bg-violet/60 overflow-hidden">
              <div
                className="h-full bg-sun transition-[width] duration-500"
                style={{ width: `${Math.round(mascotProgress.progress * 100)}%` }}
              />
            </div>
          </div>
        )}
        {!activeProfile && <div className="mb-8" />}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 w-full max-w-5xl">
          {games.map((g, i) => (
            <CabinetCard
              key={g.id}
              game={g}
              focused={focused === i}
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
            className="rounded-full bg-teal/90 text-ink font-display font-extrabold px-6 py-3 hover:bg-teal active:scale-95 transition-transform transition-colors"
          >
            🏆 Leaderboard
          </button>
          <button
            type="button"
            onClick={() => {
              engine.unlock();
              engine.playSfx("select");
              onAchievements();
            }}
            className="rounded-full bg-sun/90 text-ink font-display font-extrabold px-6 py-3 hover:bg-sun active:scale-95 transition-transform transition-colors"
          >
            🎖️ Achievements {activeProfile ? `(${unlockedAchievementIds.length}/${achievements.length})` : ""}
          </button>
          <button
            type="button"
            onClick={() => {
              engine.unlock();
              engine.playSfx("back");
              onSwitchProfile();
            }}
            className="rounded-full bg-violet/80 border-2 border-violet-2 font-display font-extrabold px-6 py-3 hover:bg-violet-2 active:scale-95 transition-transform transition-colors"
          >
            🔁 Switch Player
          </button>
        </div>
      </main>

      {/* "Attract mode": once nobody's touched the arcade for a while, a
          real cabinet loops a demo reel — this is the closest web
          equivalent, scrolling recent scores across the bottom. Fades in
          rather than popping, and only appears at all once there's
          something to show. */}
      {idle && ticker && (
        <div
          className={`fixed bottom-0 inset-x-0 z-30 bg-night/90 border-t-2 border-violet-2 py-2 overflow-hidden ${
            settings.reducedMotion ? "" : "animate-screen-enter"
          }`}
        >
          <div
            className="whitespace-nowrap font-pixel text-[10px] text-cloud/70"
            style={
              settings.reducedMotion
                ? undefined
                : { display: "inline-block", paddingLeft: "100%", animation: "ticker-scroll 28s linear infinite" }
            }
          >
            {ticker}
          </div>
        </div>
      )}
    </div>
  );
}
