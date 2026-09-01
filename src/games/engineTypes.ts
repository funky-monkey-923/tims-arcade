// The contract every game must satisfy: a framework- and canvas-agnostic
// "engine" (state shape + pure-ish step function, no DOM/React/Canvas
// imports) that a thin UI component drives. This is what makes each game
// independently testable, swappable, and safe to hand off to someone else
// to re-skin or extend without touching gameplay rules.
//
// Convention (see src/games/snake/engine.ts for the reference example):
//   - `engine.ts` exports `createState`, `step`, and optionally `onPointer`.
//     It must not import react, canvas, or anything from src/lib/input.js's
//     DOM-attached listeners — it only ever sees the plain data below.
//   - `render.ts` exports a `draw(ctx, state, ts)` function — all
//     CanvasRenderingContext2D calls live here, nothing else.
//   - `<Name>Game.tsx` is the only file allowed to touch React, refs, or
//     the DOM: it owns the canvas element, reads the shared `controls`
//     object once per animation frame, translates raw pointer events to
//     canvas-relative coordinates, and wires engine.step() + render.draw()
//     together inside the rAF loop.

export interface EngineInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  confirm: boolean;
  cancel: boolean;
  pointer: { x: number; y: number; active: boolean };
}

// Returned from every step() call. Both fields are optional — only set
// `score` when it actually changed this tick, and `gameOver` on the one
// tick the run ends (with the final score to record).
export interface EngineEvents {
  score?: number;
  gameOver?: number;
}

// A canvas-relative pointer interaction, already translated out of raw
// clientX/clientY by the UI layer (that translation is legitimately UI
// work — it depends on the canvas element's bounding rect).
export interface PointerAction {
  x: number;
  y: number;
  kind: "down" | "move";
}

export interface GameEngine<TState> {
  createState(width: number, height: number): TState;
  step(state: TState, input: EngineInput, dtMs: number, tsMs: number): EngineEvents;
  onPointer?(state: TState, action: PointerAction): void;
}

// Shared shape passed to every game's UI component by GameShell.
export interface GameComponentProps {
  width: number;
  height: number;
  paused: boolean;
  onScoreUpdate: (score: number) => void;
  onGameOver: (finalScore: number) => void;
}
