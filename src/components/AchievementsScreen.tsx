import { useArcade } from "../context/ArcadeContext";
import TopBar from "./TopBar";

interface AchievementsScreenProps {
  onBack: () => void;
}

// A badge grid for the active profile: every entry in the ACHIEVEMENTS
// catalog, shown either lit up (unlocked) or dimmed with a lock icon
// (still to earn). Unlock state is derived live from ArcadeContext, not
// stored, so this always reflects the true current stats.
export default function AchievementsScreen({ onBack }: AchievementsScreenProps) {
  const { achievements, unlockedAchievementIds, activeProfile, profileStats } = useArcade();
  const unlockedSet = new Set(unlockedAchievementIds);

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar onBack={onBack} backLabel="Arcade" />
      <main className="flex-1 px-4 pb-16 flex flex-col items-center">
        <h1 className="font-display font-extrabold text-3xl sm:text-4xl text-center mt-2 mb-2">
          🎖️ <span className="text-sun">Achievements</span>
        </h1>
        <p className="text-cloud/60 mb-2 text-center">
          {activeProfile ? `${activeProfile.name}'s badges` : "Pick a player to see their badges"}
        </p>
        {activeProfile && (
          <p className="font-pixel text-[10px] text-lime mb-8">
            {unlockedAchievementIds.length} / {achievements.length} UNLOCKED
          </p>
        )}

        <div className="w-full max-w-3xl grid grid-cols-1 sm:grid-cols-2 gap-4">
          {achievements.map((a) => {
            const unlocked = unlockedSet.has(a.id);
            return (
              <div
                key={a.id}
                className={`rounded-cabinet border-4 p-4 flex items-center gap-4 transition-colors ${
                  unlocked ? "border-sun bg-violet/80 shadow-glow-sun" : "border-violet-2 bg-violet/40"
                }`}
              >
                <div
                  className={`text-4xl shrink-0 w-14 h-14 rounded-full flex items-center justify-center ${
                    unlocked ? "bg-sun/20" : "bg-night/40 grayscale opacity-50"
                  }`}
                  aria-hidden
                >
                  {unlocked ? a.icon : "🔒"}
                </div>
                <div>
                  <p className={`font-display font-extrabold ${unlocked ? "text-cloud" : "text-cloud/50"}`}>{a.title}</p>
                  <p className={`text-sm ${unlocked ? "text-cloud/70" : "text-cloud/40"}`}>{a.description}</p>
                </div>
              </div>
            );
          })}
        </div>

        {activeProfile && (
          <p className="text-cloud/40 text-xs mt-8 text-center">
            {profileStats.totalPlays} rounds played · longest streak {profileStats.longestStreak} day
            {profileStats.longestStreak === 1 ? "" : "s"}
          </p>
        )}
      </main>
    </div>
  );
}
