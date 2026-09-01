// A module-level mirror of ArcadeSettings.reducedMotion, following the same
// idiom as the `controls` singleton in input.ts and for the same reason: the
// value is read inside requestAnimationFrame loops and, crucially, from
// render.ts modules that are plain functions rather than React components.
// Those files can't call useSettings(), and prop-drilling a boolean through
// every draw() signature and every particle emitter call site would be a lot
// of churn for one flag that is effectively global state anyway.
//
// App.tsx owns the wiring: it mirrors `settings.reducedMotion` into this
// singleton via setReducedMotion() in the same effect that toggles the
// `.reduce-motion` class on <html>, so the CSS-level and canvas-level
// accommodations can never drift apart.
//
// Note this is deliberately *not* a subscribe/notify store — consumers read
// it fresh every frame, so a stale-value problem can't arise and there's
// nothing worth the extra machinery.

export interface MotionPrefs {
  reduced: boolean;
}

// Defaults to false rather than reading matchMedia here: storage.ts already
// seeds ArcadeSettings.reducedMotion from the OS-level prefers-reduced-motion
// query on first run, and App.tsx pushes that value in on mount. Duplicating
// the media-query read would give us two sources of truth for one setting.
export const motion: MotionPrefs = {
  reduced: false,
};

export function setReducedMotion(v: boolean): void {
  motion.reduced = v;
}

// Convenience for the common "amplitude of a purely decorative wobble"
// case — screen shake, camera punch, sprite jitter. These effects have no
// informational content of their own (whatever they're reacting to is always
// also conveyed by a sound, a number, or a color change), so unlike particle
// counts they can safely go to exactly zero rather than merely being damped.
export function scaleForMotion(value: number): number {
  return motion.reduced ? 0 : value;
}
