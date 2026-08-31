import { useArcade } from "../context/ArcadeContext";

export default function TopBar({ onBack, backLabel = "Back", showProfile = true, right }) {
  const { activeProfile, muted, toggleMuted } = useArcade();
  return (
    <header className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
      <div className="flex items-center gap-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="font-display font-bold text-sm sm:text-base rounded-full bg-violet/80 border-2 border-violet-2 px-4 py-2 hover:bg-violet-2 transition-colors"
          >
            ← {backLabel}
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {showProfile && activeProfile && (
          <div className="flex items-center gap-2 bg-violet/70 border-2 border-violet-2 rounded-full pl-2 pr-3 py-1">
            <span className="text-xl sm:text-2xl" aria-hidden>
              {activeProfile.avatar}
            </span>
            <span className="font-display font-bold text-sm sm:text-base">{activeProfile.name}</span>
          </div>
        )}
        <button
          type="button"
          onClick={toggleMuted}
          aria-label={muted ? "Unmute sound" : "Mute sound"}
          className="w-10 h-10 rounded-full bg-violet/80 border-2 border-violet-2 flex items-center justify-center text-lg hover:bg-violet-2 transition-colors"
        >
          {muted ? "🔇" : "🔊"}
        </button>
        {right}
      </div>
    </header>
  );
}
