// Pure game logic for Turbo Dash — no React, no canvas, no DOM, and no
// audio calls (playEngineLoop/setEngineRate/stopEngineLoop are side-
// effecting and belong to the UI layer's own mount/unmount effect; sound
// effects like skid/nitro/crash are decided by the UI layer from the
// EngineEvents this module returns). See src/games/engineTypes.ts for the
// shared contract, and render.ts / TurboDash.tsx for the other two-thirds
// of the split.

import type { EngineInput, EngineEvents } from "../engineTypes";

export const LANES = 3;
export const BASE_SPEED = 3.2;
export const MAX_SPEED = 8.5;
const ACCEL = 0.0006; // per ms, easy/gradual ramp-up
export const NITRO_MS = 1300;
export const NITRO_COOLDOWN = 4500;

// --- Circuit-racing additions -----------------------------------------
// Lap length is in the same distance units as `state.distance`
// (state.distance += state.speed once per tick, i.e. not dt-scaled —
// that matches the pre-existing convention in this file, where
// roadOffset/distance already assume a ~60fps rAF cadence rather than
// integrating over dtMs; ACCEL is the only thing here that's dt-scaled).
// At a steady MAX_SPEED cruise (8.5 * ~60fps ≈ 510 units/sec) 15000
// units/lap works out to ~29s/lap once the player's ramped up to top
// speed, and ~30-35s for the first lap while ACCEL is still ramping up
// from BASE_SPEED — comfortably inside the requested 20-40s/lap window.
export const TOTAL_LAPS = 3;
export const LAP_LENGTH = 15000;
// Repeated-crash consolation/DNF threshold: the previous version of this
// game ended the run on the very first crash. That can't work once a
// run is a multi-lap race (an early crash would prematurely end what's
// supposed to be a lap contest), so crashing now costs a speed penalty
// (see CRASH_SPEED_MULT below, reused by both the player and the AI
// racers so the penalty "feels" the same for everyone) and only ends
// the run — as a DNF — after MAX_CRASHES.
export const MAX_CRASHES = 5;
export const CRASH_SPEED_MULT = 0.4;
export const CRASH_PENALTY_MS = 1200;

export type Difficulty = "easy" | "medium" | "hard";

interface DifficultyConfig {
  speedMult: number;
  avoidChance: number;
  reactionMs: number;
}

const DIFFICULTY_CONFIG: Record<Difficulty, DifficultyConfig> = {
  easy: { speedMult: 0.85, avoidChance: 0.6, reactionMs: 700 },
  medium: { speedMult: 1.0, avoidChance: 0.8, reactionMs: 450 },
  hard: { speedMult: 1.15, avoidChance: 0.92, reactionMs: 250 },
};

// Roughly the player's own cruising speed without leaning on nitro (player
// speed ramps from BASE_SPEED to MAX_SPEED and mostly sits near the top) —
// this is each AI racer's speed baseline before difficulty/variance.
const AI_BASE_SPEED = 7.2;

const AI_ROSTER: { name: string; color: string }[] = [
  { name: "Red Comet", color: "#ff4d8d" },
  { name: "Blue Blaze", color: "#2ee6d6" },
  { name: "Gold Rush", color: "#ffd43b" },
];

const POSITION_POINTS = [1000, 700, 450, 250];
const LAP_BANNER_MS = 2000;

export interface AiRacer {
  id: string;
  name: string;
  color: string;
  lane: number;
  distance: number;
  // Countdown timer gating how often this racer re-evaluates lane changes —
  // mirrors the fighter game's cpuBrain reaction-time accumulator pattern
  // so AI avoidance isn't frame-perfect/robotic.
  laneChangeCooldownMs: number;
  // Seeded once at creation (not re-rolled per frame) so each racer holds a
  // consistent, slightly-different pace all race long.
  speedVariance: number;
  // tsMs until which this racer is running at CRASH_SPEED_MULT after a
  // failed obstacle-avoidance roll.
  penalizedUntil: number;
  finished: boolean;
}

export interface Obstacle {
  lane: number;
  y: number;
  passed: boolean;
  // Stable index into OBSTACLE_CAR_SPRITES, chosen once at spawn so the
  // same obstacle keeps the same car sprite across frames instead of
  // re-randomizing (which would look like it's flickering between cars).
  spriteIndex: number;
}

export interface RacingState {
  lane: number;
  x: number;
  speed: number;
  distance: number;
  obstacles: Obstacle[];
  roadOffset: number;
  nitroUntil: number;
  dead: boolean;
  // Edge-detection for discrete lane changes (so holding the key doesn't
  // skip multiple lanes) — this is gameplay logic, so it lives in state
  // rather than as closure variables in the UI layer.
  prevLeft: boolean;
  prevRight: boolean;
  lastNitroAt: number;
  lastSpawnAt: number;
  width: number;
  height: number;
  // Circuit-racing state
  difficulty: Difficulty;
  lap: number;
  totalLaps: number;
  lapLength: number;
  finished: boolean;
  dnf: boolean;
  finishTimeMs: number | null;
  // Stamped from the first step()'s tsMs (createState has no timestamp
  // parameter per this codebase's engine contract, so this is lazily
  // initialized to -1 and set on the first tick instead).
  raceStartTs: number;
  crashCount: number;
  aiRacers: AiRacer[];
  lapBannerLap: number;
  lapBannerUntil: number;
}

// Extends the generic contract with racing-specific event flags the UI
// layer uses to decide which one-shot sfx to play this frame.
export interface RacingEvents extends EngineEvents {
  laneChange?: boolean;
  nitroActivated?: boolean;
  obstacleSmashed?: boolean;
  crashed?: boolean;
  lapComplete?: number;
  raceFinished?: boolean;
}

export function laneX(width: number, lane: number): number {
  const laneW = width / LANES;
  return laneW * lane + laneW / 2;
}

function spawnObstacle(height: number): Obstacle {
  return {
    lane: Math.floor(Math.random() * LANES),
    y: -height * 0.15,
    passed: false,
    spriteIndex: Math.floor(Math.random() * 4),
  };
}

export function createState(width: number, height: number, difficulty: Difficulty = "medium"): RacingState {
  return {
    lane: 1,
    x: laneX(width, 1),
    speed: BASE_SPEED,
    distance: 0,
    obstacles: [spawnObstacle(height)],
    roadOffset: 0,
    nitroUntil: 0,
    dead: false,
    prevLeft: false,
    prevRight: false,
    lastNitroAt: -99999,
    lastSpawnAt: 0,
    width,
    height,
    difficulty,
    lap: 1,
    totalLaps: TOTAL_LAPS,
    lapLength: LAP_LENGTH,
    finished: false,
    dnf: false,
    finishTimeMs: null,
    raceStartTs: -1,
    crashCount: 0,
    aiRacers: AI_ROSTER.map((r, i) => ({
      id: `ai-${i}`,
      name: r.name,
      color: r.color,
      lane: i % LANES,
      distance: 0,
      laneChangeCooldownMs: 0,
      speedVariance: 1 + (Math.random() * 0.16 - 0.08),
      penalizedUntil: 0,
      finished: false,
    })),
    lapBannerLap: 0,
    lapBannerUntil: 0,
  };
}

export function getPlayerPosition(state: RacingState): number {
  return 1 + state.aiRacers.filter((ai) => ai.distance > state.distance).length;
}

function computeFinishScore(state: RacingState): number {
  const position = Math.min(getPlayerPosition(state), POSITION_POINTS.length);
  const positionPoints = POSITION_POINTS[position - 1];
  // "Par" = time to cover the full race distance at a steady MAX_SPEED
  // cruise (same ~60fps-tick assumption as everywhere else in this file).
  // Finishing right at par gives ~0 bonus; finishing well under par
  // (heavy, well-timed nitro use) climbs toward the full 300, clamped so a
  // slow finish never goes negative.
  const parMs = ((state.totalLaps * state.lapLength) / (MAX_SPEED * 60)) * 1000;
  const finishMs = state.finishTimeMs ?? parMs;
  const timeBonus = Math.max(0, Math.min(300, Math.round(((parMs - finishMs) / parMs) * 300)));
  return positionPoints + timeBonus;
}

function computeDnfScore(state: RacingState): number {
  const lapsCompleted = Math.max(0, state.lap - 1);
  const intoLap = state.distance - lapsCompleted * state.lapLength;
  const fraction = Math.max(0, Math.min(1, intoLap / state.lapLength));
  return Math.round(lapsCompleted * 100 + fraction * 100);
}

// Reaction-gated obstacle avoidance for one AI racer, modeled on the
// fighter game's cpuBrain accumulator: this only re-evaluates on a
// difficulty-dependent cadence rather than every frame, so avoidance
// doesn't look frame-perfect/robotic.
function stepAiRacer(ai: AiRacer, state: RacingState, dtMs: number, tsMs: number): void {
  if (ai.finished) return;
  const cfg = DIFFICULTY_CONFIG[state.difficulty];

  ai.laneChangeCooldownMs -= dtMs;
  if (ai.laneChangeCooldownMs <= 0) {
    ai.laneChangeCooldownMs = cfg.reactionMs;
    // Lookahead window around the player's own car row (height * 0.78) —
    // an obstacle in this band is "coming up soon" for whichever lane it's
    // in, same idea as the player's own overlap check just widened into a
    // window so the AI has time to react instead of only detecting the
    // collision at the instant it happens.
    const inThreatZone = (o: Obstacle) => o.y > state.height * 0.3 && o.y < state.height * 0.85;
    const threat = state.obstacles.find((o) => o.lane === ai.lane && inThreatZone(o));
    if (threat) {
      if (Math.random() < cfg.avoidChance) {
        const otherLanes = [0, 1, 2].filter((l) => l !== ai.lane);
        const clearLane = otherLanes.find((l) => !state.obstacles.some((o) => o.lane === l && inThreatZone(o)));
        if (clearLane !== undefined) ai.lane = clearLane;
      } else {
        // Failed to avoid — same speed penalty the player takes on a
        // crash (CRASH_SPEED_MULT), just applied as a timed window since
        // the AI has no persistent "speed" stat of its own to knock down.
        ai.penalizedUntil = tsMs + CRASH_PENALTY_MS;
      }
    }
  }

  const penalized = tsMs < ai.penalizedUntil ? CRASH_SPEED_MULT : 1;
  ai.distance += AI_BASE_SPEED * cfg.speedMult * ai.speedVariance * penalized;
  if (ai.distance >= state.totalLaps * state.lapLength) ai.finished = true;
}

export function step(state: RacingState, input: EngineInput, dtMs: number, tsMs: number): RacingEvents {
  if (state.dead) return {};
  if (state.raceStartTs < 0) state.raceStartTs = tsMs;

  const events: RacingEvents = {};
  const { width, height } = state;
  const carH = height * 0.11;

  // discrete lane change on the rising edge of left/right
  if (input.moveLeft && !state.prevLeft) {
    state.lane = Math.max(0, state.lane - 1);
    events.laneChange = true;
  }
  if (input.moveRight && !state.prevRight) {
    state.lane = Math.min(LANES - 1, state.lane + 1);
    events.laneChange = true;
  }
  state.prevLeft = input.moveLeft;
  state.prevRight = input.moveRight;
  state.x += (laneX(width, state.lane) - state.x) * 0.25;

  if (input.primaryAction && tsMs - state.lastNitroAt > NITRO_COOLDOWN) {
    state.lastNitroAt = tsMs;
    state.nitroUntil = tsMs + NITRO_MS;
    events.nitroActivated = true;
  }
  const nitroActive = tsMs < state.nitroUntil;

  state.speed = Math.min(MAX_SPEED, state.speed + ACCEL * dtMs) * (nitroActive ? 1.6 : 1);
  state.distance += state.speed;
  state.roadOffset = (state.roadOffset + state.speed) % (height * 0.2);
  events.score = Math.floor(state.distance / 8);

  state.aiRacers.forEach((ai) => stepAiRacer(ai, state, dtMs, tsMs));

  if (!state.finished && state.distance >= state.lap * state.lapLength) {
    state.lap += 1;
    if (state.lap > state.totalLaps) {
      state.finished = true;
      state.finishTimeMs = tsMs - state.raceStartTs;
    } else {
      events.lapComplete = state.lap;
      state.lapBannerLap = state.lap;
      state.lapBannerUntil = tsMs + LAP_BANNER_MS;
    }
  }

  if (state.finished) {
    state.dead = true;
    events.raceFinished = true;
    events.gameOver = computeFinishScore(state);
    return events;
  }

  if (tsMs - state.lastSpawnAt > Math.max(420, 900 - state.speed * 60)) {
    state.lastSpawnAt = tsMs;
    state.obstacles.push(spawnObstacle(height));
  }

  const carY = height * 0.78;
  state.obstacles.forEach((o) => {
    o.y += state.speed;
  });
  for (let i = state.obstacles.length - 1; i >= 0; i--) {
    const o = state.obstacles[i];
    if (o.y > height + carH) {
      state.obstacles.splice(i, 1);
      continue;
    }
    const sameLane = o.lane === state.lane;
    const overlap = Math.abs(o.y - carY) < carH * 0.75;
    if (sameLane && overlap) {
      if (nitroActive) {
        state.obstacles.splice(i, 1);
        state.distance += 200;
        events.obstacleSmashed = true;
        events.score = Math.floor(state.distance / 8);
      } else {
        // Crashing costs speed rather than instantly ending the run (see
        // MAX_CRASHES/CRASH_SPEED_MULT above) — the run only ends here as
        // a DNF once the player has crashed too many times to plausibly
        // finish.
        state.obstacles.splice(i, 1);
        state.crashCount += 1;
        state.speed = Math.max(BASE_SPEED, state.speed * CRASH_SPEED_MULT);
        events.crashed = true;
        if (state.crashCount >= MAX_CRASHES) {
          state.dead = true;
          state.dnf = true;
          events.raceFinished = false;
          events.gameOver = computeDnfScore(state);
          return events;
        }
      }
    }
  }

  return events;
}
