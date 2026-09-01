// A small evolving character for the cross-game Mascot Rank system
// (`getMascotProgress` in lib/storage.ts). Before this component existed,
// "mascot" was a level number and an XP bar with no actual mascot — this is
// the fix: a simple flat-geometric SVG "spark buddy" that gains a visible
// accessory at each of the 6 title tiers (New Arcader -> Arcade Legend), so
// climbing the rank ladder has something to actually look at, not just a
// number going up. Pure inline SVG, no external asset files — keeps this
// consistent with lib/gameIcons.tsx's approach and needs no new asset-pack
// curation.
//
// Tier art is deliberately additive/cumulative (each tier keeps the
// previous tier's features and adds one more) so the character reads as
// "the same buddy, growing up" rather than 6 unrelated redesigns.

interface MascotAvatarProps {
  tierIndex: number; // 0-5, from MascotProgress.tierIndex
  size?: number;
  className?: string;
}

export default function MascotAvatar({ tierIndex, size = 48, className }: MascotAvatarProps) {
  const cap = tierIndex >= 1; // Regular
  const shades = tierIndex >= 2; // Arcade Enthusiast
  const medallion = tierIndex >= 3; // High Roller
  const cape = tierIndex >= 4; // Arcade Master
  const crownAndSparkle = tierIndex >= 5; // Arcade Legend

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={`Mascot, tier ${tierIndex + 1}`}
    >
      {/* Cape (drawn first so it sits behind the body) */}
      {cape && <path d="M18 30 Q10 46 16 58 L32 50 L48 58 Q54 46 46 30 Z" fill="var(--color-coral)" opacity="0.85" />}

      {/* Legend sparkle aura */}
      {crownAndSparkle && (
        <g stroke="var(--color-sun)" strokeWidth="2" strokeLinecap="round">
          <path d="M8 18 L11 24 L8 30" fill="none" />
          <path d="M56 18 L53 24 L56 30" fill="none" />
          <path d="M32 4 L32 10" fill="none" />
        </g>
      )}

      {/* Body — a rounded spark/blob, colored by rank progress rather than a
          fixed hue, so it visually reads as "leveling up" alongside the
          numbers. */}
      <circle cx="32" cy="34" r="20" fill="var(--color-teal)" />
      <circle cx="32" cy="34" r="20" fill="none" stroke="var(--color-ink)" strokeWidth="2" opacity="0.15" />

      {/* Eyes */}
      {!shades ? (
        <>
          <circle cx="25" cy="32" r="2.6" fill="var(--color-ink)" />
          <circle cx="39" cy="32" r="2.6" fill="var(--color-ink)" />
        </>
      ) : (
        // Sunglasses (Arcade Enthusiast+) replace plain dot eyes.
        <g>
          <rect x="20" y="29" width="10" height="6" rx="3" fill="var(--color-ink)" />
          <rect x="34" y="29" width="10" height="6" rx="3" fill="var(--color-ink)" />
          <line x1="30" y1="31" x2="34" y2="31" stroke="var(--color-ink)" strokeWidth="2" />
        </g>
      )}

      {/* Smile */}
      <path d="M24 40 Q32 46 40 40" stroke="var(--color-ink)" strokeWidth="2.4" fill="none" strokeLinecap="round" />

      {/* Cap (Regular+) */}
      {cap && !crownAndSparkle && (
        <path d="M16 22 Q32 8 48 22 L45 24 Q32 14 19 24 Z" fill="var(--color-coral)" />
      )}

      {/* Medallion (High Roller+) */}
      {medallion && <circle cx="32" cy="46" r="4.5" fill="var(--color-sun)" stroke="var(--color-ink)" strokeWidth="1.2" />}

      {/* Crown (Arcade Legend) replaces the cap entirely — the top-tier look. */}
      {crownAndSparkle && (
        <path
          d="M17 23 L22 14 L28 21 L32 12 L36 21 L42 14 L47 23 Z"
          fill="var(--color-sun)"
          stroke="var(--color-ink)"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
