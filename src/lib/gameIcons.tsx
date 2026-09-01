// Small, flat, geometric per-game icons for the menu's CabinetCard grid.
//
// Deliberately NOT a replacement for emoji app-wide — this is a targeted
// swap of just the single big per-game glyph on the cabinet cards (see
// CabinetCard.tsx), because that's the one spot a design review flagged as
// looking like a placeholder emoji grid next to games that otherwise have
// fully custom sprite art. Emoji elsewhere (avatars, achievement badges,
// buttons) stays untouched — it's still doing useful, colorblind-safe,
// charming work there.
//
// Every icon here is intentionally colorless: they draw with
// `stroke="currentColor"` / `fill="currentColor"` and take their color from
// whatever `className` (e.g. a `text-coral` utility) the caller applies, per
// that game's own AccentColor — never a hardcoded hex — so the same icon
// component would still look "right" if a game's accent ever changed.
// Geometry is kept bold and simple (thick strokes, few points) since this is
// a kids' app and these render as small as ~40px in the marquee band.

import type { FC } from "react";
import type { GameId } from "./storage";

export interface GameIconProps {
  className?: string;
}

const commonSvgProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  "aria-hidden": true as const,
};

// Wiggle Worm — a coiled snake body, one loop plus a small head/tongue so it
// reads as "snake" rather than an abstract squiggle even at small sizes.
export function SnakeIcon({ className }: GameIconProps) {
  return (
    <svg {...commonSvgProps} className={className}>
      <path
        d="M4 9c0-2.5 2-4.5 4.5-4.5S13 6.5 13 9s-2 4.5-4.5 4.5S4 15.5 6.5 15.5 11 13.5 13.5 13.5 18 15.5 18 18"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="18" cy="6.5" r="2.2" fill="currentColor" />
      <path d="M19.5 5.2l1.8-1.4M19.5 5.2l2.2.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

// Munch Maze — a Pac-Man style wedge (a circle with a bite taken out of it)
// plus a tiny trailing dot standing in for the maze pellets/ghost accent.
export function PacmanIcon({ className }: GameIconProps) {
  return (
    <svg {...commonSvgProps} className={className}>
      <path d="M12 12L20.5 7.2A9 9 0 1 0 20.5 16.8L12 12Z" fill="currentColor" />
      <circle cx="20" cy="19" r="1.6" fill="currentColor" />
    </svg>
  );
}

// Star Defender — a compact rocket/UFO silhouette: a rounded fuselage, two
// fins, and a small window, plus a exhaust flame.
export function InvadersIcon({ className }: GameIconProps) {
  return (
    <svg {...commonSvgProps} className={className}>
      <path
        d="M12 2c2.2 2.6 3.4 6 3.4 10v4.5H8.6V12c0-4 1.2-7.4 3.4-10Z"
        fill="currentColor"
      />
      <path d="M8.6 15.5 5 19v-2.6l3.6-2.4M15.4 15.5 19 19v-2.6l-3.6-2.4" fill="currentColor" />
      <path d="M10.3 20.5 12 23l1.7-2.5h-3.4Z" fill="currentColor" />
    </svg>
  );
}

// Rumble Ring — a bold boxing glove: a rounded fist body plus a cuff band.
export function FighterIcon({ className }: GameIconProps) {
  return (
    <svg {...commonSvgProps} className={className}>
      <path
        d="M8 4.5c1-1 2.4-1 3.2-.2l.8.8c.8-.6 2-.5 2.7.2.8.8.8 2 .1 2.8 1 .1 1.8.9 1.8 1.9 0 .6-.3 1.1-.7 1.5.5.4.8 1 .8 1.6 0 1.1-.8 2-1.9 2.1v1c0 2.2-1.8 4-4 4H9c-2.2 0-4-1.8-4-4v-4c0-3 1.2-5.7 3-7.7Z"
        fill="currentColor"
      />
      <rect x="6.5" y="17.5" width="7" height="3.5" rx="1.4" fill="currentColor" opacity="0.55" />
    </svg>
  );
}

// Kickoff Clash — a soccer ball: circle outline with a simple pentagon panel
// pattern, kept minimal so it stays legible at small sizes.
export function SoccerIcon({ className }: GameIconProps) {
  return (
    <svg {...commonSvgProps} className={className}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 7.2 15.6 9.8 14.3 14 9.7 14 8.4 9.8Z"
        fill="currentColor"
      />
      <path
        d="M12 7.2V3.5M15.6 9.8l3.5-1.2M14.3 14l2.1 3M9.7 14l-2.1 3M8.4 9.8l-3.5-1.2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Turbo Dash — a simple race-car silhouette (cab + spoiler) over a checkered
// flag flash, so it reads as "racing" rather than just "car".
export function RacingIcon({ className }: GameIconProps) {
  return (
    <svg {...commonSvgProps} className={className}>
      <path
        d="M3.5 15.5 5 11c.4-1.1 1.4-1.8 2.6-1.8h8.8c1.2 0 2.2.7 2.6 1.8l1.5 4.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M3.5 15.5h17v2a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1v-2Z" fill="currentColor" />
      <path d="M7 9.2 8.3 6h7.4l1.3 3.2H7Z" fill="currentColor" opacity="0.55" />
      <circle cx="7.5" cy="18.5" r="1.6" fill="currentColor" />
      <circle cx="16.5" cy="18.5" r="1.6" fill="currentColor" />
    </svg>
  );
}

const ICONS: Record<GameId, FC<GameIconProps>> = {
  snake: SnakeIcon,
  pacman: PacmanIcon,
  invaders: InvadersIcon,
  fighter: FighterIcon,
  soccer: SoccerIcon,
  racing: RacingIcon,
};

// Single dispatcher — the cleaner call site for CabinetCard, which only has
// a `GameId` and doesn't want a switch statement of its own.
export function GameIcon({ id, className }: { id: GameId } & GameIconProps) {
  const Icon = ICONS[id];
  return <Icon className={className} />;
}
