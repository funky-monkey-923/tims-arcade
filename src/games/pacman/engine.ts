// Pure game logic for Munch Maze (Pac-Man-style) — no React, no canvas, no
// DOM. This is the "engine" half of the engine/UI split: everything here is
// plain data + functions, so it can be unit-tested or reused with a
// different renderer without touching gameplay rules. See
// src/games/engineTypes.ts for the shared contract, and render.ts /
// MunchMaze.tsx for the other two-thirds of the split.

import type { EngineInput, EngineEvents, PointerAction } from "../engineTypes";

export const ROWS = 13;
export const COLS = 15;
const TICK_MS = 160; // player move speed — easy/forgiving pace
const SPEED_TICK_DIVISOR = 1.6; // player moves this much faster while a speed pellet is active
const SCARED_MS_BASE = 6500; // wave-1 power-pellet duration
const SCARED_MS_MIN = 3000; // never shrinks below this, however high the wave climbs
const SCARED_MS_STEP_PER_WAVE = 400;
const GHOST_TICK_MS_BASE = 220; // wave-1 ghost move speed
const GHOST_TICK_MS_MIN = 150; // never gets faster than this
const GHOST_TICK_MS_STEP_PER_WAVE = 6;
const SPEED_BOOST_MS = 5000;
const FRUIT_MS = 8000;
const FRUIT_SCORE = 200;
const SPEED_PELLET_SCORE = 30;

// Difficulty ramp: pellets get shorter and ghosts get faster as `wave`
// climbs, but both are clamped so late waves stay hard, not unfair — see
// SCARED_MS_MIN / GHOST_TICK_MS_MIN above.
function scaredMsForWave(wave: number): number {
  return Math.max(SCARED_MS_MIN, SCARED_MS_BASE - (wave - 1) * SCARED_MS_STEP_PER_WAVE);
}
function ghostTickMsForWave(wave: number): number {
  return Math.max(GHOST_TICK_MS_MIN, GHOST_TICK_MS_BASE - (wave - 1) * GHOST_TICK_MS_STEP_PER_WAVE);
}
// Ghosts are added gradually (never removed) as waves climb, up to the 4
// distinct sprites/personalities available — see GHOST_STARTS below. Slot 0
// (chaser) and slot 1 (late-activator, which starts docile) are present from
// wave 1 so early waves still have a hunter, but a gentle one; wanderer and
// ambusher join later once the player has more practice.
function ghostCountForWave(wave: number): number {
  if (wave <= 1) return 2;
  if (wave <= 3) return 3;
  return 4;
}
// Alternates between the 3 maze layouts (see buildMaze) so the level doesn't
// look identical every wave.
function mazeVariantForWave(wave: number): number {
  return (wave - 1) % 3;
}

export interface Vec {
  x: number;
  y: number;
}

export interface Player {
  r: number;
  c: number;
  dir: Vec;
  nextDir: Vec;
}

// Each personality is a distinct targeting/behavior rule the ghost `step()`
// loop consults every ghost tick (see pickGhostMove below):
//   - chaser: always biases toward the player's current cell.
//   - ambusher: biases toward a few cells ahead of the player's facing
//     direction, trying to cut them off rather than tail them.
//   - wanderer: mostly random-neighbor movement, occasionally biases toward
//     the player.
//   - lateActivator: behaves like a wanderer until it "wakes up" (wave > 1,
//     or enough dots eaten this wave — see isLateActivatorAwake), then
//     switches to chaser-like behavior for the rest of the wave.
export type GhostPersonality = "chaser" | "ambusher" | "wanderer" | "lateActivator";

export interface Ghost {
  r: number;
  c: number;
  color: string;
  dir: Vec;
  startR: number;
  startC: number;
  personality: GhostPersonality;
}

// step() reports which specific pickups/events happened this tick, in
// addition to the shared `score`/`gameOver` fields GameShell expects, so the
// UI layer can choose the right sfx (mirrors how SnakeGame.tsx picks a sfx
// from EngineEvents fields).
export interface MazeEvents extends EngineEvents {
  ateDot?: boolean;
  atePower?: boolean;
  ateGhost?: boolean;
  ateFruit?: boolean;
  ateSpeedPellet?: boolean;
  wonWave?: boolean;
  hitGhost?: boolean;
}

// A one-off bonus pickup: spawns at a fixed point mid-wave, worth a flat
// score bonus, and despawns on its own if the player doesn't grab it in
// time. Fruit and the speed pellet share this shape; only the score/sfx
// differ, and the constants above and the r/c pick are what set them apart.
export interface TimedPickup {
  r: number;
  c: number;
  expiresAt: number;
}

export interface MazeState {
  maze: boolean[][];
  dots: Set<string>;
  power: Set<string>;
  player: Player;
  ghosts: Ghost[];
  score: number;
  lives: number;
  wave: number;
  dead: boolean;
  lastPlayerTick: number;
  lastGhostTick: number;
  scaredUntil: number;
  speedUntil: number;
  fruit: TimedPickup | null;
  fruitSpawned: boolean;
  speedPellet: TimedPickup | null;
  speedPelletSpawned: boolean;
  dotsEatenThisWave: number;
  initialDotCount: number;
  canvasWidth: number; // kept for pointer-to-direction math in onPointer
  canvasHeight: number;
}

interface Neighbor {
  dir: Vec;
  r: number;
  c: number;
}

function buildMaze(variant: number): boolean[][] {
  // Every variant below only ever *removes* walls relative to (or rearranges
  // walls the same way as) the original scheme's guarantee: single-cell
  // interior pillars that never touch each other. Because no two walls
  // touch, no open cell can ever be sealed off — there's no maze-generation
  // algorithm needed, just a placement rule that can't produce a dead lock.
  // Each variant keeps that invariant, so every layout stays fully solvable.
  const wall: boolean[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(false) as boolean[]);
  const midR = Math.floor(ROWS / 2);
  const midC = Math.floor(COLS / 2);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const border = r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1;
      const interior = !border;
      let pillar = false;
      if (interior) {
        if (variant === 1) {
          // Wide spacing: pillars every 3 cells instead of every 2, giving
          // longer open corridors. Spacing only grew, so pillars still
          // never touch.
          pillar = r % 3 === 0 && c % 3 === 0;
        } else if (variant === 2) {
          // Open cross: same spacing as the original layout, but the
          // middle row/column are never pillared, carving a clear cross
          // through the maze's center. Strictly fewer walls than variant 0,
          // so reachability can only improve.
          pillar = r % 2 === 0 && c % 2 === 0 && r !== midR && c !== midC;
        } else {
          // Original scheme: sparse single-cell interior pillars on the
          // even/even grid.
          pillar = r % 2 === 0 && c % 2 === 0;
        }
      }
      wall[r][c] = border || pillar;
    }
  }
  return wall;
}

export function isWall(maze: boolean[][], r: number, c: number): boolean {
  if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return true;
  return maze[r][c];
}

// Fixed points that must stay open (non-wall) under every maze variant —
// verified by hand for variant 0 (even/even pillar grid), variant 1
// (every-3rd-cell pillar grid), and variant 2 (even/even grid minus the
// center cross): none of these r/c pairs land on a pillar cell in any of the
// three schemes.
const POWER_CELLS: Array<[number, number]> = [
  [1, 1],
  [1, COLS - 2],
  [ROWS - 2, 1],
  [ROWS - 2, COLS - 2],
];
// Spawn slots, always used in this order as the roster grows with `wave`
// (see ghostCountForWave) — slot 0 (chaser) and slot 1 (lateActivator) exist
// from wave 1, slot 2 (wanderer) joins at wave 2, slot 3 (ambusher) at wave
// 4. Each personality keeps the same color/sprite everywhere so a kid can
// learn "the spiky one always hunts me" regardless of which wave it first
// shows up in.
const GHOST_STARTS: Array<{ r: number; c: number; color: string; personality: GhostPersonality }> = [
  { r: 2, c: 7, color: "#ff4d8d", personality: "chaser" },
  { r: ROWS - 3, c: 7, color: "#b47cff", personality: "lateActivator" },
  { r: 2, c: COLS - 2, color: "#ffb347", personality: "wanderer" },
  { r: ROWS - 3, c: COLS - 2, color: "#2ee6d6", personality: "ambusher" },
];
const PLAYER_START = { r: Math.floor(ROWS / 2), c: Math.floor(COLS / 2) };
// A few cells around the maze's center to try in order for the fruit/speed
// pellet spawn point — first one that isn't a wall wins. Center itself
// doubles as PLAYER_START, so it's tried last to avoid an instant, un-fun
// pickup right under the player's nose at wave start.
const CENTER_CANDIDATE_OFFSETS: Vec[] = [
  { x: 2, y: 0 },
  { x: -2, y: 0 },
  { x: 0, y: 2 },
  { x: 0, y: -2 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: 0, y: 0 },
];

interface Round {
  maze: boolean[][];
  dots: Set<string>;
  power: Set<string>;
  player: Player;
  ghosts: Ghost[];
  initialDotCount: number;
}

function pickCenterCell(maze: boolean[][]): { r: number; c: number } {
  const midR = Math.floor(ROWS / 2);
  const midC = Math.floor(COLS / 2);
  for (const off of CENTER_CANDIDATE_OFFSETS) {
    const r = midR + off.y;
    const c = midC + off.x;
    if (!isWall(maze, r, c)) return { r, c };
  }
  return { r: midR, c: midC };
}

function freshRound(wave: number): Round {
  const maze = buildMaze(mazeVariantForWave(wave));
  const dots = new Set<string>();
  const power = new Set<string>();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!maze[r][c]) dots.add(`${r},${c}`);
    }
  }
  POWER_CELLS.forEach(([r, c]) => {
    dots.delete(`${r},${c}`);
    power.add(`${r},${c}`);
  });
  const ghostCount = ghostCountForWave(wave);
  return {
    maze,
    dots,
    power,
    player: { r: PLAYER_START.r, c: PLAYER_START.c, dir: { x: 0, y: 0 }, nextDir: { x: 0, y: 0 } },
    ghosts: GHOST_STARTS.slice(0, ghostCount).map((g) => ({
      ...g,
      dir: { x: 0, y: -1 },
      startR: g.r,
      startC: g.c,
    })),
    initialDotCount: dots.size,
  };
}

function neighbors(maze: boolean[][], r: number, c: number): Neighbor[] {
  return [
    { dir: { x: 0, y: -1 }, r: r - 1, c },
    { dir: { x: 0, y: 1 }, r: r + 1, c },
    { dir: { x: -1, y: 0 }, r, c: c - 1 },
    { dir: { x: 1, y: 0 }, r, c: c + 1 },
  ].filter((nb) => !isWall(maze, nb.r, nb.c));
}

export function createState(width: number, height: number): MazeState {
  const round = freshRound(1);
  return {
    ...round,
    score: 0,
    lives: 3,
    wave: 1,
    dead: false,
    lastPlayerTick: 0,
    lastGhostTick: 0,
    scaredUntil: 0,
    speedUntil: 0,
    fruit: null,
    fruitSpawned: false,
    speedPellet: null,
    speedPelletSpawned: false,
    dotsEatenThisWave: 0,
    canvasWidth: width,
    canvasHeight: height,
  };
}

export function onPointer(state: MazeState, action: PointerAction): void {
  if (action.kind !== "down") return;
  const cell = Math.min(state.canvasWidth / COLS, state.canvasHeight / ROWS);
  const offX = (state.canvasWidth - cell * COLS) / 2;
  const offY = (state.canvasHeight - cell * ROWS) / 2;
  const px = (state.player.c + 0.5) * cell + offX;
  const py = (state.player.r + 0.5) * cell + offY;
  const dx = action.x - px;
  const dy = action.y - py;
  state.player.nextDir = Math.abs(dx) > Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) };
}

// A late-activator ghost stays docile early so EVERY wave (not just the
// first) has a genuine "safe" opening window, then switches on once the
// player's made real progress on the current wave's dots. Previously this
// also flipped unconditionally from wave 2 onward, which meant the
// advertised "safe opening" only ever existed on wave 1 — fixed so the
// dots-eaten threshold is the only gate, every wave.
function isLateActivatorAwake(state: MazeState): boolean {
  const threshold = Math.max(5, Math.floor(state.initialDotCount / 2));
  return state.dotsEatenThisWave >= threshold;
}

function ghostChaseProbability(g: Ghost, state: MazeState): number {
  switch (g.personality) {
    case "chaser":
      return 0.9;
    case "ambusher":
      return 0.75;
    case "wanderer":
      return 0.25;
    case "lateActivator":
      // Distinct from wanderer's 0.25 in both states: noticeably more docile
      // while dormant (0.05 — barely chases at all), then noticeably more
      // aggressive than even the chaser's baseline once awake (0.9 here ties
      // chaser, but combined with the ambush-free target function below it
      // still reads as a different ghost).
      return isLateActivatorAwake(state) ? 0.9 : 0.05;
    default:
      return 0.3;
  }
}

const AMBUSH_LOOKAHEAD = 3;

// Where a (non-scared) ghost wants to head toward. Every personality except
// ambusher just targets the player's literal cell; ambusher instead targets
// a few cells out ahead of the player's current facing direction, so it
// tries to cut the player off rather than tail them.
function ghostTarget(g: Ghost, state: MazeState): { r: number; c: number } {
  if (g.personality === "ambusher") {
    const p = state.player;
    let tr = p.r + p.dir.y * AMBUSH_LOOKAHEAD;
    let tc = p.c + p.dir.x * AMBUSH_LOOKAHEAD;
    tr = Math.min(ROWS - 2, Math.max(1, tr));
    tc = Math.min(COLS - 2, Math.max(1, tc));
    return { r: tr, c: tc };
  }
  return { r: state.player.r, c: state.player.c };
}

function manhattan(a: { r: number; c: number }, b: { r: number; c: number }): number {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
}

function pickGhostMove(g: Ghost, state: MazeState, scared: boolean): Neighbor | undefined {
  const raw = neighbors(state.maze, g.r, g.c);
  const noReverse = raw.filter((nb) => !(nb.dir.x === -g.dir.x && nb.dir.y === -g.dir.y));
  const candidates = noReverse.length ? noReverse : raw;
  if (!candidates.length) return undefined;

  if (scared) {
    // While scared, every personality flees the same way — always away from
    // the player's literal position. Personality quirks only apply to
    // hunting, not fleeing, so a scared ghost reads consistently as "safe
    // to eat" no matter which one it is.
    candidates.sort((a, b) => manhattan(b, state.player) - manhattan(a, state.player));
    return candidates[0];
  }

  const wantsChase = Math.random() < ghostChaseProbability(g, state);
  if (wantsChase) {
    const target = ghostTarget(g, state);
    candidates.sort((a, b) => manhattan(a, target) - manhattan(b, target));
    return candidates[0];
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export function step(state: MazeState, input: EngineInput, _dtMs: number, tsMs: number): MazeEvents {
  if (state.dead) return {};

  const events: MazeEvents = {};
  const scared = tsMs < state.scaredUntil;
  const sped = tsMs < state.speedUntil;

  // read held keyboard/gamepad/touch direction each frame
  if (input.moveUp) state.player.nextDir = { x: 0, y: -1 };
  else if (input.moveDown) state.player.nextDir = { x: 0, y: 1 };
  else if (input.moveLeft) state.player.nextDir = { x: -1, y: 0 };
  else if (input.moveRight) state.player.nextDir = { x: 1, y: 0 };

  const playerTickMs = sped ? TICK_MS / SPEED_TICK_DIVISOR : TICK_MS;
  if (tsMs - state.lastPlayerTick >= playerTickMs) {
    state.lastPlayerTick = tsMs;
    const p = state.player;
    if (!isWall(state.maze, p.r + p.nextDir.y, p.c + p.nextDir.x)) p.dir = p.nextDir;
    const nr = p.r + p.dir.y;
    const nc = p.c + p.dir.x;
    if (!isWall(state.maze, nr, nc)) {
      p.r = nr;
      p.c = nc;
      const key = `${p.r},${p.c}`;
      if (state.dots.has(key)) {
        state.dots.delete(key);
        state.score += 10;
        state.dotsEatenThisWave += 1;
        events.score = state.score;
        events.ateDot = true;
      } else if (state.power.has(key)) {
        state.power.delete(key);
        state.score += 50;
        events.score = state.score;
        events.atePower = true;
        state.scaredUntil = tsMs + scaredMsForWave(state.wave);
      }

      if (state.fruit && state.fruit.r === p.r && state.fruit.c === p.c) {
        state.fruit = null;
        state.score += FRUIT_SCORE;
        events.score = state.score;
        events.ateFruit = true;
      }
      if (state.speedPellet && state.speedPellet.r === p.r && state.speedPellet.c === p.c) {
        state.speedPellet = null;
        state.score += SPEED_PELLET_SCORE;
        state.speedUntil = tsMs + SPEED_BOOST_MS;
        events.score = state.score;
        events.ateSpeedPellet = true;
      }

      // Spawn the mid-wave bonus pickups once each, after the player's made
      // some progress on the current wave's dots (so they don't just appear
      // immediately at wave start).
      const fruitThreshold = Math.max(5, Math.floor(state.initialDotCount * 0.4));
      const speedThreshold = Math.max(8, Math.floor(state.initialDotCount * 0.65));
      if (!state.fruitSpawned && state.dotsEatenThisWave >= fruitThreshold) {
        state.fruitSpawned = true;
        const cell = pickCenterCell(state.maze);
        state.dots.delete(`${cell.r},${cell.c}`);
        state.fruit = { r: cell.r, c: cell.c, expiresAt: tsMs + FRUIT_MS };
      }
      if (!state.speedPelletSpawned && state.dotsEatenThisWave >= speedThreshold) {
        state.speedPelletSpawned = true;
        const cell = pickCenterCell(state.maze);
        // Fruit may already occupy the same "nearest open center cell" —
        // that's fine, the two pickups are allowed to overlap the same
        // tile; whichever one is still there gets eaten first.
        state.dots.delete(`${cell.r},${cell.c}`);
        state.speedPellet = { r: cell.r, c: cell.c, expiresAt: tsMs + FRUIT_MS };
      }

      if (state.dots.size === 0 && state.power.size === 0) {
        state.wave += 1;
        state.score += 100;
        events.score = state.score;
        events.wonWave = true;
        const round = freshRound(state.wave);
        state.maze = round.maze;
        state.dots = round.dots;
        state.power = round.power;
        state.player = round.player;
        state.ghosts = round.ghosts;
        state.initialDotCount = round.initialDotCount;
        state.scaredUntil = 0;
        state.speedUntil = 0;
        state.fruit = null;
        state.fruitSpawned = false;
        state.speedPellet = null;
        state.speedPelletSpawned = false;
        state.dotsEatenThisWave = 0;
      }
    }
  }

  if (state.fruit && tsMs > state.fruit.expiresAt) state.fruit = null;
  if (state.speedPellet && tsMs > state.speedPellet.expiresAt) state.speedPellet = null;

  const ghostTickMs = ghostTickMsForWave(state.wave);
  if (tsMs - state.lastGhostTick >= ghostTickMs) {
    state.lastGhostTick = tsMs;
    state.ghosts.forEach((g) => {
      const pick = pickGhostMove(g, state, scared);
      if (pick) {
        g.dir = pick.dir;
        g.r = pick.r;
        g.c = pick.c;
      }
    });
  }

  // collision check
  for (const g of state.ghosts) {
    if (g.r === state.player.r && g.c === state.player.c) {
      if (scared) {
        g.r = g.startR;
        g.c = g.startC;
        state.score += 100;
        events.score = state.score;
        events.ateGhost = true;
        break;
      } else {
        state.lives -= 1;
        events.hitGhost = true;
        state.player.r = PLAYER_START.r;
        state.player.c = PLAYER_START.c;
        state.player.dir = { x: 0, y: 0 };
        state.player.nextDir = { x: 0, y: 0 };
        if (state.lives <= 0) {
          state.dead = true;
          events.gameOver = state.score;
          return events;
        }
        break;
      }
    }
  }

  return events;
}
