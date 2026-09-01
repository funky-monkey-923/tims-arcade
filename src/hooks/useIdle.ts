import { useEffect, useState } from "react";

// True once the user hasn't touched mouse/keyboard/touch for `timeoutMs`.
// Used for the game-menu's "attract mode" ticker — real arcade cabinets
// loop a demo reel when nobody's playing; this is the web equivalent,
// cycling through recent scores instead of gameplay footage.
export function useIdle(timeoutMs = 15000): boolean {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      setIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), timeoutMs);
    };
    const events: (keyof WindowEventMap)[] = ["pointermove", "pointerdown", "keydown", "touchstart", "wheel"];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [timeoutMs]);

  return idle;
}
