import { useRef, useState, type MouseEvent } from "react";
import { useArcade } from "../context/ArcadeContext";
import { GameIcon } from "../lib/gameIcons";
import type { AccentColor, GameMeta } from "../lib/storage";

const COLOR_MAP: Record<AccentColor, { text: string; bg: string; glow: string; ring: string }> = {
  coral: { text: "text-coral", bg: "bg-coral", glow: "shadow-glow-coral", ring: "ring-coral" },
  teal: { text: "text-teal", bg: "bg-teal", glow: "shadow-glow-teal", ring: "ring-teal" },
  sun: { text: "text-sun", bg: "bg-sun", glow: "shadow-glow-sun", ring: "ring-sun" },
  lime: { text: "text-lime", bg: "bg-lime", glow: "shadow-glow-lime", ring: "ring-lime" },
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
  const { settings } = useArcade();
  const c = COLOR_MAP[game.color] || COLOR_MAP.coral;
  const cardRef = useRef<HTMLButtonElement | null>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  // A subtle cursor-following 3D tilt — purely a mouse-hover nicety, so it's
  // skipped outright when reduced motion is on rather than trying to tone
  // it down, and it resets to flat on mouse-leave so it never gets "stuck"
  // mid-tilt.
  const handleMouseMove = (e: MouseEvent<HTMLButtonElement>) => {
    if (settings.reducedMotion) return;
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    const max = 6; // degrees
    setTilt({ x: -py * max, y: px * max });
  };
  const resetTilt = () => setTilt({ x: 0, y: 0 });

  return (
    // The coin lives in this outer wrapper rather than inside the button,
    // because it hops to a position *above* the card (-top-5) — the button
    // itself needs `overflow-hidden` so the marquee band's square corners
    // get clipped to match the card's rounded-cabinet shape, and that would
    // clip the coin too if it were a child of the button instead of a
    // sibling around it.
    <div className="relative">
      {focused && (
        <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-2xl animate-coin-hop z-10" aria-hidden>
          🪙
        </span>
      )}

      <button
        ref={cardRef}
        type="button"
        onMouseEnter={onFocus}
        onFocus={onFocus}
        onClick={onSelect}
        onMouseMove={handleMouseMove}
        onMouseLeave={resetTilt}
        onBlur={resetTilt}
        style={{
          transform: `perspective(700px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) ${
            focused ? "translateY(-4px) scale(1.03)" : ""
          }`,
        }}
        // `outline-none` is deliberate: this card has its own high-contrast
        // focus treatment below (solid white border + accent glow + lift),
        // driven by the `focused` prop, which useGridNav keeps in sync with
        // real keyboard/gamepad focus (see its onFocus wiring) — so Tab still
        // shows a clearly visible indicator, just this bespoke one instead of
        // the site's default sun-yellow outline.
        className={`group relative w-full text-left rounded-cabinet border-4 overflow-hidden transition-[transform,box-shadow,border-color] duration-150 outline-none
          bg-violet/80 border-violet-2
          ${focused ? `border-white ${c.glow}` : "hover:-translate-y-0.5"}
        `}
      >
        {/* marquee — a real cabinet-header-style band across the top of the
            card, colored in the game's own accent, instead of a plain UI
            card differentiated only by a focus glow. The icon sits in a
            dark "bulb housing" chip so it stays legible in the game's own
            accent color regardless of how bright the band behind it is. */}
        <div className={`flex items-center gap-2 px-3 sm:px-4 py-2 ${c.bg}`}>
          <span
            className={`shrink-0 grid place-items-center w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-ink/85 ${
              focused ? "animate-bulb-pulse" : ""
            }`}
          >
            <GameIcon id={game.id} className={`w-5 h-5 sm:w-6 sm:h-6 ${c.text}`} />
          </span>
          <span className="min-w-0 flex-1 font-pixel text-[9px] sm:text-[10px] tracking-tight text-ink truncate">
            {game.title.toUpperCase()}
          </span>
          <span
            className={`shrink-0 w-2.5 h-2.5 rounded-full bg-ink/50 ${focused ? "animate-bulb-pulse" : ""}`}
            aria-hidden
          />
        </div>

        <div className="p-4 sm:p-5 pt-3">
          <p className="text-cloud/60 text-sm">{game.subtitle}</p>
        </div>

        {comingSoon && (
          <span className="absolute top-3 right-3 font-pixel text-[8px] bg-ink/80 text-cloud/80 px-2 py-1 rounded-full">
            SOON
          </span>
        )}
      </button>
    </div>
  );
}
