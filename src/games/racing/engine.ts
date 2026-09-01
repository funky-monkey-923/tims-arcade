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
}

// Extends the generic contract with racing-specific event flags the UI
// layer uses to decide which one-shot sfx to play this frame.
export interface RacingEvents extends EngineEvents {
  laneChange?: boolean;
  nitroActivated?: boolean;
  obstacleSmashed?: boolean;
  crashed?: boolean;
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

export function createState(width: number, height: number): RacingState {
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
  };
}

export function step(state: RacingState, input: EngineInput, dtMs: number, tsMs: number): RacingEvents {
  if (state.dead) return {};

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
        state.dead = true;
        events.crashed = true;
        events.gameOver = Math.floor(state.distance / 8);
        return events;
      }
    }
  }

  return events;
}
