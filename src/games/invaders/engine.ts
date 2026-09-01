// Pure game logic for Star Defender — no React, no canvas, no DOM. This is
// the "engine" half of the engine/UI split: everything here is plain data +
// functions, so it can be unit-tested or reused with a different renderer
// without touching gameplay rules. See src/games/engineTypes.ts for the
// shared contract, and render.ts / StarDefender.tsx for the other
// two-thirds of the split.

import type { EngineInput, EngineEvents, PointerAction } from "../engineTypes";

const ROWS = 4;
const COLS = 7;
const PLAYER_SPEED = 4.4; // px per frame, easy mode: forgiving speed
const BULLET_SPEED = 7;
const ENEMY_BULLET_SPEED = 2.6;
const FIRE_COOLDOWN = 320; // ms — easy mode, no button-mash required
const ENEMY_FIRE_CHANCE = 0.0016; // per alive bottom-row enemy, per frame
const POINTER_TIMEOUT = 600; // ms — how long a drag stays "active" before falling back to held left/right
const POINTER_EASE = 0.18;

export interface Enemy {
  row: number;
  col: number;
  x: number;
  y: number;
  alive: boolean;
}

export interface Wave {
  enemies: Enemy[];
  cell: number;
  dir: number;
  offsetX: number;
  dropAccum: number;
}

export interface Bullet {
  x: number;
  y: number;
  vy: number;
  from: "player" | "enemy";
}

export interface Player {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface StarDefenderState {
  width: number;
  height: number;
  player: Player;
  bullets: Bullet[];
  wave: Wave;
  waveNumber: number;
  lives: number;
  score: number;
  dead: boolean;
  lastFireTs: number;
  // Transient explosion flashes drawn where an enemy was just destroyed.
  // Purely cosmetic — pruned once `until` passes so this array never grows
  // unbounded. Not touched by scoring/collision logic.
  explosions: Array<{ x: number; y: number; until: number }>;
  // Drag-to-move state: `pointerTargetX` is the last canvas-relative x seen
  // from a pointermove, `lastPointerTs` is when it was last updated. step()
  // eases the player toward pointerTargetX while that timestamp is recent,
  // and falls back to held left/right input once it goes stale — same
  // 600ms timeout as the original StarDefender.jsx's pointerSeenRef.
  pointerTargetX: number | null;
  lastPointerTs: number;
}

// score/gameOver mean what GameShell expects (from EngineEvents); the extra
// fields let the UI layer pick the right sfx without re-deriving "what
// happened this tick" from raw score deltas.
export interface StarDefenderEvents extends EngineEvents {
  shot?: boolean;
  enemyDestroyed?: boolean;
  waveClear?: boolean;
  hit?: boolean;
}

function makeWave(width: number, height: number): Wave {
  const marginX = width * 0.1;
  const gridW = width - marginX * 2;
  const cell = gridW / COLS;
  const enemies: Enemy[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      enemies.push({
        row: r,
        col: c,
        x: marginX + c * cell + cell / 2,
        y: height * 0.12 + r * (cell * 0.85),
        alive: true,
      });
    }
  }
  return { enemies, cell, dir: 1, offsetX: 0, dropAccum: 0 };
}

export function createState(width: number, height: number): StarDefenderState {
  const player: Player = { x: width / 2, y: height - 28, w: Math.max(28, width * 0.08), h: 16 };
  return {
    width,
    height,
    player,
    bullets: [],
    wave: makeWave(width, height),
    waveNumber: 1,
    lives: 3,
    score: 0,
    dead: false,
    lastFireTs: 0,
    explosions: [],
    pointerTargetX: null,
    lastPointerTs: 0,
  };
}

export function onPointer(state: StarDefenderState, action: PointerAction): void {
  if (action.kind !== "move") return;
  state.pointerTargetX = action.x;
  // No tsMs is threaded through onPointer (see engineTypes.ts), so we stamp
  // with performance.now() here — it shares the same monotonic clock as the
  // rAF timestamps passed into step(), so the two are directly comparable.
  state.lastPointerTs = performance.now();
}

function loseLife(state: StarDefenderState, events: StarDefenderEvents): void {
  state.lives -= 1;
  events.hit = true;
  if (state.lives <= 0) {
    state.dead = true;
    events.gameOver = state.score;
  }
}

export function step(state: StarDefenderState, input: EngineInput, _dtMs: number, tsMs: number): StarDefenderEvents {
  if (state.dead) return {};

  const events: StarDefenderEvents = {};
  const { player, wave, bullets } = state;

  // prune expired explosion flashes (cosmetic-only, see StarDefenderState)
  state.explosions = state.explosions.filter((ex) => ex.until > tsMs);

  // movement: mouse/touch drag over the canvas takes priority; otherwise
  // held keyboard/gamepad/on-screen d-pad left/right
  const usingPointer = state.pointerTargetX != null && tsMs - state.lastPointerTs < POINTER_TIMEOUT;
  if (usingPointer) {
    player.x += (state.pointerTargetX! - player.x) * POINTER_EASE;
  } else {
    if (input.moveLeft) player.x -= PLAYER_SPEED;
    if (input.moveRight) player.x += PLAYER_SPEED;
  }
  player.x = Math.max(player.w / 2, Math.min(state.width - player.w / 2, player.x));

  if (input.primaryAction && tsMs - state.lastFireTs > FIRE_COOLDOWN) {
    state.lastFireTs = tsMs;
    bullets.push({ x: player.x, y: player.y - player.h, vy: -BULLET_SPEED, from: "player" });
    events.shot = true;
  }

  // enemy formation movement
  const aliveEnemies = wave.enemies.filter((e) => e.alive);
  if (aliveEnemies.length > 0) {
    const speed = 0.35 + (state.waveNumber - 1) * 0.08 + (ROWS * COLS - aliveEnemies.length) * 0.01;
    wave.offsetX += wave.dir * speed;
    const minX = Math.min(...aliveEnemies.map((e) => e.x)) + wave.offsetX;
    const maxX = Math.max(...aliveEnemies.map((e) => e.x)) + wave.offsetX;
    if (maxX > state.width - wave.cell / 2 || minX < wave.cell / 2) {
      wave.dir *= -1;
      wave.offsetX += wave.dir * speed * 2;
      aliveEnemies.forEach((e) => {
        e.y += wave.cell * 0.35;
      });
      if (aliveEnemies.some((e) => e.y > player.y - 30)) {
        state.dead = true;
        events.gameOver = state.score;
        return events;
      }
    }

    // occasional enemy fire from a random alive enemy
    if (Math.random() < ENEMY_FIRE_CHANCE * aliveEnemies.length) {
      const shooter = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
      bullets.push({ x: shooter.x + wave.offsetX, y: shooter.y, vy: ENEMY_BULLET_SPEED, from: "enemy" });
    }
  } else {
    // wave cleared! bonus + fresh, slightly tougher wave
    state.score += 50;
    events.score = state.score;
    events.waveClear = true;
    state.waveNumber += 1;
    state.wave = makeWave(state.width, state.height);
  }

  // bullets
  let hitThisTick = false;
  for (let i = bullets.length - 1; i >= 0; i--) {
    if (hitThisTick) break;
    const b = bullets[i];
    b.y += b.vy;
    if (b.y < -10 || b.y > state.height + 10) {
      bullets.splice(i, 1);
      continue;
    }
    if (b.from === "player") {
      for (const e of state.wave.enemies) {
        if (!e.alive) continue;
        const ex = e.x + state.wave.offsetX;
        if (Math.abs(b.x - ex) < state.wave.cell * 0.4 && Math.abs(b.y - e.y) < state.wave.cell * 0.4) {
          e.alive = false;
          bullets.splice(i, 1);
          state.score += 10;
          events.score = state.score;
          events.enemyDestroyed = true;
          state.explosions.push({ x: ex, y: e.y, until: tsMs + 260 });
          break;
        }
      }
    } else if (b.from === "enemy") {
      if (Math.abs(b.x - player.x) < player.w / 2 + 4 && Math.abs(b.y - player.y) < player.h) {
        bullets.splice(i, 1);
        loseLife(state, events);
        hitThisTick = true;
      }
    }
  }

  return events;
}
