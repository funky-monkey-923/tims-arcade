// Pure game logic for Wiggle Worm (Snake) — no React, no canvas, no DOM.
// This is the "engine" half of the engine/UI split: everything here is
// plain data + functions, so it can be unit-tested or reused with a
// different renderer without touching gameplay rules. See
// src/games/engineTypes.ts for the shared contract, and render.ts /
// SnakeGame.tsx for the other two-thirds of the split.

import type { EngineInput, EngineEvents, PointerAction } from "../engineTypes";

export const GRID = 14; // easy mode: fairly large cells, forgiving hitbox

// --- Speed progression -----------------------------------------------------
// TICK_MS is no longer one fixed constant for the whole run: the effective
// tick interval shrinks in small, readable steps as score climbs, floored so
// play never becomes unplayably fast for a young player.
const TICK_MS_BASE = 170; // slow, kid-friendly starting pace
const TICK_MS_MIN = 100; // floor — never ramp faster than this
const SPEED_RAMP_SCORE_STEP = 100; // every this many points of score...
const SPEED_RAMP_MS_PER_STEP = 8; // ...shave this many ms off the tick interval

// --- Wave progression -------------------------------------------------------
// A "wave" is a milestone counted in foods eaten (of any kind), not score,
// so shrink food (which is worth less) doesn't skew pacing. It drives both
// the obstacle layout (see wallsForWave) and, indirectly via score, the
// speed ramp above.
const FOOD_PER_WAVE = 5;

// --- Food model --------------------------------------------------------------
export type FoodKind = "normal" | "golden" | "shrink";

export interface Food {
  x: number;
  y: number;
  kind: FoodKind;
  expiresAt?: number; // golden only: tsMs after which it respawns unfetched
}

const FOOD_NORMAL_SCORE = 10; // unchanged from the original single-food-type value
const FOOD_GOLDEN_SCORE = 30;
const FOOD_SHRINK_SCORE = 5; // still a reward, just a smaller one

const GOLDEN_SPAWN_CHANCE = 0.15; // chance a freshly-spawned food rolls golden
const SHRINK_SPAWN_CHANCE = 0.2; // chance it rolls shrink instead (if eligible)
const GOLDEN_LIFETIME_MS = 6000; // despawns (respawns as a fresh food) if not eaten in time
const SHRINK_MIN_SNAKE_LENGTH = 4; // don't offer shrink food until it's actually useful
const MIN_SNAKE_LENGTH = 2; // never let a shrink effect take the snake below this

// --- Pointer/touch smoothing --------------------------------------------------
// A "down" sample always registers a turn immediately (a tap should feel
// instant). A "move" sample (continuous drag) requires the finger to have
// travelled this fraction of a cell away from the head's on-screen position
// before it counts as an intentional turn, so tiny jitter while holding a
// finger down doesn't spam direction flips.
const DRAG_TURN_THRESHOLD_CELLS = 0.35;

export interface Vec {
  x: number;
  y: number;
}

export interface SnakeState {
  snake: Vec[];
  dir: Vec;
  nextDir: Vec;
  food: Food;
  score: number;
  dead: boolean;
  lastTick: number;
  canvasWidth: number; // kept for pointer-to-grid-direction math in onPointer
  wave: number;
  walls: Vec[];
  portals: [Vec, Vec] | null;
  foodEatenCount: number;
}

function randCell(exclude: Vec[]): Vec {
  let cell: Vec;
  let attempts = 0;
  // Bounded retry: on a nearly-full board this could otherwise spin forever.
  do {
    cell = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) };
    attempts += 1;
  } while (exclude.some((s) => s.x === cell.x && s.y === cell.y) && attempts < 500);
  return cell;
}

// --- Hand-authored obstacle layouts ------------------------------------------
// Layout 0 is deliberately empty so a brand-new player's first wave is never
// ambushed by obstacles. Layouts then cycle as `wave` climbs (wallsForWave).
// All layouts are hand-checked to avoid the snake's spawn cells (mid-1..mid-3, mid).

function cornersLayout(): Vec[] {
  const size = 2;
  const inset = 2;
  const starts = [
    { x: inset, y: inset },
    { x: GRID - inset - size, y: inset },
    { x: inset, y: GRID - inset - size },
    { x: GRID - inset - size, y: GRID - inset - size },
  ];
  const cells: Vec[] = [];
  for (const start of starts) {
    for (let dx = 0; dx < size; dx++) {
      for (let dy = 0; dy < size; dy++) {
        cells.push({ x: start.x + dx, y: start.y + dy });
      }
    }
  }
  return cells;
}

function crossLayout(): Vec[] {
  const mid = Math.floor(GRID / 2);
  const arms = [1, 2, 3, GRID - 4, GRID - 3, GRID - 2]; // two short arms per axis, gap in the middle
  const cells: Vec[] = [];
  for (const x of arms) cells.push({ x, y: mid });
  for (const y of arms) cells.push({ x: mid, y });
  return cells;
}

const RING_INSET = 2;

function ringLayout(): Vec[] {
  const lo = RING_INSET;
  const hi = GRID - 1 - RING_INSET;
  const mid = Math.floor(GRID / 2);
  const cells: Vec[] = [];
  // top/bottom edges, with a gap at the midpoint of each
  for (let x = lo; x <= hi; x++) {
    if (x === mid) continue;
    cells.push({ x, y: lo });
    cells.push({ x, y: hi });
  }
  // left/right edges (corners already added above), with a gap at the midpoint
  for (let y = lo + 1; y <= hi - 1; y++) {
    if (y === mid) continue;
    cells.push({ x: lo, y });
    cells.push({ x: hi, y });
  }
  return cells;
}

const WALL_LAYOUTS: Vec[][] = [[], cornersLayout(), crossLayout(), ringLayout()];
const RING_LAYOUT_INDEX = 3; // the layout whose side gaps double as a portal pair

function wallsForWave(wave: number): Vec[] {
  return WALL_LAYOUTS[(wave - 1) % WALL_LAYOUTS.length];
}

// The ring layout has a passable gap at the mid-point of its left and right
// walls; wire those two gaps up as a linked portal pair for that wave only,
// so hitting the arena edge there teleports across instead of just being a
// plain opening. Every other layout has no portals — a deliberately small
// blast radius for a stretch-goal mechanic.
function portalsForWave(wave: number): [Vec, Vec] | null {
  const layoutIndex = (wave - 1) % WALL_LAYOUTS.length;
  if (layoutIndex !== RING_LAYOUT_INDEX) return null;
  const mid = Math.floor(GRID / 2);
  return [
    { x: RING_INSET, y: mid },
    { x: GRID - 1 - RING_INSET, y: mid },
  ];
}

function pickFoodKind(snakeLength: number): FoodKind {
  const roll = Math.random();
  if (roll < GOLDEN_SPAWN_CHANCE) return "golden";
  if (snakeLength >= SHRINK_MIN_SNAKE_LENGTH && roll < GOLDEN_SPAWN_CHANCE + SHRINK_SPAWN_CHANCE) return "shrink";
  return "normal";
}

function spawnFood(state: SnakeState, tsMs: number): Food {
  const exclude: Vec[] = [...state.snake, ...state.walls];
  if (state.portals) exclude.push(state.portals[0], state.portals[1]);
  const cell = randCell(exclude);
  const kind = pickFoodKind(state.snake.length);
  return {
    x: cell.x,
    y: cell.y,
    kind,
    expiresAt: kind === "golden" ? tsMs + GOLDEN_LIFETIME_MS : undefined,
  };
}

function tickIntervalFor(score: number): number {
  const steps = Math.floor(score / SPEED_RAMP_SCORE_STEP);
  return Math.max(TICK_MS_MIN, TICK_MS_BASE - steps * SPEED_RAMP_MS_PER_STEP);
}

export function createState(width: number): SnakeState {
  const mid = Math.floor(GRID / 2);
  const snake: Vec[] = [
    { x: mid - 1, y: mid },
    { x: mid - 2, y: mid },
    { x: mid - 3, y: mid },
  ];
  const wave = 1;
  const state: SnakeState = {
    snake,
    dir: { x: 1, y: 0 },
    nextDir: { x: 1, y: 0 },
    food: { x: 0, y: 0, kind: "normal" }, // placeholder, replaced immediately below
    score: 0,
    dead: false,
    lastTick: 0,
    canvasWidth: width,
    wave,
    walls: wallsForWave(wave),
    portals: portalsForWave(wave),
    foodEatenCount: 0,
  };
  state.food = spawnFood(state, 0);
  return state;
}

function setDir(state: SnakeState, next: Vec): void {
  if (next.x === -state.dir.x && next.y === -state.dir.y) return; // no instant reverse
  state.nextDir = next;
}

function applyPointerDirection(state: SnakeState, dx: number, dy: number): void {
  if (Math.abs(dx) > Math.abs(dy)) {
    setDir(state, dx > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 });
  } else {
    setDir(state, dy > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 });
  }
}

export function onPointer(state: SnakeState, action: PointerAction): void {
  const cell = state.canvasWidth / GRID;
  const head = state.snake[0];
  const dx = action.x - (head.x + 0.5) * cell;
  const dy = action.y - (head.y + 0.5) * cell;

  if (action.kind === "down") {
    // A tap/initial press always registers a turn immediately.
    applyPointerDirection(state, dx, dy);
    return;
  }

  // A continuous drag sample only counts once the finger has moved far
  // enough from the head that it reads as an intentional turn, not jitter.
  const threshold = cell * DRAG_TURN_THRESHOLD_CELLS;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return;
  applyPointerDirection(state, dx, dy);
}

export function step(state: SnakeState, input: EngineInput, _dtMs: number, tsMs: number): EngineEvents {
  if (state.dead) return {};

  // read held keyboard/gamepad/touch direction each frame
  if (input.moveUp) setDir(state, { x: 0, y: -1 });
  else if (input.moveDown) setDir(state, { x: 0, y: 1 });
  else if (input.moveLeft) setDir(state, { x: -1, y: 0 });
  else if (input.moveRight) setDir(state, { x: 1, y: 0 });

  // A golden food that isn't eaten in time respawns as a fresh (re-rolled)
  // food rather than lingering on the board forever.
  if (state.food.kind === "golden" && state.food.expiresAt !== undefined && tsMs > state.food.expiresAt) {
    state.food = spawnFood(state, tsMs);
  }

  const tickInterval = tickIntervalFor(state.score);
  if (tsMs - state.lastTick < tickInterval) return {};
  state.lastTick = tsMs;

  state.dir = state.nextDir;
  let head: Vec = { x: state.snake[0].x + state.dir.x, y: state.snake[0].y + state.dir.y };

  // Portals teleport the head to the linked cell (preserving direction of
  // travel) before any collision checks run against the new position.
  if (state.portals) {
    const [a, b] = state.portals;
    if (head.x === a.x && head.y === a.y) head = { x: b.x, y: b.y };
    else if (head.x === b.x && head.y === b.y) head = { x: a.x, y: a.y };
  }

  const hitBoundary = head.x < 0 || head.y < 0 || head.x >= GRID || head.y >= GRID;
  const hitWallTile = state.walls.some((w) => w.x === head.x && w.y === head.y);
  const willEatFood = head.x === state.food.x && head.y === state.food.y;
  // The tail segment vacates this same tick unless the snake is about to
  // grow in place (normal/golden food), in which case it stays put — so
  // moving into that cell is legal standard snake behavior, not a
  // self-collision. Shrink food still vacates the tail (it shrinks, it
  // doesn't grow), so it uses the same exclusion as a normal move.
  const staysGrown = willEatFood && state.food.kind !== "shrink";
  const bodyToCheck = staysGrown ? state.snake : state.snake.slice(0, -1);
  const hitSelf = bodyToCheck.some((s) => s.x === head.x && s.y === head.y);
  if (hitBoundary || hitWallTile || hitSelf) {
    state.dead = true;
    return { gameOver: state.score };
  }

  state.snake.unshift(head);

  if (willEatFood) {
    const kind = state.food.kind;
    state.foodEatenCount += 1;

    if (kind === "shrink") {
      state.score += FOOD_SHRINK_SCORE;
      state.snake.pop(); // the ordinary "move forward" pop...
      if (state.snake.length > MIN_SNAKE_LENGTH) state.snake.pop(); // ...plus the shrink effect itself
    } else if (kind === "golden") {
      state.score += FOOD_GOLDEN_SCORE;
      // grows in place, same as normal food: no pop
    } else {
      state.score += FOOD_NORMAL_SCORE;
      // grows in place: no pop
    }

    const nextWave = 1 + Math.floor(state.foodEatenCount / FOOD_PER_WAVE);
    if (nextWave !== state.wave) {
      state.wave = nextWave;
      const candidateWalls = wallsForWave(nextWave);
      // Never let a layout swap materialize a wall tile under the snake's
      // own body — drop just those cells rather than blocking the wave
      // change outright or causing an unfair instant death.
      state.walls = candidateWalls.filter((w) => !state.snake.some((s) => s.x === w.x && s.y === w.y));
      state.portals = portalsForWave(nextWave);
    }

    state.food = spawnFood(state, tsMs);
    return { score: state.score };
  }

  state.snake.pop();
  return {};
}
