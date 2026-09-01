import { useEffect, useRef, useState } from "react";
import { useArcade } from "../context/ArcadeContext";

// Animates a displayed number from its previous value up (or down) to
// `target` over `durationMs`, instead of just snapping — cheap way to make
// a scoreboard feel alive. Skips the animation entirely (jumps straight to
// `target`) when the user has reduced motion on, consistent with every
// other animated effect in the app respecting that setting.
export function useCountUp(target: number, durationMs = 700): number {
  const { settings } = useArcade();
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (settings.reducedMotion) {
      setValue(target);
      fromRef.current = target;
      return undefined;
    }
    const from = fromRef.current;
    if (from === target) return undefined;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // ease-out-cubic — quick start, gentle settle
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, durationMs, settings.reducedMotion]);

  return value;
}
