import { useEffect, useRef, useState } from "react";
import { subscribeMenuInput } from "../lib/input";
import { engine } from "../lib/audio";

// Grid keyboard/gamepad navigation for the cabinet menu, profile picker, etc.
// `columns` can be a function so callers can respond to responsive layouts.
export function useGridNav({ count, columns, onConfirm, onCancel, enabled = true }) {
  const [focused, setFocused] = useState(0);
  const countRef = useRef(count);
  countRef.current = count;

  useEffect(() => {
    if (focused >= count && count > 0) setFocused(count - 1);
  }, [count, focused]);

  useEffect(() => {
    if (!enabled) return undefined;
    return subscribeMenuInput((action) => {
      const c = typeof columns === "function" ? columns() : columns;
      setFocused((f) => {
        let next = f;
        if (action === "right") next = Math.min(countRef.current - 1, f + 1);
        else if (action === "left") next = Math.max(0, f - 1);
        else if (action === "down") next = Math.min(countRef.current - 1, f + c);
        else if (action === "up") next = Math.max(0, f - c);
        if (next !== f) engine.playSfx("move");
        return next;
      });
      if (action === "confirm") onConfirm?.(focused);
      if (action === "cancel") onCancel?.();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, columns, onConfirm, onCancel, focused]);

  return [focused, setFocused];
}
