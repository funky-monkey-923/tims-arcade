import { useState, type PointerEvent } from "react";
import { touchPress, touchRelease, isTouchDevice, type Action } from "../lib/input";
import { engine } from "../lib/audio";

interface TouchButtonProps {
  label: string;
  action: Action;
  className?: string;
  shape?: "round" | "square";
}

function TouchButton({ label, action, className, shape = "round" }: TouchButtonProps) {
  const [active, setActive] = useState(false);
  const down = (e: PointerEvent) => {
    e.preventDefault();
    setActive(true);
    touchPress(action);
    engine.unlock();
  };
  const up = (e: PointerEvent) => {
    e.preventDefault();
    setActive(false);
    touchRelease(action);
  };
  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={down}
      onPointerUp={up}
      onPointerLeave={up}
      onPointerCancel={up}
      className={`select-none flex items-center justify-center font-display font-bold text-cloud/90 border-2 border-white/20 backdrop-blur-sm transition-transform active:scale-90 ${
        shape === "round" ? "rounded-full" : "rounded-xl"
      } ${active ? "bg-white/25" : "bg-white/10"} ${className}`}
      style={{ touchAction: "none" }}
    >
      {label}
    </button>
  );
}

interface TouchControlsProps {
  showDpad?: boolean;
  showPrimary?: boolean;
  showSecondary?: boolean;
}

// On-screen d-pad + action button, shown only for touch/coarse-pointer
// devices so mouse/keyboard/gamepad users never see it. Only ever rendered
// during actual gameplay (see GameShell), so its buttons drive
// PRIMARY_ACTION/SECONDARY_ACTION — the in-game action semantics — not the
// menu CONFIRM/BACK actions.
export default function TouchControls({ showDpad = true, showPrimary = true, showSecondary = false }: TouchControlsProps) {
  const [visible] = useState(() => isTouchDevice());
  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex items-end justify-between px-6 pb-6 pointer-events-none sm:px-10 sm:pb-10">
      {showDpad ? (
        <div className="pointer-events-auto grid grid-cols-3 grid-rows-3 gap-1 w-36 h-36">
          <div />
          <TouchButton label="▲" action="MOVE_UP" className="w-11 h-11" />
          <div />
          <TouchButton label="◀" action="MOVE_LEFT" className="w-11 h-11" />
          <div />
          <TouchButton label="▶" action="MOVE_RIGHT" className="w-11 h-11" />
          <div />
          <TouchButton label="▼" action="MOVE_DOWN" className="w-11 h-11" />
          <div />
        </div>
      ) : (
        <div />
      )}
      <div className="pointer-events-auto flex gap-4 items-center">
        {showSecondary && <TouchButton label="✕" action="SECONDARY_ACTION" className="w-16 h-16 text-xl" />}
        {showPrimary && (
          <TouchButton label="A" action="PRIMARY_ACTION" className="w-20 h-20 text-2xl bg-coral/40! border-coral" />
        )}
      </div>
    </div>
  );
}
