// Pure game logic for Wiggle Worm (Snake) — no React, no canvas, no DOM.
// This is the "engine" half of the engine/UI split: everything here is
// plain data + functions, so it can be unit-tested or reused with a
// different renderer without touching gameplay rules. See
// src/games/engineTypes.ts for the shared contract, and render.ts /
// SnakeGame.tsx for the other two-thirds of the split.

import type { EngineInput, EngineEvents, PointerAction } from "../engineTypes";

export const GRID = 14; // easy mode: fairly large cells, forgiving hitbox
const TICK_MS = 170; // slow, kid-friendly pace

export interface Vec {
  x: number;
  y: number;
}

export interface SnakeState {
  snake: Vec[];
  dir: Vec;
  nextDir: Vec;
  food: Vec;
  score: number;
  dead: boolean;
  lastTick: number;
  canvasWidth: number; // kept for pointer-to-grid-direction math in onPointer
}

function randCell(exclude: Vec[]): Vec {
  let cell: Vec;
  do {
    cell = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) };
  } while (exclude.some((s) => s.x === cell.x && s.y === cell.y));
  return cell;
}

export function createState(width: number): SnakeState {
  const mid = Math.floor(GRID / 2);
  const snake: Vec[] = [
    { x: mid - 1, y: mid },
    { x: mid - 2, y: mid },
    { x: mid - 3, y: mid },
  ];
  return {
    snake,
    dir: { x: 1, y: 0 },
    nextDir: { x: 1, y: 0 },
    food: randCell(snake),
    score: 0,
    dead: false,
    lastTick: 0,
    canvasWidth: width,
  };
}

function setDir(state: SnakeState, next: Vec): void {
  if (next.x === -state.dir.x && next.y === -state.dir.y) return; // no instant reverse
  state.nextDir = next;
}

export function onPointer(state: SnakeState, action: PointerAction): void {
  if (action.kind !== "down") return;
  const cell = state.canvasWidth / GRID;
  const head = state.snake[0];
  const dx = action.x - (head.x + 0.5) * cell;
  const dy = action.y - (head.y + 0.5) * cell;
  if (Math.abs(dx) > Math.abs(dy)) {
    setDir(state, dx > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 });
  } else {
    setDir(state, dy > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 });
  }
}

export function step(state: SnakeState, input: EngineInput, _dtMs: number, tsMs: number): EngineEvents {
  if (state.dead) return {};

  // read held keyboard/gamepad/touch direction each frame
  if (input.up) setDir(state, { x: 0, y: -1 });
  else if (input.down) setDir(state, { x: 0, y: 1 });
  else if (input.left) setDir(state, { x: -1, y: 0 });
  else if (input.right) setDir(state, { x: 1, y: 0 });

  if (tsMs - state.lastTick < TICK_MS) return {};
  state.lastTick = tsMs;

  state.dir = state.nextDir;
  const head: Vec = { x: state.snake[0].x + state.dir.x, y: state.snake[0].y + state.dir.y };

  const hitWall = head.x < 0 || head.y < 0 || head.x >= GRID || head.y >= GRID;
  const hitSelf = state.snake.some((s) => s.x === head.x && s.y === head.y);
  if (hitWall || hitSelf) {
    state.dead = true;
    return { gameOver: state.score };
  }

  state.snake.unshift(head);
  if (head.x === state.food.x && head.y === state.food.y) {
    state.score += 10;
    state.food = randCell(state.snake);
    return { score: state.score };
  }
  state.snake.pop();
  return {};
}
