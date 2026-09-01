import type { AccentColor, GameId, GameMeta } from "../lib/storage";

const COLOR_MAP: Record<AccentColor, { text: string; bg: string; glow: string; ring: string }> = {
  coral: { text: "text-coral", bg: "bg-coral", glow: "shadow-glow-coral", ring: "ring-coral" },
  teal: { text: "text-teal", bg: "bg-teal", glow: "shadow-glow-teal", ring: "ring-teal" },
  sun: { text: "text-sun", bg: "bg-sun", glow: "shadow-glow-sun", ring: "ring-sun" },
  lime: { text: "text-lime", bg: "bg-lime", glow: "shadow-glow-lime", ring: "ring-lime" },
};

const GAME_ICON: Record<GameId, string> = {
  pacman: "🟡",
  invaders: "👾",
  snake: "🐍",
  fighter: "🥊",
  soccer: "⚽",
  racing: "🏎️",
};

interface CabinetCardProps {
  game: GameMeta;
  focused: boolean;
  onFocus: () => void;
  onSelect: () => void;
  comingSoon?: boolean;
}

// The signature element: a mini arcade cabinet with a pixel-bulb marquee
// strip that lights up on focus, and a coin that hops onto whichever
// cabinet currently has keyboard/gamepad focus.
export default function CabinetCard({ game, focused, onFocus, onSelect, comingSoon }: CabinetCardProps) {
  const c = COLOR_MAP[game.color] || COLOR_MAP.coral;
  return (
    <button
      type="button"
      onMouseEnter={onFocus}
      onFocus={onFocus}
      onClick={onSelect}
      // `outline-none` is deliberate: this card has its own high-contrast
      // focus treatment below (solid white border + accent glow + lift),
      // driven by the `focused` prop, which useGridNav keeps in sync with
      // real keyboard/gamepad focus (see its onFocus wiring) — so Tab still
      // shows a clearly visible indicator, just this bespoke one instead of
      // the site's default sun-yellow outline.
      className={`group relative w-full text-left rounded-cabinet border-4 p-4 sm:p-5 transition-all duration-150 outline-none
        bg-violet/80 border-violet-2
        ${focused ? `border-white ${c.glow} -translate-y-1 scale-[1.03]` : "hover:-translate-y-0.5"}
      `}
    >
      {focused && (
        <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-2xl animate-coin-hop" aria-hidden>
          🪙
        </span>
      )}

      {/* marquee */}
      <div
        className={`rounded-full px-3 py-1 mb-3 text-center font-pixel text-[9px] sm:text-[10px] tracking-tight ${c.bg} text-ink ${
          focused ? "animate-bulb-pulse" : ""
        }`}
      >
        {game.title.toUpperCase()}
      </div>

      <div className="flex items-center justify-between">
        <div className="text-5xl sm:text-6xl" aria-hidden>
          {GAME_ICON[game.id]}
        </div>
        <div className={`w-3 h-3 rounded-full ${c.bg} ${focused ? "animate-bulb-pulse" : ""}`} aria-hidden />
      </div>

      <p className="mt-3 font-display font-bold text-cloud text-lg">{game.title}</p>
      <p className="text-cloud/60 text-sm">{game.subtitle}</p>

      {comingSoon && (
        <span className="absolute top-3 right-3 font-pixel text-[8px] bg-ink/80 text-cloud/80 px-2 py-1 rounded-full">
          SOON
        </span>
      )}
    </button>
  );
}
