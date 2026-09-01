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
const GHOST_TICK_MS = 220; // ghosts are slower than the player
const SCARED_MS = 6500;

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

export interface Ghost {
  r: number;
  c: number;
  color: string;
  dir: Vec;
  startR: number;
  startC: number;
}

// step() reports which specific pickups/events happened this tick, in
// addition to the shared `score`/`gameOver` fields GameShell expects, so the
// UI layer can choose the right sfx (mirrors how SnakeGame.tsx picks a sfx
// from EngineEvents fields).
export interface MazeEvents extends EngineEvents {
  ateDot?: boolean;
  atePower?: boolean;
  ateGhost?: boolean;
  wonWave?: boolean;
  hitGhost?: boolean;
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
  canvasWidth: number; // kept for pointer-to-direction math in onPointer
  canvasHeight: number;
}

interface Neighbor {
  dir: Vec;
  r: number;
  c: number;
}

function buildMaze(): boolean[][] {
  // Border wall + sparse single-cell interior pillars. Because pillars never
  // touch each other, every open cell stays reachable — no maze-generation
  // algorithm needed, just a rule that can't produce a dead lock.
  const wall: boolean[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(false) as boolean[]);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const border = r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1;
      const pillar = r % 2 === 0 && r !== 0 && r !== ROWS - 1 && c % 2 === 0 && c !== 0 && c !== COLS - 1;
      wall[r][c] = border || pillar;
    }
  }
  return wall;
}

export function isWall(maze: boolean[][], r: number, c: number): boolean {
  if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return true;
  return maze[r][c];
}

const POWER_CELLS: Array<[number, number]> = [
  [1, 1],
  [1, COLS - 2],
  [ROWS - 2, 1],
  [ROWS - 2, COLS - 2],
];
const GHOST_STARTS: Array<{ r: number; c: number; color: string }> = [
  { r: 2, c: 7, color: "#ff4d8d" },
  { r: ROWS - 3, c: 7, color: "#2ee6d6" },
];
const PLAYER_START = { r: Math.floor(ROWS / 2), c: Math.floor(COLS / 2) };

interface Round {
  maze: boolean[][];
  dots: Set<string>;
  power: Set<string>;
  player: Player;
  ghosts: Ghost[];
}

function freshRound(): Round {
  const maze = buildMaze();
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
  return {
    maze,
    dots,
    power,
    player: { r: PLAYER_START.r, c: PLAYER_START.c, dir: { x: 0, y: 0 }, nextDir: { x: 0, y: 0 } },
    ghosts: GHOST_STARTS.map((g) => ({ ...g, dir: { x: 0, y: -1 }, startR: g.r, startC: g.c })),
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
  const round = freshRound();
  return {
    ...round,
    score: 0,
    lives: 3,
    wave: 1,
    dead: false,
    lastPlayerTick: 0,
    lastGhostTick: 0,
    scaredUntil: 0,
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

export function step(state: MazeState, input: EngineInput, _dtMs: number, tsMs: number): MazeEvents {
  if (state.dead) return {};

  const events: MazeEvents = {};
  const scared = tsMs < state.scaredUntil;

  // read held keyboard/gamepad/touch direction each frame
  if (input.up) state.player.nextDir = { x: 0, y: -1 };
  else if (input.down) state.player.nextDir = { x: 0, y: 1 };
  else if (input.left) state.player.nextDir = { x: -1, y: 0 };
  else if (input.right) state.player.nextDir = { x: 1, y: 0 };

  if (tsMs - state.lastPlayerTick >= TICK_MS) {
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
        events.score = state.score;
        events.ateDot = true;
      } else if (state.power.has(key)) {
        state.power.delete(key);
        state.score += 50;
        events.score = state.score;
        events.atePower = true;
        state.scaredUntil = tsMs + SCARED_MS;
      }
      if (state.dots.size === 0 && state.power.size === 0) {
        state.wave += 1;
        state.score += 100;
        events.score = state.score;
        events.wonWave = true;
        const round = freshRound();
        state.maze = round.maze;
        state.dots = round.dots;
        state.power = round.power;
        state.player = round.player;
        state.ghosts = round.ghosts;
      }
    }
  }

  if (tsMs - state.lastGhostTick >= GHOST_TICK_MS) {
    state.lastGhostTick = tsMs;
    state.ghosts.forEach((g) => {
      const opts = neighbors(state.maze, g.r, g.c).filter((nb) => !(nb.dir.x === -g.dir.x && nb.dir.y === -g.dir.y));
      const candidates = opts.length ? opts : neighbors(state.maze, g.r, g.c);
      if (candidates.length) {
        let pick: Neighbor;
        const wantsChase = Math.random() < (scared ? 0.15 : 0.35);
        if (wantsChase) {
          candidates.sort((a, b) => {
            const da = Math.abs(a.r - state.player.r) + Math.abs(a.c - state.player.c);
            const db = Math.abs(b.r - state.player.r) + Math.abs(b.c - state.player.c);
            return scared ? db - da : da - db;
          });
          pick = candidates[0];
        } else {
          pick = candidates[Math.floor(Math.random() * candidates.length)];
        }
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
      }
    }
  }

  return events;
}
