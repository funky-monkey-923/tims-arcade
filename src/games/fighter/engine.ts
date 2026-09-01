// Pure game logic for Rumble Ring — no React, no canvas, no DOM. This is
// the "engine" half of the engine/UI split: everything here is plain data
// + functions, so it can be unit-tested or reused with a different
// renderer without touching gameplay rules. See src/games/engineTypes.ts
// for the shared contract, and render.ts / RumbleRing.tsx for the other
// two-thirds of the split.

import type { EngineInput, EngineEvents } from "../engineTypes";

const GRAVITY = 0.9;
const JUMP_V = -14;
const MOVE_SPEED = 3.2;
const ROUND_MS = 45000;
const MAX_HEALTH = 100;

export type FighterState = "idle" | "walk" | "jump" | "punch" | "kick" | "block" | "hit";

interface MoveInfo {
  windup: number;
  active: number;
  recover: number;
  range: number;
  damage: number;
}

const MOVES: Record<"punch" | "kick", MoveInfo> = {
  punch: { windup: 60, active: 140, recover: 160, range: 0.16, damage: 7 },
  kick: { windup: 90, active: 160, recover: 260, range: 0.22, damage: 12 },
};

export interface Fighter {
  x: number;
  vx: number;
  y: number;
  vy: number;
  facing: 1 | -1;
  state: FighterState;
  timer: number;
  hasHit: boolean;
  health: number;
  color: string;
}

export interface MatchState {
  player: Fighter;
  cpu: Fighter;
  timeLeft: number;
  damageDealt: number;
  over: boolean;
  ground: number;
  width: number;
  height: number;
  cpuBrain: number; // CPU decision-timer accumulator (was cpuBrainRef in the React version)
}

// Game-specific events: the plain score/gameOver fields still mean what
// GameShell expects (score = damage dealt so far, gameOver = final score
// = damage dealt + win bonus), but the UI layer needs more detail than
// that to decide which sound effect to play on a given tick.
export interface FighterEvents extends EngineEvents {
  playerJumped?: boolean;
  cpuJumped?: boolean;
  playerAttackStarted?: "punch" | "kick";
  cpuAttackStarted?: "punch" | "kick";
  hitLanded?: boolean; // someone landed unblocked damage this tick
  hitBlocked?: boolean; // someone landed damage that was blocked
  won?: boolean; // only set alongside gameOver — did the player win?
}

function makeFighter(x: number, color: string): Fighter {
  return {
    x,
    vx: 0,
    y: 0,
    vy: 0,
    facing: x < 0.5 ? 1 : -1,
    state: "idle",
    timer: 0,
    hasHit: false,
    health: MAX_HEALTH,
    color,
  };
}

export function createState(width: number, height: number): MatchState {
  return {
    player: makeFighter(width * 0.25, "#2ee6d6"),
    cpu: makeFighter(width * 0.75, "#ff4d8d"),
    timeLeft: ROUND_MS,
    damageDealt: 0,
    over: false,
    ground: height * 0.82,
    width,
    height,
    cpuBrain: 0,
  };
}

function startMove(f: Fighter, name: "punch" | "kick"): void {
  f.state = name;
  f.timer = 0;
  f.hasHit = false;
}

interface DamageResult {
  amount: number;
  blocked: boolean;
}

function applyDamage(attacker: Fighter, defender: Fighter, dmg: number): DamageResult {
  const blocked = defender.state === "block";
  const real = blocked ? Math.round(dmg * 0.25) : dmg;
  defender.health = Math.max(0, defender.health - real);
  defender.vx = attacker.facing * (blocked ? 1.5 : 4);
  if (!blocked) {
    defender.state = "hit";
    defender.timer = 0;
  }
  return { amount: real, blocked };
}

interface FighterStepResult {
  jumped: boolean;
  attackStarted: "punch" | "kick" | null;
  damageDealt: number;
  blocked: boolean;
}

function stepFighter(
  state: MatchState,
  f: Fighter,
  other: Fighter,
  dt: number,
  input: EngineInput | null,
  aiTick: (() => void) | null
): FighterStepResult {
  const result: FighterStepResult = { jumped: false, attackStarted: null, damageDealt: 0, blocked: false };
  f.timer += dt;

  if (f.state === "idle" || f.state === "walk") {
    f.facing = other.x > f.x ? 1 : -1;
    if (aiTick) {
      aiTick();
    } else if (input) {
      let moving = false;
      if (input.left) {
        f.vx = -MOVE_SPEED;
        moving = true;
      } else if (input.right) {
        f.vx = MOVE_SPEED;
        moving = true;
      } else {
        f.vx = 0;
      }
      f.state = moving ? "walk" : "idle";
      if (input.up && f.y >= state.ground) {
        f.vy = JUMP_V;
        f.state = "jump";
        result.jumped = true;
      } else if (input.down) {
        f.state = "block";
      } else if (input.confirm) {
        startMove(f, "punch");
        result.attackStarted = "punch";
      } else if (input.cancel) {
        startMove(f, "kick");
        result.attackStarted = "kick";
      }
    }
  } else if (f.state === "block") {
    f.vx = 0;
    if (!(!aiTick && input && input.down)) f.state = "idle";
  } else if (f.state === "jump") {
    if (f.y >= state.ground && f.vy >= 0) {
      f.state = "idle";
      f.vx = 0;
    }
  } else if (f.state === "punch" || f.state === "kick") {
    const info = MOVES[f.state];
    if (!f.hasHit && f.timer >= info.windup && f.timer <= info.windup + info.active) {
      const dist = Math.abs(other.x - f.x);
      if (dist < state.width * info.range && Math.sign(other.x - f.x) === f.facing) {
        f.hasHit = true;
        const dmg = applyDamage(f, other, info.damage);
        result.damageDealt = dmg.amount;
        result.blocked = dmg.blocked;
        if (f === state.player) state.damageDealt += dmg.amount;
      }
    }
    if (f.timer >= info.windup + info.active + info.recover) {
      f.state = "idle";
      f.vx = 0;
    }
  } else if (f.state === "hit") {
    if (f.timer >= 260) f.state = "idle";
  }

  // physics
  f.vy += GRAVITY;
  f.y += f.vy;
  if (f.y > state.ground) {
    f.y = state.ground;
    f.vy = 0;
  }
  f.x += f.vx;
  f.vx *= 0.85;
  const margin = state.width * 0.06;
  f.x = Math.max(margin, Math.min(state.width - margin, f.x));

  return result;
}

function cpuAI(state: MatchState, dt: number): void {
  const cpu = state.cpu;
  const p = state.player;
  state.cpuBrain += dt;
  if (cpu.state !== "idle" && cpu.state !== "walk") return;
  const dist = Math.abs(p.x - cpu.x);
  cpu.facing = p.x > cpu.x ? 1 : -1;
  if (state.cpuBrain < 260) {
    // slow, easy reaction time: only re-decide roughly 4x/sec
    return;
  }
  state.cpuBrain = 0;
  if (dist > state.width * 0.2) {
    cpu.vx = cpu.facing * MOVE_SPEED * 0.8;
    cpu.state = "walk";
  } else if (dist < state.width * 0.1) {
    const roll = Math.random();
    if (roll < 0.35) startMove(cpu, "punch");
    else if (roll < 0.55) startMove(cpu, "kick");
    else if (roll < 0.7) {
      cpu.vx = -cpu.facing * MOVE_SPEED * 0.6;
      cpu.state = "walk";
    } else {
      cpu.vx = 0;
      cpu.state = "idle";
    }
  } else {
    cpu.vx = cpu.facing * MOVE_SPEED * 0.5;
    cpu.state = "walk";
  }
}

function endMatch(state: MatchState, playerWon: boolean): number {
  state.over = true;
  const bonus = playerWon ? 300 : 0;
  return state.damageDealt + bonus;
}

export function step(state: MatchState, input: EngineInput, dtMs: number, _tsMs: number): FighterEvents {
  if (state.over) return {};

  const dt = Math.min(48, dtMs);
  const events: FighterEvents = {};

  const playerResult = stepFighter(state, state.player, state.cpu, dt, input, null);
  const cpuResult = stepFighter(state, state.cpu, state.player, dt, null, () => cpuAI(state, dt));

  if (playerResult.jumped) events.playerJumped = true;
  if (cpuResult.jumped) events.cpuJumped = true;
  if (playerResult.attackStarted) events.playerAttackStarted = playerResult.attackStarted;
  if (cpuResult.attackStarted) events.cpuAttackStarted = cpuResult.attackStarted;
  if (playerResult.damageDealt > 0 || cpuResult.damageDealt > 0) {
    const anyBlocked = playerResult.blocked || cpuResult.blocked;
    const anyUnblocked = (playerResult.damageDealt > 0 && !playerResult.blocked) || (cpuResult.damageDealt > 0 && !cpuResult.blocked);
    if (anyUnblocked) events.hitLanded = true;
    if (anyBlocked) events.hitBlocked = true;
  }

  events.score = state.damageDealt;

  if (state.cpu.health <= 0) {
    const finalScore = endMatch(state, true);
    events.score = finalScore;
    events.gameOver = finalScore;
    events.won = true;
  } else if (state.player.health <= 0) {
    const finalScore = endMatch(state, false);
    events.score = finalScore;
    events.gameOver = finalScore;
    events.won = false;
  } else {
    state.timeLeft -= dt;
    if (state.timeLeft <= 0) {
      const playerWon = state.player.health >= state.cpu.health;
      const finalScore = endMatch(state, playerWon);
      events.score = finalScore;
      events.gameOver = finalScore;
      events.won = playerWon;
    }
  }

  return events;
}
