import { useState } from "react";
import { touchPress, touchRelease, isTouchDevice } from "../lib/input";
import { engine } from "../lib/audio";

function TouchButton({ label, action, className, shape = "round" }) {
  const [active, setActive] = useState(false);
  const down = (e) => {
    e.preventDefault();
    setActive(true);
    touchPress(action);
    engine.unlock();
  };
  const up = (e) => {
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

// On-screen d-pad + action button, shown only for touch/coarse-pointer
// devices so mouse/keyboard/gamepad users never see it.
export default function TouchControls({ showDpad = true, showConfirm = true, showCancel = false }) {
  const [visible] = useState(() => isTouchDevice());
  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex items-end justify-between px-6 pb-6 pointer-events-none sm:px-10 sm:pb-10">
      {showDpad ? (
        <div className="pointer-events-auto grid grid-cols-3 grid-rows-3 gap-1 w-36 h-36">
          <div />
          <TouchButton label="▲" action="up" className="w-11 h-11" />
          <div />
          <TouchButton label="◀" action="left" className="w-11 h-11" />
          <div />
          <TouchButton label="▶" action="right" className="w-11 h-11" />
          <div />
          <TouchButton label="▼" action="down" className="w-11 h-11" />
          <div />
        </div>
      ) : (
        <div />
      )}
      <div className="pointer-events-auto flex gap-4 items-center">
        {showCancel && <TouchButton label="✕" action="cancel" className="w-16 h-16 text-xl" />}
        {showConfirm && (
          <TouchButton label="A" action="confirm" className="w-20 h-20 text-2xl bg-coral/40! border-coral" />
        )}
      </div>
    </div>
  );
}
