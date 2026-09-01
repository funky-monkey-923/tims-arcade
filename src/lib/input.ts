// Unified input handling: keyboard, mouse/pointer, touchscreen, and game
// controllers (Gamepad API) all normalize down to the same small action set
// so menus and games only ever have to think about "up/down/left/right/
// confirm/cancel/pause", plus a raw pointer position for mouse/touch aiming.
//
// Two ways to consume it:
//   - subscribeMenuInput(fn): edge-triggered "action pressed" events, good
//     for menu navigation (one move per key press / d-pad tap).
//   - controls: a live, mutable "held" state object read once per animation
//     frame inside a game loop (smooth continuous movement).

export type Action = "up" | "down" | "left" | "right" | "confirm" | "cancel" | "pause";
type Direction = "up" | "down" | "left" | "right";

const KEY_MAP: Record<string, Action> = {
  ArrowUp: "up", KeyW: "up",
  ArrowDown: "down", KeyS: "down",
  ArrowLeft: "left", KeyA: "left",
  ArrowRight: "right", KeyD: "right",
  Enter: "confirm", Space: "confirm",
  Escape: "cancel", Backspace: "cancel",
  KeyP: "pause",
};

const GAMEPAD_BUTTON_MAP: Record<number, Action> = {
  12: "up",
  13: "down",
  14: "left",
  15: "right",
  0: "confirm", // A
  1: "cancel", // B
  9: "pause", // start
};

export interface PointerState {
  x: number;
  y: number;
  active: boolean;
}

export interface Controls {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  confirm: boolean;
  cancel: boolean;
  pause: boolean;
  pointer: PointerState;
}

export const controls: Controls = {
  up: false,
  down: false,
  left: false,
  right: false,
  confirm: false,
  cancel: false,
  pause: false,
  pointer: { x: 0, y: 0, active: false },
};

type Listener = (action: Action) => void;
const listeners = new Set<Listener>();
function emit(action: Action): void {
  listeners.forEach((fn) => fn(action));
}

export function subscribeMenuInput(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const heldEdge: Record<string, boolean> = {}; // tracks which actions are already "down" for edge detection across sources

function press(action: Action, source: string): void {
  controls[action] = true;
  const key = `${source}:${action}`;
  if (!heldEdge[key]) {
    heldEdge[key] = true;
    emit(action);
  }
}
function release(action: Action, source: string): void {
  const key = `${source}:${action}`;
  heldEdge[key] = false;
  // only clear held state if no other source is holding it
  const stillHeld = Object.keys(heldEdge).some((k) => k.endsWith(`:${action}`) && heldEdge[k]);
  controls[action] = stillHeld;
}

let attached = false;
let gamepadRafId: number | null = null;
const gamepadWasDown: Record<string, boolean> = {};

export function attachGlobalInput(): () => void {
  if (attached) return () => {};
  attached = true;

  const onKeyDown = (e: KeyboardEvent) => {
    const action = KEY_MAP[e.code];
    if (!action) return;
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
    press(action, "kb");
  };
  const onKeyUp = (e: KeyboardEvent) => {
    const action = KEY_MAP[e.code];
    if (!action) return;
    release(action, "kb");
  };
  const onPointerMove = (e: PointerEvent) => {
    controls.pointer.x = e.clientX;
    controls.pointer.y = e.clientY;
  };
  const onPointerDown = (e: PointerEvent) => {
    controls.pointer.active = true;
    controls.pointer.x = e.clientX;
    controls.pointer.y = e.clientY;
  };
  const onPointerUp = () => {
    controls.pointer.active = false;
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointerup", onPointerUp);

  const pollGamepads = () => {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad) continue;
      // d-pad / face buttons
      pad.buttons.forEach((btn, i) => {
        const action = GAMEPAD_BUTTON_MAP[i];
        if (!action) return;
        const key = `gp${pad.index}:${i}`;
        const isDown = btn.pressed || btn.value > 0.5;
        if (isDown && !gamepadWasDown[key]) {
          gamepadWasDown[key] = true;
          press(action, `gp${pad.index}`);
        } else if (!isDown && gamepadWasDown[key]) {
          gamepadWasDown[key] = false;
          release(action, `gp${pad.index}`);
        }
      });
      // left stick as analog d-pad
      const [lx, ly] = pad.axes;
      const threshold = 0.5;
      const axisState: Record<Direction, boolean> = {
        left: lx < -threshold,
        right: lx > threshold,
        up: ly < -threshold,
        down: ly > threshold,
      };
      for (const dir of ["left", "right", "up", "down"] as Direction[]) {
        const key = `gp${pad.index}:axis:${dir}`;
        if (axisState[dir] && !gamepadWasDown[key]) {
          gamepadWasDown[key] = true;
          press(dir, `gp${pad.index}axis`);
        } else if (!axisState[dir] && gamepadWasDown[key]) {
          gamepadWasDown[key] = false;
          release(dir, `gp${pad.index}axis`);
        }
      }
    }
    gamepadRafId = requestAnimationFrame(pollGamepads);
  };
  gamepadRafId = requestAnimationFrame(pollGamepads);

  return () => {
    attached = false;
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointerup", onPointerUp);
    if (gamepadRafId) cancelAnimationFrame(gamepadRafId);
  };
}

// Touch on-screen buttons call these directly.
export function touchPress(action: Action): void {
  press(action, "touch");
}
export function touchRelease(action: Action): void {
  release(action, "touch");
}

export function isTouchDevice(): boolean {
  return window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
}
