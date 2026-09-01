import { useArcade } from "../context/ArcadeContext";

// Mounted once near the top of the app (alongside AchievementToasts), so it
// can appear no matter which screen a save failure happens on — a game
// finishing, a profile being created, a settings change, anything that
// writes state. Deliberately a plain dismissible banner, not a modal: a
// failed save doesn't block play (everything still works for the rest of
// this session, it just isn't being written to disk), so it shouldn't
// interrupt play either.
export default function StorageErrorBanner() {
  const { storageError, dismissStorageError } = useArcade();
  if (!storageError) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-[70] px-4 pt-2">
      <div className="max-w-xl mx-auto flex items-center gap-3 rounded-full bg-coral/90 border-2 border-coral-2 px-4 py-2 text-sm shadow-lg">
        <span className="flex-1 text-ink font-bold">
          ⚠️ Couldn't save your progress — storage might be full or private browsing is on. Play still works, but nothing's
          being saved right now.
        </span>
        <button
          type="button"
          onClick={dismissStorageError}
          aria-label="Dismiss storage warning"
          className="text-ink/60 hover:text-ink shrink-0 px-1 font-bold"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
