import { useEffect, useRef, useState } from "react";
import { useArcade } from "../context/ArcadeContext";
import { engine } from "../lib/audio";
import type { AchievementId } from "../lib/storage";

interface Toast {
  key: number;
  id: AchievementId;
  title: string;
  icon: string;
}

const TOAST_MS = 4500;

// Watches the active profile's unlocked-achievement list and pops a toast
// the moment a *new* id appears. Mounted once, near the top of the app, so
// it fires no matter which screen you're on when the unlock happens (e.g.
// mid-game). Deliberately doesn't celebrate achievements that were already
// unlocked before this component mounted (or before a profile switch) —
// only genuinely new ones, tracked per-profile so switching players
// doesn't cause a flood of "unlocked" toasts for badges they earned days
// ago.
export default function AchievementToasts() {
  const { activeProfileId, unlockedAchievementIds, achievements } = useArcade();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seenByProfile = useRef<Record<string, Set<AchievementId>>>({});
  const keyRef = useRef(0);

  useEffect(() => {
    if (!activeProfileId) return;
    const seen = seenByProfile.current[activeProfileId];
    if (!seen) {
      // First time we're seeing this profile this session — baseline
      // without celebrating, so re-opening the app doesn't re-announce
      // every badge already earned.
      seenByProfile.current[activeProfileId] = new Set(unlockedAchievementIds);
      return;
    }
    const newlyUnlocked = unlockedAchievementIds.filter((id) => !seen.has(id));
    if (newlyUnlocked.length === 0) return;
    newlyUnlocked.forEach((id) => seen.add(id));
    const newToasts = newlyUnlocked
      .map((id) => achievements.find((a) => a.id === id))
      .filter((a): a is NonNullable<typeof a> => !!a)
      .map((a) => ({ key: keyRef.current++, id: a.id, title: a.title, icon: a.icon }));
    if (newToasts.length === 0) return;
    engine.playSfx("highscore");
    setToasts((prev) => [...prev, ...newToasts]);
    newToasts.forEach((t) => {
      setTimeout(() => setToasts((prev) => prev.filter((x) => x.key !== t.key)), TOAST_MS);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfileId, unlockedAchievementIds]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 inset-x-0 z-[60] flex flex-col items-center gap-2 pointer-events-none px-4">
      {toasts.map((t) => (
        <div
          key={t.key}
          role="status"
          className="animate-toast-in pointer-events-auto flex items-center gap-3 rounded-full border-2 border-sun bg-violet shadow-glow-sun px-5 py-3 max-w-sm"
        >
          <span className="text-2xl" aria-hidden>
            {t.icon}
          </span>
          <div>
            <p className="font-pixel text-[8px] text-sun">ACHIEVEMENT UNLOCKED</p>
            <p className="font-display font-extrabold text-cloud">{t.title}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
