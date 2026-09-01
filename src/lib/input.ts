// Unified input handling: keyboard, mouse/pointer, touchscreen, and game
// controllers (Gamepad API) all normalize down to the same small action set
// so menus and games only ever have to think about actions, never raw
// KeyboardEvent.key / gamepad button indices / touch coordinates.
//
// The action vocabulary deliberately keeps two ideas separate, even where
// today's keyboard/gamepad defaults happen to share a physical button:
//   - CONFIRM / BACK: menu semantics — "pick this menu item" / "go back a
//     screen". Consumed via subscribeMenuInput() by things like useGridNav.
//   - PRIMARY_ACTION / SECONDARY_ACTION: gameplay semantics — "the game's
//     main action button" / "the game's secondary action button" (shoot,
//     punch, kick, nitro, whatever a given game wants it to mean). Consumed
//     by games via the `controls` object, translated into EngineInput.
// Enter/Space fires both CONFIRM and PRIMARY_ACTION; Escape/Backspace fires
// both BACK and SECONDARY_ACTION — same button today, but keeping the names
// distinct means a menu screen and an in-game action never have to agree on
// what "confirm" means, and a future control scheme (TV remote, a second
// gamepad face button) could map them differently without a redesign.
//
// Two ways to consume it:
//   - subscribeMenuInput(fn): edge-triggered "action pressed" events, good
//     for menu navigation (one move per key press / d-pad tap).
//   - controls: a live, mutable "held" state object read once per animation
//     frame inside a game loop (smooth continuous movement).

export type Action =
  | "MOVE_UP"
  | "MOVE_DOWN"
  | "MOVE_LEFT"
  | "MOVE_RIGHT"
  | "PRIMARY_ACTION"
  | "SECONDARY_ACTION"
  | "CONFIRM"
  | "BACK"
  | "PAUSE";

type Direction = "up" | "down" | "left" | "right";
const DIRECTION_ACTION: Record<Direction, Action> = {
  up: "MOVE_UP",
  down: "MOVE_DOWN",
  left: "MOVE_LEFT",
  right: "MOVE_RIGHT",
};

// Which `controls` field a given action drives. Kept as an explicit map
// (rather than lowercasing the action name) so the mapping is obvious at a
// glance and doesn't silently break if either naming scheme changes.
const CONTROL_FIELD: Record<Action, keyof Omit<Controls, "pointer">> = {
  MOVE_UP: "moveUp",
  MOVE_DOWN: "moveDown",
  MOVE_LEFT: "moveLeft",
  MOVE_RIGHT: "moveRight",
  PRIMARY_ACTION: "primaryAction",
  SECONDARY_ACTION: "secondaryAction",
  CONFIRM: "confirm",
  BACK: "back",
  PAUSE: "pause",
};

// A physical key/button can (and for Enter/Escape, does) map to more than
// one Action at once — see the file-level comment above.
const KEY_MAP: Record<string, Action[]> = {
  ArrowUp: ["MOVE_UP"], KeyW: ["MOVE_UP"],
  ArrowDown: ["MOVE_DOWN"], KeyS: ["MOVE_DOWN"],
  ArrowLeft: ["MOVE_LEFT"], KeyA: ["MOVE_LEFT"],
  ArrowRight: ["MOVE_RIGHT"], KeyD: ["MOVE_RIGHT"],
  Enter: ["CONFIRM", "PRIMARY_ACTION"], Space: ["CONFIRM", "PRIMARY_ACTION"],
  Escape: ["BACK", "SECONDARY_ACTION"], Backspace: ["BACK", "SECONDARY_ACTION"],
  KeyP: ["PAUSE"],
};

const GAMEPAD_BUTTON_MAP: Record<number, Action[]> = {
  12: ["MOVE_UP"],
  13: ["MOVE_DOWN"],
  14: ["MOVE_LEFT"],
  15: ["MOVE_RIGHT"],
  0: ["CONFIRM", "PRIMARY_ACTION"], // A
  1: ["BACK", "SECONDARY_ACTION"], // B
  9: ["PAUSE"], // start
};

export interface PointerState {
  x: number;
  y: number;
  active: boolean;
}

export interface Controls {
  moveUp: boolean;
  moveDown: boolean;
  moveLeft: boolean;
  moveRight: boolean;
  primaryAction: boolean;
  secondaryAction: boolean;
  confirm: boolean;
  back: boolean;
  pause: boolean;
  pointer: PointerState;
}

export const controls: Controls = {
  moveUp: false,
  moveDown: false,
  moveLeft: false,
  moveRight: false,
  primaryAction: false,
  secondaryAction: false,
  confirm: false,
  back: false,
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
  controls[CONTROL_FIELD[action]] = true;
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
  controls[CONTROL_FIELD[action]] = stillHeld;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
}

let attached = false;
let attachCount = 0;
let realCleanup: (() => void) | null = null;
let gamepadRafId: number | null = null;
const gamepadWasDown: Record<string, boolean> = {};

export function attachGlobalInput(): () => void {
  attachCount += 1;
  // Refcounted so that if this is ever called from more than one mounted
  // component, the first one to unmount can't rip out input handling for
  // everyone else still mounted — only the last active caller's cleanup
  // actually tears the listeners down.
  let released = false;
  const releaseOne = () => {
    if (released) return;
    released = true;
    attachCount -= 1;
    if (attachCount <= 0) {
      realCleanup?.();
      realCleanup = null;
      attached = false;
    }
  };
  if (attached) return releaseOne;
  attached = true;

  const onKeyDown = (e: KeyboardEvent) => {
    // Don't hijack typing: ProfilePicker's name field (and any future text
    // input) needs Space/Enter/Backspace/arrow keys to behave normally, not
    // trigger game actions or get preventDefault'd out from under the user.
    if (isTypingTarget(e.target)) return;
    const actions = KEY_MAP[e.code];
    if (!actions) return;
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Backspace", "Escape"].includes(e.code)) e.preventDefault();
    for (const action of actions) press(action, "kb");
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (isTypingTarget(e.target)) return;
    const actions = KEY_MAP[e.code];
    if (!actions) return;
    for (const action of actions) release(action, "kb");
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
        const actions = GAMEPAD_BUTTON_MAP[i];
        if (!actions) return;
        const key = `gp${pad.index}:${i}`;
        const isDown = btn.pressed || btn.value > 0.5;
        if (isDown && !gamepadWasDown[key]) {
          gamepadWasDown[key] = true;
          for (const action of actions) press(action, `gp${pad.index}`);
        } else if (!isDown && gamepadWasDown[key]) {
          gamepadWasDown[key] = false;
          for (const action of actions) release(action, `gp${pad.index}`);
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
          press(DIRECTION_ACTION[dir], `gp${pad.index}axis`);
        } else if (!axisState[dir] && gamepadWasDown[key]) {
          gamepadWasDown[key] = false;
          release(DIRECTION_ACTION[dir], `gp${pad.index}axis`);
        }
      }
    }
    gamepadRafId = requestAnimationFrame(pollGamepads);
  };
  gamepadRafId = requestAnimationFrame(pollGamepads);

  realCleanup = () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointerup", onPointerUp);
    if (gamepadRafId) cancelAnimationFrame(gamepadRafId);
  };
  return releaseOne;
}

// Touch on-screen buttons call these directly. Touch controls only ever
// appear during actual gameplay (see TouchControls.tsx), so in practice
// they only ever drive MOVE_*/PRIMARY_ACTION/SECONDARY_ACTION — but any
// Action works here since the touch button just picks whichever it wants.
export function touchPress(action: Action): void {
  press(action, "touch");
}
export function touchRelease(action: Action): void {
  release(action, "touch");
}

export function isTouchDevice(): boolean {
  return window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
}
