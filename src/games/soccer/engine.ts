// Pure game logic for Kickoff Clash (2D soccer) — no React, no canvas, no
// DOM, and no audio: sound effects are decided by the UI layer from the
// events this module returns. See src/games/engineTypes.ts for the shared
// contract, and render.ts / KickoffClash.tsx for the other two-thirds of
// the split.
//
// Deep-overhaul version: 2v2 (player + AI teammate vs 2 CPU opponents,
// each with a reaction-cadence AI brain), charge-up shots, player stamina,
// two timed halves + halftime + penalty shootout, a skill-move dodge, and
// 3 CPU difficulty tiers. See KickoffClash.tsx for the pre-match difficulty
// setup screen that collects the difficulty before createState().
//
// Scope note: full 3v3 would get visually cluttered on this canvas size, so
// this is deliberately 2v2 (player + 1 AI teammate vs 2 CPU opponents) —
// see the task write-up this was built from for the full rationale.

import type { EngineInput, EngineEvents } from "../engineTypes";

export type Difficulty = "easy" | "medium" | "hard";

const HALF_MS = 45000;
const HALFTIME_PAUSE_MS = 2500;

const PLAYER_BASE_SPEED = 3.4;
const PLAYER_LOW_STAMINA_SPEED = 2.0;
const STAMINA_MAX = 100;
const STAMINA_LOW_THRESHOLD = 25;
// Full drain in ~4.5s of continuous sprinting, full regen in ~7s standing
// still — tuned so sprinting everywhere is a real tradeoff but a kid isn't
// permanently gassed either.
const STAMINA_DRAIN_PER_MS = 100 / 4500;
const STAMINA_REGEN_PER_MS = 100 / 7000;

const BALL_FRICTION = 0.985;
const KICK_COOLDOWN = 380;
// A fully charged shot (see CHARGE_MAX_MS) should be close to the fastest
// the ball ever goes — this caps runaway speed from sustained dribble-push
// contact (e.g. pinning the ball against a wall every frame).
const MAX_BALL_SPEED = 13;
const CHARGE_MAX_MS = 850;
const SHOT_POWER_MIN = 6; // quick-tap shot: weak but still usable
const SHOT_POWER_MAX = 13; // fully-charged shot
const PUSH_FORCE = 1.6;

// Skill-move dodge: a fast moveLeft<->moveRight reversal, while dribbling
// near a defender, grants a brief speed burst.
const DODGE_REVERSAL_WINDOW_MS = 200;
const DODGE_BOOST_MS = 220;
const DODGE_COOLDOWN_MS = 1100;
const DODGE_SPEED_MULT = 1.9;
const DODGE_DEFENDER_RANGE = 90; // "near a defender" radius that arms the dodge

// CPU tuning per difficulty. Kept as flat lookup tables so the AI functions
// below stay readable — mirrors the fighter game's REACTION_MS/etc pattern.
const CPU_REACTION_MS: Record<Difficulty, number> = { easy: 400, medium: 250, hard: 150 };
const CPU_SPEED: Record<Difficulty, number> = { easy: 2.3, medium: 2.65, hard: 3.05 };
// Chance per AI decision tick (i.e. every CPU_REACTION_MS) that a chasing,
// ball-adjacent CPU opponent commits to a shot attempt.
const CPU_SHOOT_AGGRO: Record<Difficulty, number> = { easy: 0.35, medium: 0.5, hard: 0.65 };
// Multiplier on the dribble-push force a defender applies when contesting
// the ball — the "tackle aggressiveness" the brief calls for: higher
// difficulty defenders knock the ball away from a dribbler more forcefully.
const CPU_TACKLE_PUSH: Record<Difficulty, number> = { easy: 1.3, medium: 1.75, hard: 2.2 };
const CPU_CHARGE_MS: Record<Difficulty, number> = { easy: 220, medium: 420, hard: 650 };
const CPU_SHOT_POWER: Record<Difficulty, number> = { easy: 7.5, medium: 9, hard: 11 };

// The AI teammate isn't difficulty-tuned (difficulty is explicitly "CPU
// only" per the brief) — fixed, modest values so it's a helpful but not
// overpowered extra body.
const TEAMMATE_REACTION_MS = 260;
const TEAMMATE_SPEED = 2.6;
const TEAMMATE_SHOOT_AGGRO = 0.4;
const TEAMMATE_CHARGE_MS = 350;
const TEAMMATE_SHOT_POWER = 8.5;

const SHOOTOUT_KEEPER_SAVE_CHANCE: Record<Difficulty, number> = { easy: 0.22, medium: 0.38, hard: 0.55 };
const SHOOTOUT_CPU_MAKE_CHANCE: Record<Difficulty, number> = { easy: 0.5, medium: 0.65, hard: 0.8 };
const SHOOTOUT_RESOLVE_MS = 800;
const SHOOTOUT_CPU_WINDUP_MS = 500;

export interface Entity {
  x: number;
  y: number;
  r: number;
}

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

// The player's own character — the only one with stamina and a dodge, since
// those are input-reactive mechanics the human actually feels.
export interface PlayerChar extends Entity {
  stamina: number;
  chargeStart: number | null; // tsMs charge began, null when not charging
  prevMoveLeft: boolean;
  prevMoveRight: boolean;
  leftReleasedAt: number | null;
  rightReleasedAt: number | null;
  dodgeUntil: number; // tsMs the current dodge speed-burst ends
  dodgeCooldownUntil: number;
}

// Any of the 3 non-player bodies (1 teammate, 2 opponents) — a reaction-
// cadence AI: `brain` accumulates dt and only re-decides a movement target
// roughly every REACTION_MS, so they don't look robotically perfect.
export interface AIChar extends Entity {
  brain: number;
  vx: number; // current decided per-frame movement (already speed-scaled)
  vy: number;
  chargeUntil: number | null; // tsMs this AI will release its shot, null when not charging
}

export type MatchPhase = "playing" | "halftime" | "shootout" | "over";

export type ShootoutSide = "player" | "cpu";
export type ShootoutStage = "aiming" | "resolving";

export interface ShootoutState {
  turn: ShootoutSide;
  stage: ShootoutStage;
  playerAttempts: boolean[]; // true = goal
  cpuAttempts: boolean[];
  suddenDeath: boolean;
  winner: ShootoutSide | null;
  // current-attempt visuals/resolution
  ballX: number;
  ballY: number;
  shotDir: -1 | 0 | 1;
  chargeStart: number | null;
  keeperDiveDir: -1 | 0 | 1 | null;
  resolveAt: number | null;
  lastOutcome: "goal" | "save" | "miss" | null;
}

export interface SoccerState {
  width: number;
  height: number;
  player: PlayerChar;
  teammate: AIChar;
  opp1: AIChar;
  opp2: AIChar;
  ball: Ball;
  playerGoals: number;
  cpuGoals: number;
  half: 1 | 2;
  timeLeft: number;
  phase: MatchPhase;
  halftimeUntil: number | null;
  // Shared kick cooldown timer used by the player's shoot action and any
  // CPU/teammate shot — a plain number on state instead of a ref, since
  // engine.ts has no React.
  lastKick: number;
  difficulty: Difficulty;
  shootout: ShootoutState | null;
  over: boolean; // true once phase === "over" — kept for a quick early-return check
}

// EngineEvents isn't expressive enough on its own to distinguish "player
// scored" vs "cpu scored" vs "someone kicked the ball" vs "final whistle,
// did I win" — the UI layer needs all of that to pick the right sfx. score
// and gameOver keep meaning exactly what GameShell expects.
export interface SoccerEvents extends EngineEvents {
  shotFired?: boolean;
  playerGoal?: boolean;
  cpuGoal?: boolean;
  finalWhistle?: boolean;
  won?: boolean;
  halftimeStarted?: boolean;
  secondHalfStarted?: boolean;
  shootoutStarted?: boolean;
  shootoutAttemptResolved?: "goal" | "save" | "miss";
  skillMove?: boolean;
}

function resetBall(width: number, height: number): Ball {
  return { x: width / 2, y: height / 2, vx: 0, vy: 0, r: Math.max(7, width * 0.02) };
}

function makePlayer(x: number, y: number, r: number): PlayerChar {
  return {
    x,
    y,
    r,
    stamina: STAMINA_MAX,
    chargeStart: null,
    prevMoveLeft: false,
    prevMoveRight: false,
    leftReleasedAt: null,
    rightReleasedAt: null,
    dodgeUntil: 0,
    dodgeCooldownUntil: 0,
  };
}

function makeAI(x: number, y: number, r: number): AIChar {
  return { x, y, r, brain: 0, vx: 0, vy: 0, chargeUntil: null };
}

function resetPositions(state: SoccerState): void {
  const { width, height } = state;
  const r = Math.max(12, width * 0.035);
  Object.assign(state.player, makePlayer(width * 0.3, height * 0.35, r));
  Object.assign(state.teammate, makeAI(width * 0.3, height * 0.65, r));
  Object.assign(state.opp1, makeAI(width * 0.7, height * 0.35, r));
  Object.assign(state.opp2, makeAI(width * 0.7, height * 0.65, r));
  Object.assign(state.ball, resetBall(width, height));
}

export function createState(width: number, height: number, difficulty: Difficulty): SoccerState {
  const r = Math.max(12, width * 0.035);
  return {
    width,
    height,
    player: makePlayer(width * 0.3, height * 0.35, r),
    teammate: makeAI(width * 0.3, height * 0.65, r),
    opp1: makeAI(width * 0.7, height * 0.35, r),
    opp2: makeAI(width * 0.7, height * 0.65, r),
    ball: resetBall(width, height),
    playerGoals: 0,
    cpuGoals: 0,
    half: 1,
    timeLeft: HALF_MS,
    phase: "playing",
    halftimeUntil: null,
    lastKick: 0,
    difficulty,
    shootout: null,
    over: false,
  };
}

function goalBounds(height: number): { goalHalf: number; goalTop: number; goalBottom: number } {
  const goalHalf = height * 0.16;
  return { goalHalf, goalTop: height / 2 - goalHalf, goalBottom: height / 2 + goalHalf };
}

// `spread` scales the random miss-distance on the target point — a fully
// charged shot (spread near 0) is noticeably more accurate than a quick tap
// (spread near 1), per the brief's "slightly more accurate" charged shots.
function shoot(ball: Ball, width: number, height: number, goalHalf: number, towardRightGoal: boolean, power: number, spread: number): void {
  const targetX = towardRightGoal ? width : 0;
  const targetY = height / 2 + (Math.random() - 0.5) * goalHalf * 1.6 * spread;
  const dx = targetX - ball.x;
  const dy = targetY - ball.y;
  const len = Math.hypot(dx, dy) || 1;
  ball.vx = (dx / len) * power;
  ball.vy = (dy / len) * power;
}

function capBallSpeed(ball: Ball): void {
  const speed = Math.hypot(ball.vx, ball.vy);
  if (speed > MAX_BALL_SPEED) {
    const scale = MAX_BALL_SPEED / speed;
    ball.vx *= scale;
    ball.vy *= scale;
  }
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

// Shared "is anyone dribbling/contesting the ball right now" push — applied
// whenever a body (player or AI) is within touching range of the ball and
// isn't mid-charge. `pushMult` lets defenders' tackles feel more forceful
// on higher difficulty than a plain dribble touch.
function pushBall(ball: Ball, fromX: number, fromY: number, pushMult: number): void {
  const d = dist(fromX, fromY, ball.x, ball.y) || 1;
  const nx = (ball.x - fromX) / d;
  const ny = (ball.y - fromY) / d;
  ball.vx += nx * PUSH_FORCE * pushMult;
  ball.vy += ny * PUSH_FORCE * pushMult;
}

function stepPlayer(state: SoccerState, input: EngineInput, dtMs: number, tsMs: number, events: SoccerEvents): void {
  const { width, height, player, ball } = state;
  const { goalHalf } = goalBounds(height);

  let dx = 0;
  let dy = 0;
  if (input.moveLeft) dx -= 1;
  if (input.moveRight) dx += 1;
  if (input.moveUp) dy -= 1;
  if (input.moveDown) dy += 1;
  const moving = dx !== 0 || dy !== 0;

  // stamina drain/regen, then derive this frame's speed cap from it
  if (moving) {
    player.stamina = Math.max(0, player.stamina - STAMINA_DRAIN_PER_MS * dtMs);
  } else {
    player.stamina = Math.min(STAMINA_MAX, player.stamina + STAMINA_REGEN_PER_MS * dtMs);
  }
  const lowStamina = player.stamina < STAMINA_LOW_THRESHOLD;
  let speed = lowStamina ? PLAYER_LOW_STAMINA_SPEED : PLAYER_BASE_SPEED;

  // skill-move dodge: detect a fast moveLeft<->moveRight reversal near a
  // defender while dribbling, and grant a brief speed burst.
  if (player.prevMoveLeft && !input.moveLeft) player.leftReleasedAt = tsMs;
  if (player.prevMoveRight && !input.moveRight) player.rightReleasedAt = tsMs;
  const distToBallForDodge = dist(player.x, player.y, ball.x, ball.y);
  const nearestDefenderDist = Math.min(
    dist(player.x, player.y, state.opp1.x, state.opp1.y),
    dist(player.x, player.y, state.opp2.x, state.opp2.y)
  );
  const canDodge = tsMs >= player.dodgeCooldownUntil && distToBallForDodge < player.r + ball.r + 30 && nearestDefenderDist < DODGE_DEFENDER_RANGE;
  if (canDodge) {
    const reversedToRight = input.moveRight && !player.prevMoveRight && player.leftReleasedAt !== null && tsMs - player.leftReleasedAt < DODGE_REVERSAL_WINDOW_MS;
    const reversedToLeft = input.moveLeft && !player.prevMoveLeft && player.rightReleasedAt !== null && tsMs - player.rightReleasedAt < DODGE_REVERSAL_WINDOW_MS;
    if (reversedToRight || reversedToLeft) {
      player.dodgeUntil = tsMs + DODGE_BOOST_MS;
      player.dodgeCooldownUntil = tsMs + DODGE_COOLDOWN_MS;
      events.skillMove = true;
    }
  }
  if (tsMs < player.dodgeUntil) speed *= DODGE_SPEED_MULT;
  player.prevMoveLeft = input.moveLeft;
  player.prevMoveRight = input.moveRight;

  if (moving) {
    const len = Math.hypot(dx, dy) || 1;
    player.x += (dx / len) * speed;
    player.y += (dy / len) * speed;
  }
  player.x = Math.max(player.r, Math.min(width - player.r, player.x));
  player.y = Math.max(player.r, Math.min(height - player.r, player.y));

  // charge-up shot: hold primaryAction near the ball to charge, release to
  // fire. A quick tap (down and up within the same/next tick) still fires a
  // weak instant shot — see SHOT_POWER_MIN.
  const distToBall = dist(player.x, player.y, ball.x, ball.y);
  const nearBall = distToBall < player.r + ball.r + 10;
  if (nearBall && input.primaryAction) {
    if (player.chargeStart === null) player.chargeStart = tsMs;
  } else if (player.chargeStart !== null) {
    const heldMs = tsMs - player.chargeStart;
    player.chargeStart = null;
    if (tsMs - state.lastKick > KICK_COOLDOWN) {
      const t = Math.min(1, heldMs / CHARGE_MAX_MS);
      const power = SHOT_POWER_MIN + t * (SHOT_POWER_MAX - SHOT_POWER_MIN);
      const spread = 1 - t * 0.7;
      state.lastKick = tsMs;
      shoot(ball, width, height, goalHalf, true, power, spread);
      events.shotFired = true;
    }
  } else if (nearBall) {
    // gentle dribble push so just running into the ball moves it
    pushBall(ball, player.x, player.y, 1);
  }
  if (!nearBall) player.chargeStart = null;
}

// Shared reaction-cadence AI used for the teammate and both opponents.
// `chase` is decided by the caller (whichever member of a side is closest
// to the ball chases it; the other holds a supporting position).
function stepAI(
  ai: AIChar,
  state: SoccerState,
  dtMs: number,
  tsMs: number,
  opts: {
    chase: boolean;
    speed: number;
    reactionMs: number;
    towardRightGoal: boolean;
    shootAggro: number;
    chargeMs: number;
    shotPower: number;
    tacklePush: number;
    supportTarget: { x: number; y: number };
  },
  events: SoccerEvents
): void {
  const { width, height, ball } = state;
  const { goalHalf } = goalBounds(height);
  ai.brain += dtMs;

  // finish a committed shot once its charge duration elapses, regardless of
  // decision cadence (the charge itself isn't gated by the reaction timer).
  if (ai.chargeUntil !== null) {
    if (tsMs >= ai.chargeUntil) {
      ai.chargeUntil = null;
      if (tsMs - state.lastKick > KICK_COOLDOWN) {
        state.lastKick = tsMs;
        shoot(ball, width, height, goalHalf, opts.towardRightGoal, opts.shotPower, 0.6);
        events.shotFired = true;
      }
    }
    // hold position while charging rather than continuing to path-find
    ai.x = Math.max(ai.r, Math.min(width - ai.r, ai.x));
    ai.y = Math.max(ai.r, Math.min(height - ai.r, ai.y));
    return;
  }

  const distToBall = dist(ai.x, ai.y, ball.x, ball.y);
  if (opts.chase && distToBall < ai.r + ball.r + 8) {
    pushBall(ball, ai.x, ai.y, opts.tacklePush);
  }

  // re-decide a movement target only every `reactionMs` — this is what
  // keeps them from looking robotically perfect.
  if (ai.brain >= opts.reactionMs) {
    ai.brain = 0;
    const targetX = opts.chase ? ball.x : opts.supportTarget.x;
    const targetY = opts.chase ? ball.y : opts.supportTarget.y;
    const tdx = targetX - ai.x;
    const tdy = targetY - ai.y;
    const tlen = Math.hypot(tdx, tdy) || 1;
    ai.vx = (tdx / tlen) * opts.speed;
    ai.vy = (tdy / tlen) * opts.speed;

    if (opts.chase && distToBall < ai.r + ball.r + 8 && Math.random() < opts.shootAggro) {
      ai.chargeUntil = tsMs + opts.chargeMs;
    }
  }

  ai.x += ai.vx;
  ai.y += ai.vy;
  ai.x = Math.max(ai.r, Math.min(width - ai.r, ai.x));
  ai.y = Math.max(ai.r, Math.min(height - ai.r, ai.y));
}

function stepBallPhysics(state: SoccerState, events: SoccerEvents): void {
  const { width, height, ball } = state;
  const { goalTop, goalBottom } = goalBounds(height);

  ball.x += ball.vx;
  ball.y += ball.vy;
  ball.vx *= BALL_FRICTION;
  ball.vy *= BALL_FRICTION;
  capBallSpeed(ball);

  if (ball.y < ball.r) {
    ball.y = ball.r;
    ball.vy *= -0.7;
  } else if (ball.y > height - ball.r) {
    ball.y = height - ball.r;
    ball.vy *= -0.7;
  }

  const inGoalMouth = ball.y > goalTop && ball.y < goalBottom;
  if (ball.x < ball.r) {
    if (inGoalMouth) {
      state.cpuGoals += 1;
      events.cpuGoal = true;
      Object.assign(ball, resetBall(width, height));
    } else {
      ball.x = ball.r;
      ball.vx *= -0.7;
    }
  } else if (ball.x > width - ball.r) {
    if (inGoalMouth) {
      state.playerGoals += 1;
      events.playerGoal = true;
      events.score = state.playerGoals * 100;
      Object.assign(ball, resetBall(width, height));
    } else {
      ball.x = width - ball.r;
      ball.vx *= -0.7;
    }
  }
}

function finishMatch(state: SoccerState, events: SoccerEvents): void {
  state.phase = "over";
  state.over = true;
  const won = state.playerGoals > state.cpuGoals;
  const finalScore = state.playerGoals * 100 + (won ? 200 : 0);
  events.finalWhistle = true;
  events.won = won;
  events.score = finalScore;
  events.gameOver = finalScore;
}

function createShootout(width: number, height: number): ShootoutState {
  return {
    turn: "player",
    stage: "aiming",
    playerAttempts: [],
    cpuAttempts: [],
    suddenDeath: false,
    winner: null,
    ballX: width * 0.78,
    ballY: height / 2,
    shotDir: 0,
    chargeStart: null,
    keeperDiveDir: null,
    resolveAt: null,
    lastOutcome: null,
  };
}

// Only meaningful to call once both sides have taken the same number of
// attempts — i.e. right after the CPU's attempt resolves, since the player
// always shoots first each round (see stepShootout's turn order below).
// Calling this after the player's attempt alone would compare an unequal
// N-vs-(N-1) tally and could crown a winner before the CPU even replies.
function evaluateShootout(so: ShootoutState): void {
  const attemptsEach = so.playerAttempts.length;
  if (attemptsEach !== so.cpuAttempts.length || attemptsEach === 0) return;
  if (attemptsEach < 3 && !so.suddenDeath) return;
  const pMakes = so.playerAttempts.filter(Boolean).length;
  const cMakes = so.cpuAttempts.filter(Boolean).length;
  if (pMakes !== cMakes) {
    so.winner = pMakes > cMakes ? "player" : "cpu";
  } else {
    so.suddenDeath = true;
  }
}

function stepShootout(state: SoccerState, input: EngineInput, _dtMs: number, tsMs: number, events: SoccerEvents): void {
  const so = state.shootout;
  if (!so) return;
  const saveChance = SHOOTOUT_KEEPER_SAVE_CHANCE[state.difficulty];
  const cpuMakeChance = SHOOTOUT_CPU_MAKE_CHANCE[state.difficulty];

  if (so.winner) {
    finishMatch(state, events);
    return;
  }

  if (so.stage === "resolving") {
    if (so.resolveAt !== null && tsMs >= so.resolveAt) {
      if (so.turn === "player") so.playerAttempts.push(so.lastOutcome === "goal");
      else so.cpuAttempts.push(so.lastOutcome === "goal");
      events.shootoutAttemptResolved = so.lastOutcome ?? undefined;
      evaluateShootout(so);
      so.turn = so.turn === "player" ? "cpu" : "player";
      so.stage = "aiming";
      so.shotDir = 0;
      so.chargeStart = null;
      so.keeperDiveDir = null;
      so.resolveAt = null;
      so.lastOutcome = null;
    }
    return;
  }

  // stage === "aiming"
  if (so.turn === "cpu") {
    // brief "windup" before simulating the attempt, so there's still
    // something to look at rather than an instant result.
    if (so.resolveAt === null) {
      so.resolveAt = tsMs + SHOOTOUT_CPU_WINDUP_MS;
      so.shotDir = Math.random() < 0.5 ? -1 : 1;
      return;
    }
    if (tsMs < so.resolveAt) return;
    const made = Math.random() < cpuMakeChance;
    so.keeperDiveDir = made ? (Math.random() < 0.5 ? (-so.shotDir as -1 | 1) : 0) : so.shotDir;
    so.lastOutcome = made ? "goal" : "save";
    so.stage = "resolving";
    so.resolveAt = tsMs + SHOOTOUT_RESOLVE_MS;
    return;
  }

  // player's turn: aim with left/right, charge-shoot with primaryAction
  if (input.moveLeft) so.shotDir = -1;
  else if (input.moveRight) so.shotDir = 1;

  if (input.primaryAction) {
    if (so.chargeStart === null) so.chargeStart = tsMs;
    return;
  }
  if (so.chargeStart === null) return; // never started a charge this attempt yet

  const heldMs = tsMs - so.chargeStart;
  so.chargeStart = null;
  const t = Math.min(1, heldMs / CHARGE_MAX_MS);
  // Keeper commits its dive only now, at the moment the player actually
  // releases the shot — not psychically beforehand. Save chance shrinks a
  // bit against a well-charged (more accurate) shot.
  const effectiveSaveChance = saveChance * (1 - t * 0.4);
  const saved = Math.random() < effectiveSaveChance;
  so.keeperDiveDir = saved ? so.shotDir : (Math.random() < 0.5 ? (-so.shotDir as -1 | 1) : 0);
  so.lastOutcome = saved ? "save" : "goal";
  so.stage = "resolving";
  so.resolveAt = tsMs + SHOOTOUT_RESOLVE_MS;
}

export function step(state: SoccerState, input: EngineInput, dtMs: number, tsMs: number): SoccerEvents {
  if (state.over) return {};
  const events: SoccerEvents = {};

  if (state.phase === "halftime") {
    if (state.halftimeUntil !== null && tsMs >= state.halftimeUntil) {
      state.phase = "playing";
      state.half = 2;
      state.timeLeft = HALF_MS;
      state.halftimeUntil = null;
      resetPositions(state);
      state.player.stamina = STAMINA_MAX;
      events.secondHalfStarted = true;
    }
    return events;
  }

  if (state.phase === "shootout") {
    stepShootout(state, input, dtMs, tsMs, events);
    return events;
  }

  // phase === "playing"
  stepPlayer(state, input, dtMs, tsMs, events);

  const teammateDist = dist(state.teammate.x, state.teammate.y, state.ball.x, state.ball.y);
  const playerDist = dist(state.player.x, state.player.y, state.ball.x, state.ball.y);
  stepAI(
    state.teammate,
    state,
    dtMs,
    tsMs,
    {
      chase: teammateDist < playerDist,
      speed: TEAMMATE_SPEED,
      reactionMs: TEAMMATE_REACTION_MS,
      towardRightGoal: true,
      shootAggro: TEAMMATE_SHOOT_AGGRO,
      chargeMs: TEAMMATE_CHARGE_MS,
      shotPower: TEAMMATE_SHOT_POWER,
      tacklePush: 1,
      // Drift toward open space on the attacking (right) side of the field,
      // offset vertically away from the ball so it doesn't just stack on
      // top of whoever has it.
      supportTarget: { x: state.width * 0.68, y: state.ball.y < state.height / 2 ? state.height * 0.7 : state.height * 0.3 },
    },
    events
  );

  const opp1Dist = dist(state.opp1.x, state.opp1.y, state.ball.x, state.ball.y);
  const opp2Dist = dist(state.opp2.x, state.opp2.y, state.ball.x, state.ball.y);
  const opp1Chases = opp1Dist <= opp2Dist;
  const diff = state.difficulty;
  stepAI(
    state.opp1,
    state,
    dtMs,
    tsMs,
    {
      chase: opp1Chases,
      speed: CPU_SPEED[diff],
      reactionMs: CPU_REACTION_MS[diff],
      towardRightGoal: false,
      shootAggro: CPU_SHOOT_AGGRO[diff],
      chargeMs: CPU_CHARGE_MS[diff],
      shotPower: CPU_SHOT_POWER[diff],
      tacklePush: CPU_TACKLE_PUSH[diff],
      // Hold a defensive line between the ball and their own goal (x=width),
      // marking the player's height so they don't collapse to one spot.
      supportTarget: { x: state.width * 0.62, y: (state.player.y + state.ball.y) / 2 },
    },
    events
  );
  stepAI(
    state.opp2,
    state,
    dtMs,
    tsMs,
    {
      chase: !opp1Chases,
      speed: CPU_SPEED[diff],
      reactionMs: CPU_REACTION_MS[diff],
      towardRightGoal: false,
      shootAggro: CPU_SHOOT_AGGRO[diff],
      chargeMs: CPU_CHARGE_MS[diff],
      shotPower: CPU_SHOT_POWER[diff],
      tacklePush: CPU_TACKLE_PUSH[diff],
      supportTarget: { x: state.width * 0.62, y: state.height - (state.player.y + state.ball.y) / 2 },
    },
    events
  );

  stepBallPhysics(state, events);

  state.timeLeft -= dtMs;
  if (state.timeLeft <= 0) {
    if (state.half === 1) {
      state.phase = "halftime";
      state.halftimeUntil = tsMs + HALFTIME_PAUSE_MS;
      events.halftimeStarted = true;
    } else if (state.playerGoals === state.cpuGoals) {
      state.phase = "shootout";
      state.shootout = createShootout(state.width, state.height);
      events.shootoutStarted = true;
    } else {
      finishMatch(state, events);
    }
  }

  return events;
}
