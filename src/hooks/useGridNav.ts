import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { subscribeMenuInput } from "../lib/input";
import { engine } from "../lib/audio";

export interface UseGridNavOptions {
  count: number;
  columns: number | (() => number);
  onConfirm?: (index: number) => void;
  onCancel?: () => void;
  enabled?: boolean;
}

// Grid keyboard/gamepad navigation for the cabinet menu, profile picker, etc.
// `columns` can be a function so callers can respond to responsive layouts.
export function useGridNav({ count, columns, onConfirm, onCancel, enabled = true }: UseGridNavOptions): [number, Dispatch<SetStateAction<number>>] {
  const [rawFocused, setFocused] = useState(0);
  // Clamped for rendering/lookups (e.g. if the grid shrinks out from under
  // the current index) without needing a "setState during an effect just to
  // correct another piece of state" round-trip — derived straight from
  // render inputs instead, per React's own guidance on this exact pattern.
  const focused = count > 0 ? Math.min(rawFocused, count - 1) : rawFocused;

  const countRef = useRef(count);
  const focusedRef = useRef(focused);
  useEffect(() => {
    countRef.current = count;
    focusedRef.current = focused;
  }, [count, focused]);

  useEffect(() => {
    if (!enabled) return undefined;
    return subscribeMenuInput((action) => {
      const c = typeof columns === "function" ? columns() : columns;
      setFocused((f) => {
        let next = f;
        if (action === "MOVE_RIGHT") next = Math.min(countRef.current - 1, f + 1);
        else if (action === "MOVE_LEFT") next = Math.max(0, f - 1);
        else if (action === "MOVE_DOWN") next = Math.min(countRef.current - 1, f + c);
        else if (action === "MOVE_UP") next = Math.max(0, f - c);
        if (next !== f) engine.playSfx("move");
        return next;
      });
      // Reads the ref (updated by the effect above, kept in sync every
      // render) rather than closing over `focused` directly, so this
      // subscription doesn't need to be torn down and rebuilt on every
      // single focus move — only when the grid's shape or callbacks change.
      if (action === "CONFIRM") onConfirm?.(focusedRef.current);
      if (action === "BACK") onCancel?.();
    });
  }, [enabled, columns, onConfirm, onCancel]);

  return [focused, setFocused];
}
