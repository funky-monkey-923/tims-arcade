// Pure game logic for Kickoff Clash (2D soccer) — no React, no canvas, no
// DOM, and no audio: sound effects are decided by the UI layer from the
// events this module returns. See src/games/engineTypes.ts for the shared
// contract, and render.ts / KickoffClash.tsx for the other two-thirds of
// the split.

import type { EngineInput, EngineEvents } from "../engineTypes";

const MATCH_MS = 60000;
const PLAYER_SPEED = 3.4;
const CPU_SPEED = 2.6; // slightly slower than the player: easy mode
const BALL_FRICTION = 0.985;
const KICK_COOLDOWN = 380;
// A hard shot (power 10, see `shoot()` calls below) should be close to the
// fastest the ball ever goes — this caps runaway speed from sustained
// dribble-push contact (e.g. pinning the ball against a wall every frame).
const MAX_BALL_SPEED = 11;

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

export interface SoccerState {
  width: number;
  height: number;
  player: Entity;
  cpu: Entity;
  ball: Ball;
  playerGoals: number;
  cpuGoals: number;
  timeLeft: number;
  over: boolean;
  // Shared kick cooldown timer used by both the player's shoot action and
  // the CPU defender's occasional clearance — a plain number on state
  // instead of a ref, since engine.ts has no React.
  lastKick: number;
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
}

function resetBall(width: number, height: number): Ball {
  return { x: width / 2, y: height / 2, vx: 0, vy: 0, r: Math.max(7, width * 0.02) };
}

export function createState(width: number, height: number): SoccerState {
  return {
    width,
    height,
    player: { x: width * 0.3, y: height / 2, r: Math.max(12, width * 0.035) },
    cpu: { x: width * 0.7, y: height / 2, r: Math.max(12, width * 0.035) },
    ball: resetBall(width, height),
    playerGoals: 0,
    cpuGoals: 0,
    timeLeft: MATCH_MS,
    over: false,
    lastKick: 0,
  };
}

function goalBounds(height: number): { goalHalf: number; goalTop: number; goalBottom: number } {
  const goalHalf = height * 0.16;
  return { goalHalf, goalTop: height / 2 - goalHalf, goalBottom: height / 2 + goalHalf };
}

function shoot(ball: Ball, width: number, height: number, goalHalf: number, towardRightGoal: boolean, power: number): void {
  const targetX = towardRightGoal ? width : 0;
  const targetY = height / 2 + (Math.random() - 0.5) * goalHalf;
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

export function step(state: SoccerState, input: EngineInput, dtMs: number, tsMs: number): SoccerEvents {
  if (state.over) return {};

  const { width, height } = state;
  const { goalHalf, goalTop, goalBottom } = goalBounds(height);
  const events: SoccerEvents = {};
  const { player, cpu, ball } = state;

  // player movement
  let dx = 0;
  let dy = 0;
  if (input.moveLeft) dx -= 1;
  if (input.moveRight) dx += 1;
  if (input.moveUp) dy -= 1;
  if (input.moveDown) dy += 1;
  if (dx || dy) {
    const len = Math.hypot(dx, dy) || 1;
    player.x += (dx / len) * PLAYER_SPEED;
    player.y += (dy / len) * PLAYER_SPEED;
  }
  player.x = Math.max(player.r, Math.min(width - player.r, player.x));
  player.y = Math.max(player.r, Math.min(height - player.r, player.y));

  // shoot on confirm, when close enough to the ball
  const distToBall = Math.hypot(ball.x - player.x, ball.y - player.y);
  if (input.primaryAction && tsMs - state.lastKick > KICK_COOLDOWN && distToBall < player.r + ball.r + 10) {
    state.lastKick = tsMs;
    shoot(ball, width, height, goalHalf, true, 10);
    events.shotFired = true;
  } else if (distToBall < player.r + ball.r) {
    // gentle dribble push so just running into the ball moves it
    const nx = (ball.x - player.x) / (distToBall || 1);
    const ny = (ball.y - player.y) / (distToBall || 1);
    ball.vx += nx * 1.6;
    ball.vy += ny * 1.6;
  }
  capBallSpeed(ball);

  // cpu defender AI: chase the ball, clear it toward the player's goal when close
  const cdx = ball.x - cpu.x;
  const cdy = ball.y - cpu.y;
  const cdist = Math.hypot(cdx, cdy) || 1;
  if (cdist > 4) {
    cpu.x += (cdx / cdist) * CPU_SPEED;
    cpu.y += (cdy / cdist) * CPU_SPEED;
  }
  cpu.x = Math.max(cpu.r, Math.min(width - cpu.r, cpu.x));
  cpu.y = Math.max(cpu.r, Math.min(height - cpu.r, cpu.y));
  if (cdist < cpu.r + ball.r + 6 && tsMs - state.lastKick > 500 && Math.random() < 0.05) {
    state.lastKick = tsMs;
    shoot(ball, width, height, goalHalf, false, 7.5);
    events.shotFired = true;
  }

  // ball physics
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

  state.timeLeft -= dtMs;
  if (state.timeLeft <= 0) {
    state.over = true;
    const won = state.playerGoals > state.cpuGoals;
    const finalScore = state.playerGoals * 100 + (won ? 200 : 0);
    events.finalWhistle = true;
    events.won = won;
    events.score = finalScore;
    events.gameOver = finalScore;
  }

  return events;
}
