// Pure game logic for Star Defender — no React, no canvas, no DOM. This is
// the "engine" half of the engine/UI split: everything here is plain data +
// functions, so it can be unit-tested or reused with a different renderer
// without touching gameplay rules. See src/games/engineTypes.ts for the
// shared contract, and render.ts / StarDefender.tsx for the other
// two-thirds of the split.
//
// Deep-overhaul version: destructible bunkers, 3 enemy types (standard/
// shielded/diver), boss waves every 3rd wave, 4 power-up kinds, a bonus UFO,
// and 3 difficulty tiers threaded through createState — see
// StarDefender.tsx for the pre-run difficulty setup screen that collects the
// difficulty before createState() is called (same pattern as fighter/).

import type { EngineInput, EngineEvents, PointerAction } from "../engineTypes";

const ROWS = 4;
const COLS = 7;
const PLAYER_SPEED = 4.4; // px per frame, easy mode: forgiving speed
const BULLET_SPEED = 7;
const ENEMY_BULLET_SPEED = 2.6;
const FIRE_COOLDOWN = 320; // ms — base cooldown, halved while "rapid" powerup is active
const POINTER_TIMEOUT = 600; // ms — how long a drag stays "active" before falling back to held left/right
const POINTER_EASE = 0.18;

export type Difficulty = "easy" | "medium" | "hard";

// Per-difficulty tuning — see the task brief this was built from for the
// rationale behind each knob. Kept as flat lookup tables so the step/AI
// logic below stays readable.
const ENEMY_FIRE_CHANCE: Record<Difficulty, number> = { easy: 0.0011, medium: 0.0016, hard: 0.0024 }; // per alive formation enemy, per frame
const FORMATION_SPEED_MULT: Record<Difficulty, number> = { easy: 0.8, medium: 1, hard: 1.3 };
const DIVE_CHANCE: Record<Difficulty, number> = { easy: 0.0009, medium: 0.0016, hard: 0.0026 }; // per frame, gated to one diver active at a time
const DIVE_FIRE_MS: Record<Difficulty, number> = { easy: 700, medium: 550, hard: 420 };
const BOSS_HP: Record<Difficulty, number> = { easy: 25, medium: 32, hard: 40 };
const BOSS_FIRE_MS: Record<Difficulty, number> = { easy: 2000, medium: 1500, hard: 1100 };
const BOSS_BULLET_COUNT: Record<Difficulty, number> = { easy: 2, medium: 2, hard: 3 };
const BOSS_SPEED: Record<Difficulty, number> = { easy: 1.4, medium: 1.8, hard: 2.3 };

const DIVE_SPEED = 3.4;
const DIVE_EASE = 0.05;
const POWERUP_FALL_SPEED = 1.4;
const POWERUP_DURATION_MS = 8000;
const UFO_SPEED = 2.2;
const UFO_MIN_GAP_MS = 15000;
const UFO_MAX_GAP_MS = 25000;
const BOSS_BONUS = 300;
const UFO_BONUS = 150;
const MAX_LIVES = 5;

export type EnemyType = "standard" | "shielded" | "diver";

export interface Enemy {
  row: number;
  col: number;
  x: number;
  y: number;
  alive: boolean;
  type: EnemyType;
  hp: number;
  // True once this enemy has broken formation to dive at the player. While
  // diving, `x`/`y` are absolute canvas coordinates (no longer relative to
  // `wave.offsetX`) — see the `diving` branch in step().
  diving: boolean;
  diveTargetX: number;
  diveFireAccum: number;
}

export interface Wave {
  enemies: Enemy[];
  cell: number;
  dir: number;
  offsetX: number;
  dropAccum: number;
}

export interface Boss {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  dir: number;
  lastFireTs: number;
}

export interface Bunker {
  x: number;
  y: number;
  cellW: number;
  cellH: number;
  cells: boolean[][];
}

export type PowerupKind = "spread" | "rapid" | "shield" | "life";

export interface PowerupDrop {
  x: number;
  y: number;
  vy: number;
  kind: PowerupKind;
}

export interface Ufo {
  x: number;
  y: number;
  dir: number;
}

export interface Bullet {
  x: number;
  y: number;
  vy: number;
  vx: number;
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
  difficulty: Difficulty;
  player: Player;
  bullets: Bullet[];
  wave: Wave;
  boss: Boss | null;
  bunkers: Bunker[];
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
  powerupDrops: PowerupDrop[];
  // expiresAtTs for the two duration-based powerups; absence/undefined means
  // "not active". `hasShield` is one-shot (consumed on the next hit) rather
  // than duration-based, so it's tracked separately as a plain boolean.
  activePowerups: Partial<Record<"spread" | "rapid", number>>;
  hasShield: boolean;
  shieldFlashUntil: number;
  ufo: Ufo | null;
  // null until the first step() call primes it with a real tsMs-based
  // deadline — createState() has no timestamp to work with, so this is
  // lazily initialized on the first tick instead (see step()).
  nextUfoAt: number | null;
}

// score/gameOver mean what GameShell expects (from EngineEvents); the extra
// fields let the UI layer pick the right sfx without re-deriving "what
// happened this tick" from raw score deltas.
export interface StarDefenderEvents extends EngineEvents {
  shot?: boolean;
  enemyDestroyed?: boolean;
  // Cosmetic-only coordinates for the render layer's particle/shake triggers
  // (see render.ts) — pure data, no gameplay meaning, so adding them here
  // keeps engine.ts's "no DOM/canvas" rule intact while still letting the UI
  // layer know *where* a moment happened instead of re-deriving it.
  enemyDestroyedAt?: { x: number; y: number };
  waveClear?: boolean;
  hit?: boolean;
  powerupCollected?: PowerupKind;
  shieldBlocked?: boolean;
  bossDefeated?: boolean;
  bossDefeatedAt?: { x: number; y: number };
  bossHit?: boolean;
  bossHitAt?: { x: number; y: number };
  ufoHit?: boolean;
  ufoHitAt?: { x: number; y: number };
}

function pickEnemyType(): EnemyType {
  const roll = Math.random();
  if (roll < 0.15) return "shielded";
  if (roll < 0.3) return "diver";
  return "standard";
}

function makeWave(width: number, height: number): Wave {
  const marginX = width * 0.1;
  const gridW = width - marginX * 2;
  const cell = gridW / COLS;
  const enemies: Enemy[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const type = pickEnemyType();
      enemies.push({
        row: r,
        col: c,
        x: marginX + c * cell + cell / 2,
        y: height * 0.12 + r * (cell * 0.85),
        alive: true,
        type,
        hp: type === "shielded" ? 2 : 1,
        diving: false,
        diveTargetX: 0,
        diveFireAccum: 0,
      });
    }
  }
  return { enemies, cell, dir: 1, offsetX: 0, dropAccum: 0 };
}

function makeBoss(width: number, height: number, difficulty: Difficulty): Boss {
  const hp = BOSS_HP[difficulty];
  return { x: width / 2, y: height * 0.15, hp, maxHp: hp, dir: 1, lastFireTs: 0 };
}

// Classic-invaders-style bunker silhouette: a solid block with a small notch
// cut out of the bottom-middle so it visually reads as a bunker even before
// any damage. 4 bunkers spread evenly across the width, positioned between
// where the wave descends to and the player.
function makeBunkers(width: number, height: number): Bunker[] {
  const count = 4;
  const cols = 6;
  const rows = 4;
  const bunkerW = width * 0.12;
  const cellW = bunkerW / cols;
  const cellH = 8;
  const y = height * 0.64;
  const bunkers: Bunker[] = [];
  for (let i = 0; i < count; i++) {
    const centerX = width * ((i + 1) / (count + 1));
    const x = centerX - bunkerW / 2;
    const cells: boolean[][] = [];
    for (let r = 0; r < rows; r++) {
      const row: boolean[] = [];
      for (let c = 0; c < cols; c++) {
        const isNotch = r === rows - 1 && (c === 2 || c === 3);
        row.push(!isNotch);
      }
      cells.push(row);
    }
    bunkers.push({ x, y, cellW, cellH, cells });
  }
  return bunkers;
}

// A boss wave every 3rd wave (3, 6, 9, ...) replaces the usual enemy grid —
// the boss *is* the wave, no separate grid to also clear.
function isBossWave(waveNumber: number): boolean {
  return waveNumber % 3 === 0;
}

function setupWave(state: Pick<StarDefenderState, "width" | "height" | "difficulty">, waveNumber: number): { wave: Wave; boss: Boss | null } {
  if (isBossWave(waveNumber)) {
    return { wave: { enemies: [], cell: state.width / COLS, dir: 1, offsetX: 0, dropAccum: 0 }, boss: makeBoss(state.width, state.height, state.difficulty) };
  }
  return { wave: makeWave(state.width, state.height), boss: null };
}

export function createState(width: number, height: number, difficulty: Difficulty = "medium"): StarDefenderState {
  const player: Player = { x: width / 2, y: height - 28, w: Math.max(28, width * 0.08), h: 16 };
  const waveNumber = 1;
  const { wave, boss } = setupWave({ width, height, difficulty }, waveNumber);
  return {
    width,
    height,
    difficulty,
    player,
    bullets: [],
    wave,
    boss,
    bunkers: makeBunkers(width, height),
    waveNumber,
    lives: 3,
    score: 0,
    dead: false,
    lastFireTs: 0,
    explosions: [],
    pointerTargetX: null,
    lastPointerTs: 0,
    powerupDrops: [],
    activePowerups: {},
    hasShield: false,
    shieldFlashUntil: 0,
    ufo: null,
    nextUfoAt: null,
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
  if (state.hasShield) {
    // Consumed here; the caller (step()'s enemy-bullet branch) stamps
    // shieldFlashUntil with the real tsMs right after this returns, since
    // loseLife() itself isn't passed a timestamp.
    state.hasShield = false;
    events.shieldBlocked = true;
    return;
  }
  state.lives -= 1;
  events.hit = true;
  if (state.lives <= 0) {
    state.dead = true;
    events.gameOver = state.score;
  }
}

// Destroys the bunker cell (if any) under (bx, by) and returns whether a
// cell was hit — same bullet-stopping idiom used for bullet-vs-enemy/
// bullet-vs-player below, just checked against a small grid instead of a
// single point.
function hitBunker(bunkers: Bunker[], bx: number, by: number): boolean {
  for (const bunker of bunkers) {
    const rows = bunker.cells.length;
    const cols = bunker.cells[0]?.length ?? 0;
    const totalW = bunker.cellW * cols;
    const totalH = bunker.cellH * rows;
    if (bx < bunker.x || bx > bunker.x + totalW || by < bunker.y || by > bunker.y + totalH) continue;
    const col = Math.floor((bx - bunker.x) / bunker.cellW);
    const row = Math.floor((by - bunker.y) / bunker.cellH);
    if (row < 0 || row >= rows || col < 0 || col >= cols) continue;
    if (bunker.cells[row][col]) {
      bunker.cells[row][col] = false;
      return true;
    }
  }
  return false;
}

const POWERUP_KINDS: PowerupKind[] = ["spread", "rapid", "shield", "life"];

function maybeDropPowerup(state: StarDefenderState, x: number, y: number, type: EnemyType | "boss"): void {
  const chance = type === "boss" ? 1 : type === "standard" ? 0.08 : 0.18;
  if (Math.random() >= chance) return;
  const kind = POWERUP_KINDS[Math.floor(Math.random() * POWERUP_KINDS.length)];
  state.powerupDrops.push({ x, y, vy: POWERUP_FALL_SPEED, kind });
}

function applyPowerup(state: StarDefenderState, kind: PowerupKind, tsMs: number): void {
  if (kind === "spread") state.activePowerups.spread = tsMs + POWERUP_DURATION_MS;
  else if (kind === "rapid") state.activePowerups.rapid = tsMs + POWERUP_DURATION_MS;
  else if (kind === "shield") state.hasShield = true;
  else if (kind === "life") state.lives = Math.min(MAX_LIVES, state.lives + 1);
}

function advanceToNextWave(state: StarDefenderState): void {
  state.waveNumber += 1;
  const { wave, boss } = setupWave(state, state.waveNumber);
  state.wave = wave;
  state.boss = boss;
  state.bunkers = makeBunkers(state.width, state.height);
}

export function step(state: StarDefenderState, input: EngineInput, dtMs: number, tsMs: number): StarDefenderEvents {
  if (state.dead) return {};

  const events: StarDefenderEvents = {};
  const { player, wave, bullets, difficulty } = state;

  if (state.nextUfoAt === null) {
    state.nextUfoAt = tsMs + UFO_MIN_GAP_MS + Math.random() * (UFO_MAX_GAP_MS - UFO_MIN_GAP_MS);
  }

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

  const cooldown = state.activePowerups.rapid && tsMs < state.activePowerups.rapid ? FIRE_COOLDOWN / 2 : FIRE_COOLDOWN;
  if (input.primaryAction && tsMs - state.lastFireTs > cooldown) {
    state.lastFireTs = tsMs;
    if (state.activePowerups.spread && tsMs < state.activePowerups.spread) {
      bullets.push({ x: player.x, y: player.y - player.h, vy: -BULLET_SPEED, vx: -1.6, from: "player" });
      bullets.push({ x: player.x, y: player.y - player.h, vy: -BULLET_SPEED, vx: 0, from: "player" });
      bullets.push({ x: player.x, y: player.y - player.h, vy: -BULLET_SPEED, vx: 1.6, from: "player" });
    } else {
      bullets.push({ x: player.x, y: player.y - player.h, vy: -BULLET_SPEED, vx: 0, from: "player" });
    }
    events.shot = true;
  }

  // bonus UFO: spawns roughly every 15-25s while no boss is active, sweeps
  // across the top at a fixed altitude, never fires back.
  if (!state.boss) {
    if (state.ufo) {
      state.ufo.x += state.ufo.dir * UFO_SPEED;
      if (state.ufo.x < -40 || state.ufo.x > state.width + 40) {
        state.ufo = null;
        state.nextUfoAt = tsMs + UFO_MIN_GAP_MS + Math.random() * (UFO_MAX_GAP_MS - UFO_MIN_GAP_MS);
      }
    } else if (tsMs >= state.nextUfoAt) {
      const fromLeft = Math.random() < 0.5;
      state.ufo = { x: fromLeft ? -30 : state.width + 30, y: state.height * 0.06, dir: fromLeft ? 1 : -1 };
    }
  }

  // power-up capsule drift + player pickup
  for (let i = state.powerupDrops.length - 1; i >= 0; i--) {
    const p = state.powerupDrops[i];
    p.y += p.vy;
    if (p.y > state.height + 12) {
      state.powerupDrops.splice(i, 1);
      continue;
    }
    if (Math.abs(p.x - player.x) < player.w / 2 + 10 && Math.abs(p.y - player.y) < player.h + 10) {
      applyPowerup(state, p.kind, tsMs);
      events.powerupCollected = p.kind;
      state.powerupDrops.splice(i, 1);
    }
  }

  if (state.boss) {
    const boss = state.boss;
    const speed = BOSS_SPEED[difficulty];
    boss.x += boss.dir * speed;
    const margin = state.width * 0.16;
    if (boss.x > state.width - margin || boss.x < margin) boss.dir *= -1;
    boss.y = Math.min(state.height * 0.32, boss.y + 0.02);
    if (tsMs - boss.lastFireTs > BOSS_FIRE_MS[difficulty]) {
      boss.lastFireTs = tsMs;
      const count = BOSS_BULLET_COUNT[difficulty];
      for (let i = 0; i < count; i++) {
        const spread = (i - (count - 1) / 2) * 1.6;
        bullets.push({ x: boss.x, y: boss.y + 30, vy: ENEMY_BULLET_SPEED, vx: spread, from: "enemy" });
      }
    }
  } else {
    // enemy formation movement + diver break-away
    const formationEnemies = wave.enemies.filter((e) => e.alive && !e.diving);
    const divingEnemies = wave.enemies.filter((e) => e.alive && e.diving);
    const aliveEnemies = wave.enemies.filter((e) => e.alive);

    if (aliveEnemies.length > 0) {
      if (formationEnemies.length > 0) {
        const speed = (0.35 + (state.waveNumber - 1) * 0.08 + (ROWS * COLS - aliveEnemies.length) * 0.01) * FORMATION_SPEED_MULT[difficulty];
        wave.offsetX += wave.dir * speed;
        const minX = Math.min(...formationEnemies.map((e) => e.x)) + wave.offsetX;
        const maxX = Math.max(...formationEnemies.map((e) => e.x)) + wave.offsetX;
        if (maxX > state.width - wave.cell / 2 || minX < wave.cell / 2) {
          wave.dir *= -1;
          wave.offsetX += wave.dir * speed * 2;
          formationEnemies.forEach((e) => {
            e.y += wave.cell * 0.35;
          });
          if (formationEnemies.some((e) => e.y > player.y - 30)) {
            state.dead = true;
            events.gameOver = state.score;
            return events;
          }
        }

        // occasional enemy fire from a random alive formation enemy
        if (Math.random() < ENEMY_FIRE_CHANCE[difficulty] * formationEnemies.length) {
          const shooter = formationEnemies[Math.floor(Math.random() * formationEnemies.length)];
          bullets.push({ x: shooter.x + wave.offsetX, y: shooter.y, vy: ENEMY_BULLET_SPEED, vx: 0, from: "enemy" });
        }

        // occasionally break a diver-eligible enemy out of formation to dive
        // at the player — gated so at most one is diving at a time.
        if (divingEnemies.length === 0 && Math.random() < DIVE_CHANCE[difficulty]) {
          const eligible = formationEnemies.filter((e) => e.type === "diver");
          if (eligible.length > 0) {
            const chosen = eligible[Math.floor(Math.random() * eligible.length)];
            chosen.x = chosen.x + wave.offsetX; // freeze absolute x — no longer tracks wave.offsetX
            chosen.diving = true;
            chosen.diveTargetX = player.x;
            chosen.diveFireAccum = 0;
          }
        }
      }

      // diver movement — independent of the formation, eases toward the
      // player's x captured at dive-start and fires more often on the way down
      divingEnemies.forEach((e) => {
        e.y += DIVE_SPEED;
        e.x += (e.diveTargetX - e.x) * DIVE_EASE;
        e.diveFireAccum += dtMs;
        if (e.diveFireAccum > DIVE_FIRE_MS[difficulty]) {
          e.diveFireAccum = 0;
          bullets.push({ x: e.x, y: e.y, vy: ENEMY_BULLET_SPEED * 1.3, vx: 0, from: "enemy" });
        }
        if (e.y > state.height + 20) {
          // dove past the bottom of the screen — gone, no penalty either way
          e.alive = false;
        }
      });
    } else {
      // wave cleared! bonus + fresh, slightly tougher wave (or a boss wave)
      state.score += 50;
      events.score = state.score;
      events.waveClear = true;
      advanceToNextWave(state);
    }
  }

  // bullets
  let hitThisTick = false;
  for (let i = bullets.length - 1; i >= 0; i--) {
    if (hitThisTick) break;
    const b = bullets[i];
    b.y += b.vy;
    b.x += b.vx;
    if (b.y < -10 || b.y > state.height + 10) {
      bullets.splice(i, 1);
      continue;
    }

    if (hitBunker(state.bunkers, b.x, b.y)) {
      bullets.splice(i, 1);
      continue;
    }

    if (b.from === "player") {
      if (state.boss) {
        const boss = state.boss;
        const half = state.width * 0.09;
        if (Math.abs(b.x - boss.x) < half && Math.abs(b.y - boss.y) < half) {
          boss.hp -= 1;
          bullets.splice(i, 1);
          state.explosions.push({ x: b.x, y: b.y, until: tsMs + 200 });
          events.bossHit = true;
          events.bossHitAt = { x: b.x, y: b.y };
          if (boss.hp <= 0) {
            state.score += BOSS_BONUS;
            events.score = state.score;
            events.enemyDestroyed = true;
            events.bossDefeated = true;
            events.bossDefeatedAt = { x: boss.x, y: boss.y };
            events.waveClear = true;
            advanceToNextWave(state);
          }
          continue;
        }
      } else {
        let hitEnemy = false;
        for (const e of wave.enemies) {
          if (!e.alive) continue;
          const ex = e.diving ? e.x : e.x + wave.offsetX;
          if (Math.abs(b.x - ex) < wave.cell * 0.4 && Math.abs(b.y - e.y) < wave.cell * 0.4) {
            bullets.splice(i, 1);
            e.hp -= 1;
            state.explosions.push({ x: ex, y: e.y, until: tsMs + 200 });
            if (e.hp <= 0) {
              e.alive = false;
              const points = e.type === "shielded" ? 25 : e.type === "diver" ? 20 : 10;
              state.score += points;
              events.score = state.score;
              events.enemyDestroyed = true;
              events.enemyDestroyedAt = { x: ex, y: e.y };
              state.explosions.push({ x: ex, y: e.y, until: tsMs + 260 });
              maybeDropPowerup(state, ex, e.y, e.type);
            }
            hitEnemy = true;
            break;
          }
        }
        if (hitEnemy) continue;
      }

      if (state.ufo) {
        const ufo = state.ufo;
        if (Math.abs(b.x - ufo.x) < state.width * 0.05 && Math.abs(b.y - ufo.y) < 14) {
          bullets.splice(i, 1);
          state.score += UFO_BONUS;
          events.score = state.score;
          events.ufoHit = true;
          events.ufoHitAt = { x: ufo.x, y: ufo.y };
          state.explosions.push({ x: ufo.x, y: ufo.y, until: tsMs + 260 });
          state.ufo = null;
          state.nextUfoAt = tsMs + UFO_MIN_GAP_MS + Math.random() * (UFO_MAX_GAP_MS - UFO_MIN_GAP_MS);
        }
      }
    } else if (b.from === "enemy") {
      if (Math.abs(b.x - player.x) < player.w / 2 + 4 && Math.abs(b.y - player.y) < player.h) {
        bullets.splice(i, 1);
        loseLife(state, events);
        if (events.shieldBlocked) state.shieldFlashUntil = tsMs + 300;
        hitThisTick = true;
      }
    }
  }

  return events;
}
