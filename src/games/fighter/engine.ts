// Pure game logic for Rumble Ring — no React, no canvas, no DOM. This is
// the "engine" half of the engine/UI split: everything here is plain data
// + functions, so it can be unit-tested or reused with a different
// renderer without touching gameplay rules. See src/games/engineTypes.ts
// for the shared contract, and render.ts / RumbleRing.tsx for the other
// two-thirds of the split.
//
// Deep-overhaul version: 3 selectable characters with real stat tradeoffs,
// a super meter + unblockable finisher, throws that beat block, best-of-3
// rounds, and 3 CPU difficulty tiers. See RumbleRing.tsx for the pre-fight
// setup screen that collects character/difficulty before createState().

import type { EngineInput, EngineEvents } from "../engineTypes";

const GRAVITY = 0.9;
const ROUND_MS = 45000;
const MAX_HEALTH = 100;
// How long primaryAction+secondaryAction must be held together before it's
// treated as a super attempt instead of a throw. Released earlier than this
// = throw; held at least this long (with a full meter) = super.
const HOLD_THRESHOLD_MS = 250;

export type Difficulty = "easy" | "medium" | "hard";

// CPU tuning per difficulty — see the task brief this was built from for
// the exact rationale behind each number. Kept as flat lookup tables so the
// AI functions below stay readable.
const REACTION_MS: Record<Difficulty, number> = { easy: 420, medium: 260, hard: 140 };
const BLOCK_CHANCE: Record<Difficulty, number> = { easy: 0, medium: 0.15, hard: 0.35 };
const DAMAGE_SCALE: Record<Difficulty, number> = { easy: 0.85, medium: 1, hard: 1.15 };
const SUPER_ALLOWED: Record<Difficulty, boolean> = { easy: false, medium: true, hard: true };
const SUPER_CHANCE: Record<Difficulty, number> = { easy: 0, medium: 0.45, hard: 0.75 };
const THROW_CHANCE: Record<Difficulty, number> = { easy: 0, medium: 0.12, hard: 0.22 };
// Extra throw likelihood the CPU adds when it notices the player is
// currently blocking — a small opponent-model-aware AI touch (throws are
// the counter to block, so a CPU that "knows" you're turtling should lean
// into that more on higher difficulties).
const THROW_CHANCE_BLOCK_BONUS: Record<Difficulty, number> = { easy: 0, medium: 0.25, hard: 0.35 };

export type AttackKind = "punch" | "kick" | "throw" | "super";
export type FighterState = "idle" | "walk" | "jump" | "block" | "hit" | AttackKind;
export type MatchPhase = "fighting" | "roundEnd" | "matchEnd";

export interface CharacterDef {
  id: string;
  name: string;
  blurb: string;
  color: string;
  moveSpeed: number;
  jumpV: number;
  punchDamage: number;
  kickDamage: number;
  rangeMultiplier: number; // scales attack range — >1 reaches further
  timingMultiplier: number; // scales windup/active/recover — >1 is slower but (paired with more damage) hits harder
}

// Exactly 3 characters, each a real tradeoff rather than a reskin: Blaze is
// the balanced reference point, Turbo trades power for speed/reach, Titan
// trades speed/reach for raw power.
export const CHARACTERS: CharacterDef[] = [
  {
    id: "blaze",
    name: "Blaze",
    blurb: "Balanced — no weaknesses, no huge edges either.",
    color: "#2ee6d6",
    moveSpeed: 3.2,
    jumpV: -14,
    punchDamage: 7,
    kickDamage: 12,
    rangeMultiplier: 1,
    timingMultiplier: 1,
  },
  {
    id: "turbo",
    name: "Turbo",
    blurb: "Fast & light — quick hits, shorter reach.",
    color: "#ffd43b",
    moveSpeed: 4.2,
    jumpV: -15,
    punchDamage: 5,
    kickDamage: 9,
    rangeMultiplier: 0.85,
    timingMultiplier: 0.85,
  },
  {
    id: "titan",
    name: "Titan",
    blurb: "Slow & heavy — telegraphed, but hits like a truck.",
    color: "#ff4d8d",
    moveSpeed: 2.4,
    jumpV: -13,
    punchDamage: 10,
    kickDamage: 16,
    rangeMultiplier: 1.2,
    timingMultiplier: 1.2,
  },
];

interface MoveInfo {
  windup: number;
  active: number;
  recover: number;
  range: number;
  damage: number;
}

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
  charId: string;
  // Per-fighter stats resolved from CharacterDef at creation time (replaces
  // the old shared MOVES/MOVE_SPEED constants) — see computeMoveInfo below.
  moveSpeed: number;
  jumpV: number;
  punchDamage: number;
  kickDamage: number;
  rangeMultiplier: number;
  timingMultiplier: number;
  // CPU-only damage scaling from difficulty (always 1 for the player); kept
  // on the fighter itself so resolveHit() doesn't need to know who's who.
  damageScale: number;
  // How long, in ms, both primaryAction+secondaryAction have been held
  // together this idle/walk stint. Reset to 0 whenever they're not both
  // held. Only meaningful for the player (input-driven); unused by the CPU,
  // which rolls throws/supers directly in cpuAI().
  holdTimer: number;
  // True once a hold-cycle has already spent itself on a super, so
  // releasing the buttons afterward doesn't also register as a throw.
  superSpent: boolean;
  // How long a "hit" stagger lasts once entered — normal hits use a short
  // stun, throws use a longer one (extra knockback + recovery time).
  hitStunMs: number;
}

export interface MatchState {
  player: Fighter;
  cpu: Fighter;
  timeLeft: number;
  damageDealt: number; // match-wide total, persists across rounds
  playerMeter: number; // 0-100 super meter
  cpuMeter: number;
  roundsWon: { player: number; cpu: number };
  round: number; // 1-indexed, current round number
  phase: MatchPhase;
  ground: number;
  width: number;
  height: number;
  cpuBrain: number; // CPU decision-timer accumulator
  difficulty: Difficulty;
}

// Game-specific events: the plain score/gameOver fields still mean what
// GameShell expects (score = damage dealt so far, gameOver = final score
// including round/match bonuses — see finalScore()), but the UI layer needs
// more detail than that to decide which sound effect to play on a given
// tick, and to know when a round (not just the whole match) just ended.
export interface FighterEvents extends EngineEvents {
  playerJumped?: boolean;
  cpuJumped?: boolean;
  playerAttackStarted?: AttackKind;
  cpuAttackStarted?: AttackKind;
  hitLanded?: boolean; // someone landed unblocked damage this tick
  hitBlocked?: boolean; // someone landed damage that was blocked
  roundOver?: boolean; // phase just left "fighting" this tick (roundEnd or matchEnd)
  won?: boolean; // only set alongside gameOver (i.e. at matchEnd) — did the player win the match?
}

function makeFighter(x: number, width: number, charDef: CharacterDef, damageScale: number): Fighter {
  return {
    x,
    vx: 0,
    y: 0,
    vy: 0,
    facing: x < width / 2 ? 1 : -1,
    state: "idle",
    timer: 0,
    hasHit: false,
    health: MAX_HEALTH,
    color: charDef.color,
    charId: charDef.id,
    moveSpeed: charDef.moveSpeed,
    jumpV: charDef.jumpV,
    punchDamage: charDef.punchDamage,
    kickDamage: charDef.kickDamage,
    rangeMultiplier: charDef.rangeMultiplier,
    timingMultiplier: charDef.timingMultiplier,
    damageScale,
    holdTimer: 0,
    superSpent: false,
    hitStunMs: 260,
  };
}

export function createState(width: number, height: number, playerCharId: string, difficulty: Difficulty): MatchState {
  const playerChar = CHARACTERS.find((c) => c.id === playerCharId) ?? CHARACTERS[0];
  // CPU's character is randomized per match (no persistent "AI picks
  // strategically" logic needed) — createState only runs once per match, so
  // Math.random() here is safe (never called from step()).
  const cpuChar = CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];
  return {
    player: makeFighter(width * 0.25, width, playerChar, 1),
    cpu: makeFighter(width * 0.75, width, cpuChar, DAMAGE_SCALE[difficulty]),
    timeLeft: ROUND_MS,
    damageDealt: 0,
    playerMeter: 0,
    cpuMeter: 0,
    roundsWon: { player: 0, cpu: 0 },
    round: 1,
    phase: "fighting",
    ground: height * 0.82,
    width,
    height,
    cpuBrain: 0,
    difficulty,
  };
}

// Called by the UI (RumbleRing.tsx) after its ~1.5s "Round N — Fight!"
// banner pause, once state.phase === "roundEnd" and the match isn't over.
// Resets both fighters (same characters, full health, centered) and both
// meters, but keeps match-wide totals (damageDealt, roundsWon) intact.
export function startNextRound(state: MatchState): void {
  const playerChar = CHARACTERS.find((c) => c.id === state.player.charId) ?? CHARACTERS[0];
  const cpuChar = CHARACTERS.find((c) => c.id === state.cpu.charId) ?? CHARACTERS[0];
  state.player = makeFighter(state.width * 0.25, state.width, playerChar, 1);
  state.cpu = makeFighter(state.width * 0.75, state.width, cpuChar, DAMAGE_SCALE[state.difficulty]);
  state.timeLeft = ROUND_MS;
  state.playerMeter = 0;
  state.cpuMeter = 0;
  state.cpuBrain = 0;
  state.round += 1;
  state.phase = "fighting";
}

function startMove(f: Fighter, name: AttackKind): void {
  f.state = name;
  f.timer = 0;
  f.hasHit = false;
}

function getMeter(state: MatchState, f: Fighter): number {
  return f === state.player ? state.playerMeter : state.cpuMeter;
}
function addMeter(state: MatchState, f: Fighter, amount: number): void {
  if (f === state.player) state.playerMeter = Math.min(100, state.playerMeter + amount);
  else state.cpuMeter = Math.min(100, state.cpuMeter + amount);
}
function spendMeter(state: MatchState, f: Fighter): void {
  if (f === state.player) state.playerMeter = 0;
  else state.cpuMeter = 0;
}

// Per-fighter move stats, replacing the old shared MOVES/MOVE_SPEED
// constants — base numbers scaled by that fighter's own timing/range
// multipliers (and, for punch/kick, that fighter's own damage stats).
function computeMoveInfo(f: Fighter, kind: AttackKind): MoveInfo {
  const t = f.timingMultiplier;
  const r = f.rangeMultiplier;
  switch (kind) {
    case "punch":
      return { windup: 60 * t, active: 140 * t, recover: 160 * t, range: 0.16 * r, damage: f.punchDamage };
    case "kick":
      return { windup: 90 * t, active: 160 * t, recover: 260 * t, range: 0.22 * r, damage: f.kickDamage };
    case "throw":
      return { windup: 40 * t, active: 90 * t, recover: 220 * t, range: 0.15 * r, damage: 14 };
    case "super":
      // Longer windup/active/recover than a kick — a real risk/reward move,
      // punishable if whiffed, not a free win button.
      return { windup: 220 * t, active: 200 * t, recover: 360 * t, range: 0.24 * r, damage: 30 };
  }
}

interface DamageResult {
  amount: number;
  blocked: boolean;
}

function resolveHit(state: MatchState, attacker: Fighter, defender: Fighter, baseDamage: number, kind: AttackKind): DamageResult {
  const isThrow = kind === "throw";
  const isSuper = kind === "super";
  // Throws bypass block entirely (that's the point — the counter to
  // "just hold block"). Supers can still be blocked, but only cut the
  // damage in half instead of the usual ~75% reduction — a comeback tool
  // is supposed to sting even through a correct block.
  const blocked = !isThrow && defender.state === "block";
  const scaled = Math.round(baseDamage * attacker.damageScale);
  const real = blocked ? Math.round(scaled * (isSuper ? 0.5 : 0.25)) : scaled;
  defender.health = Math.max(0, defender.health - real);
  defender.vx = attacker.facing * (isThrow ? 5 : blocked ? 1.5 : 4);
  defender.hitStunMs = isThrow ? 400 : 260;
  if (!blocked || isThrow) {
    defender.state = "hit";
    defender.timer = 0;
  }
  // Meter: unblocked hits build the most (+8 attacker), blocked hits still
  // chip in some (+3 attacker); the defender always gets a little (+4) as a
  // small comeback mechanic regardless of block.
  addMeter(state, attacker, blocked ? 3 : 8);
  addMeter(state, defender, 4);
  if (attacker === state.player) state.damageDealt += real;
  return { amount: real, blocked };
}

interface FighterStepResult {
  jumped: boolean;
  attackStarted: AttackKind | null;
  damageDealt: number;
  blocked: boolean;
}

function stepFighter(
  state: MatchState,
  f: Fighter,
  other: Fighter,
  dt: number,
  input: EngineInput | null,
  aiTick: (() => AttackKind | null) | null
): FighterStepResult {
  const result: FighterStepResult = { jumped: false, attackStarted: null, damageDealt: 0, blocked: false };
  f.timer += dt;

  if (f.state === "idle" || f.state === "walk") {
    f.facing = other.x > f.x ? 1 : -1;
    if (aiTick) {
      result.attackStarted = aiTick();
    } else if (input) {
      // primaryAction+secondaryAction held together drives both throws
      // (quick tap) and supers (held ~250ms+ with a full meter) — see the
      // file-level comment on HOLD_THRESHOLD_MS.
      const bothHeld = input.primaryAction && input.secondaryAction;
      let actionTaken = false;
      if (bothHeld) {
        f.vx = 0;
        f.state = "idle";
        f.holdTimer += dt;
        if (!f.superSpent && f.holdTimer >= HOLD_THRESHOLD_MS && getMeter(state, f) >= 100) {
          spendMeter(state, f);
          startMove(f, "super");
          result.attackStarted = "super";
          f.superSpent = true;
          actionTaken = true;
        }
      } else {
        if (f.holdTimer > 0 && f.holdTimer < HOLD_THRESHOLD_MS && !f.superSpent) {
          startMove(f, "throw");
          result.attackStarted = "throw";
          actionTaken = true;
        }
        f.holdTimer = 0;
        f.superSpent = false;
      }

      if (!actionTaken && !bothHeld) {
        let moving = false;
        if (input.moveLeft) {
          f.vx = -f.moveSpeed;
          moving = true;
        } else if (input.moveRight) {
          f.vx = f.moveSpeed;
          moving = true;
        } else {
          f.vx = 0;
        }
        f.state = moving ? "walk" : "idle";
        if (input.moveUp && f.y >= state.ground) {
          f.vy = f.jumpV;
          f.state = "jump";
          result.jumped = true;
        } else if (input.moveDown) {
          f.state = "block";
        } else if (input.primaryAction) {
          startMove(f, "punch");
          result.attackStarted = "punch";
        } else if (input.secondaryAction) {
          startMove(f, "kick");
          result.attackStarted = "kick";
        }
      }
    }
  } else if (f.state === "block") {
    f.vx = 0;
    if (!(!aiTick && input && input.moveDown)) f.state = "idle";
  } else if (f.state === "jump") {
    if (f.y >= state.ground && f.vy >= 0) {
      f.state = "idle";
      f.vx = 0;
    }
  } else if (f.state === "punch" || f.state === "kick" || f.state === "throw" || f.state === "super") {
    const kind: AttackKind = f.state;
    const info = computeMoveInfo(f, kind);
    if (!f.hasHit && f.timer >= info.windup && f.timer <= info.windup + info.active) {
      const dist = Math.abs(other.x - f.x);
      const facingOk = other.x === f.x || Math.sign(other.x - f.x) === f.facing;
      // Throws are the counter to block, but not to a defender who's
      // already mid-hit-stun/throw/super (invulnerable to a second throw).
      const throwWhiffsOnState = kind === "throw" && (other.state === "hit" || other.state === "throw" || other.state === "super");
      if (dist < state.width * info.range && facingOk && !throwWhiffsOnState) {
        f.hasHit = true;
        const dmg = resolveHit(state, f, other, info.damage, kind);
        result.damageDealt = dmg.amount;
        result.blocked = dmg.blocked;
      }
    }
    if (f.timer >= info.windup + info.active + info.recover) {
      f.state = "idle";
      f.vx = 0;
    }
  } else if (f.state === "hit") {
    if (f.timer >= f.hitStunMs) f.state = "idle";
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

function cpuAI(state: MatchState, dt: number, difficulty: Difficulty, playerAttackStarted: AttackKind | null): AttackKind | null {
  const cpu = state.cpu;
  const p = state.player;
  state.cpuBrain += dt;
  if (cpu.state !== "idle" && cpu.state !== "walk") return null;
  const dist = Math.abs(p.x - cpu.x);
  cpu.facing = p.x > cpu.x ? 1 : -1;

  // Reactive block: reads the player's just-started attack this same tick,
  // bypassing the normal decision cadence below — Easy never blocks,
  // Medium/Hard increasingly do, which is what makes higher difficulties
  // feel like they're actually watching you rather than moving on a timer.
  if ((playerAttackStarted === "punch" || playerAttackStarted === "kick") && dist < state.width * 0.22) {
    const blockChance = BLOCK_CHANCE[difficulty];
    if (blockChance > 0 && Math.random() < blockChance) {
      cpu.vx = 0;
      cpu.state = "block";
      return null;
    }
  }

  if (state.cpuBrain < REACTION_MS[difficulty]) {
    // reaction-time gate: only re-decide roughly every REACTION_MS[difficulty]
    return null;
  }
  state.cpuBrain = 0;

  if (SUPER_ALLOWED[difficulty] && state.cpuMeter >= 100 && dist < state.width * 0.26) {
    if (Math.random() < SUPER_CHANCE[difficulty]) {
      spendMeter(state, cpu);
      startMove(cpu, "super");
      return "super";
    }
  }

  if (dist > state.width * 0.2) {
    cpu.vx = cpu.facing * cpu.moveSpeed * 0.8;
    cpu.state = "walk";
    return null;
  }
  if (dist < state.width * 0.1) {
    let throwChance = THROW_CHANCE[difficulty];
    if (p.state === "block") throwChance += THROW_CHANCE_BLOCK_BONUS[difficulty];
    if (throwChance > 0 && Math.random() < throwChance) {
      startMove(cpu, "throw");
      return "throw";
    }
    const roll = Math.random();
    if (roll < 0.35) {
      startMove(cpu, "punch");
      return "punch";
    } else if (roll < 0.55) {
      startMove(cpu, "kick");
      return "kick";
    } else if (roll < 0.7) {
      cpu.vx = -cpu.facing * cpu.moveSpeed * 0.6;
      cpu.state = "walk";
    } else {
      cpu.vx = 0;
      cpu.state = "idle";
    }
    return null;
  }
  cpu.vx = cpu.facing * cpu.moveSpeed * 0.5;
  cpu.state = "walk";
  return null;
}

// Increments roundsWon for whoever won (playerWon === null is a genuine
// draw round — neither side increments), and decides whether the match
// continues (phase = "roundEnd") or is over (phase = "matchEnd", once
// either side reaches 2 round wins).
function settleRound(state: MatchState, playerWon: boolean | null): void {
  if (playerWon === true) state.roundsWon.player += 1;
  else if (playerWon === false) state.roundsWon.cpu += 1;
  state.phase = state.roundsWon.player >= 2 || state.roundsWon.cpu >= 2 ? "matchEnd" : "roundEnd";
}

// Final gameOver score, only computed once, at matchEnd: match-wide damage
// dealt + 150 per round the player won + a 500 bonus if the player won the
// match outright.
function finalScore(state: MatchState): number {
  const playerWonMatch = state.roundsWon.player > state.roundsWon.cpu;
  return state.damageDealt + state.roundsWon.player * 150 + (playerWonMatch ? 500 : 0);
}

export function step(state: MatchState, input: EngineInput, dtMs: number, _tsMs: number): FighterEvents {
  if (state.phase !== "fighting") return {};

  const dt = Math.min(48, dtMs);
  const events: FighterEvents = {};

  const playerResult = stepFighter(state, state.player, state.cpu, dt, input, null);
  const cpuResult = stepFighter(state, state.cpu, state.player, dt, null, () => cpuAI(state, dt, state.difficulty, playerResult.attackStarted));

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

  if (state.cpu.health <= 0 || state.player.health <= 0) {
    // Simultaneous double-KO: neither check order nor a coin flip should
    // silently hand the round to the player — treat it as a draw round (no
    // round win for either side).
    const playerWon = state.cpu.health <= 0 && state.player.health <= 0 ? null : state.cpu.health <= 0;
    settleRound(state, playerWon);
  } else {
    state.timeLeft -= dt;
    if (state.timeLeft <= 0) {
      const playerWon = state.player.health === state.cpu.health ? null : state.player.health > state.cpu.health;
      settleRound(state, playerWon);
    }
  }

  if (state.phase !== "fighting") {
    events.roundOver = true;
    if (state.phase === "matchEnd") {
      const fs = finalScore(state);
      events.score = fs;
      events.gameOver = fs;
      events.won = state.roundsWon.player > state.roundsWon.cpu;
    }
  }

  return events;
}
