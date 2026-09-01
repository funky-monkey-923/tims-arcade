// All CanvasRenderingContext2D calls for Munch Maze live here — the "UI"
// half's rendering concern, kept separate from engine.ts's game rules.
//
// Cosmetic-only state (particles, screen shake, ghost bob phase, the
// wave-clear banner) lives at module scope here, never in engine state — see
// the file-level note in src/lib/particles.ts for why. MunchMaze.tsx calls
// the small trigger functions below from the same `if (events.…)` blocks
// where it already plays sfx, and calls resetEffects() whenever a fresh run
// starts (GameShell fully unmounts/remounts between playthroughs, and this
// module's state would otherwise leak into the next one).

import { SPRITES, GHOST_SPRITES, isReady } from "../../lib/sprites";
import { ROWS, COLS, type MazeState, type GhostPersonality } from "./engine";
import { ParticleField, ScreenShake } from "../../lib/particles";
import { drawLabel, drawBanner } from "../../lib/canvasText";
import { motion } from "../../lib/motion";

// Fixed personality -> sprite mapping so a given personality always looks
// the same regardless of which wave first spawns it (see ghostCountForWave
// in engine.ts) — a kid can learn "the spiky one always hunts me" once and
// have it hold across every wave.
const PERSONALITY_SPRITE_INDEX: Record<GhostPersonality, number> = {
  chaser: 3, // ghostSpike — the always-aggressive hunter gets the spikiest look
  ambusher: 1, // ghostFly — swoops ahead to cut the player off
  wanderer: 2, // ghostFloat — aimless drifting
  lateActivator: 0, // ghostWalk — plain-looking until it "wakes up"
};

// Per-personality phase offset for the idle float/bob below, so the 4
// ghosts never bob in lockstep even though they share the same waveform.
const PERSONALITY_BOB_PHASE: Record<GhostPersonality, number> = {
  chaser: 0,
  lateActivator: 1.4,
  wanderer: 2.6,
  ambusher: 4.2,
};

// ---- Cosmetic-only module state ------------------------------------------

const particles = new ParticleField();
const shake = new ScreenShake();
let lastDrawTs: number | null = null;

const WAVE_BANNER_MS = 1600;
let waveBannerStart: number | null = null;

interface PendingGhostEaten {
  r: number;
  c: number;
  startR: number;
  startC: number;
}
let pendingGhostEaten: PendingGhostEaten[] = [];

interface PendingPlayerCaught {
  r: number;
  c: number;
}
let pendingPlayerCaught: PendingPlayerCaught[] = [];

// A small offscreen layer reused every frame to composite the player's
// mouth cutout onto the shaded body sprite (destination-out only erases
// pixels already painted onto ITS OWN canvas, so this has to happen off of
// the main context or it would eat into the maze/dots drawn underneath).
let playerLayer: HTMLCanvasElement | null = null;
function getPlayerLayer(size: number): HTMLCanvasElement {
  if (!playerLayer) playerLayer = document.createElement("canvas");
  if (playerLayer.width !== size || playerLayer.height !== size) {
    playerLayer.width = size;
    playerLayer.height = size;
  }
  return playerLayer;
}

/** Call whenever a fresh run starts — clears every bit of cosmetic state above. */
export function resetEffects(): void {
  particles.clear();
  shake.clear();
  lastDrawTs = null;
  waveBannerStart = null;
  pendingGhostEaten = [];
  pendingPlayerCaught = [];
}

/**
 * A ghost was eaten at maze cell (r, c) — always the player's own cell, since
 * that's where the collision happened — and teleported back to
 * (startR, startC). Queued rather than acted on immediately so the actual
 * pixel math (which depends on the current cell size/offsets) happens inside
 * draw().
 */
export function onGhostEaten(r: number, c: number, startR: number, startC: number): void {
  pendingGhostEaten.push({ r, c, startR, startC });
}

/** The player got caught by a (non-scared) ghost at maze cell (r, c). */
export function onPlayerCaught(r: number, c: number): void {
  pendingPlayerCaught.push({ r, c });
}

/** A wave was just cleared — pop the "WAVE CLEAR!" banner starting now. */
export function onWaveClear(ts: number): void {
  waveBannerStart = ts;
}

function drawGhost(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, scared: boolean): void {
  const r = size / 2;
  ctx.fillStyle = scared ? "#4444ff" : color;
  ctx.beginPath();
  ctx.arc(x, y, r, Math.PI, 0);
  ctx.lineTo(x + r, y + r);
  for (let i = 0; i < 3; i++) {
    ctx.lineTo(x + r - ((i + 0.5) * (2 * r)) / 3, y + (i % 2 === 0 ? r * 0.6 : r));
  }
  ctx.lineTo(x - r, y + r);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(x - r * 0.35, y - r * 0.1, r * 0.22, 0, Math.PI * 2);
  ctx.arc(x + r * 0.35, y - r * 0.1, r * 0.22, 0, Math.PI * 2);
  ctx.fill();
}

// Gentle vertical bob so ghosts read as alive rather than teleporting between
// grid cells — a slightly faster, jittery version while scared, so "safe to
// eat" also reads through motion, not just the blue tint + dashed ring below.
// Purely decorative (the ghost's actual r/c never changes), so it's skipped
// entirely under reduced motion rather than merely damped.
function ghostBobOffset(personality: GhostPersonality, ts: number, scared: boolean, cell: number): number {
  if (motion.reduced) return 0;
  const phase = PERSONALITY_BOB_PHASE[personality];
  if (scared) {
    const amp = cell * 0.05;
    return (Math.sin(ts / 120 + phase) + 0.35 * Math.sin(ts / 43 + phase * 2)) * amp;
  }
  const amp = cell * 0.035;
  return Math.sin(ts / 260 + phase) * amp;
}

// Draws the player as the shaded pacmanPlayerBody sprite with the animated
// mouth wedge punched out of it via destination-out, composited on an
// offscreen layer first so the cutout can't eat into anything already drawn
// on the main canvas (the maze, dots, etc). Returns false if the sprite
// isn't ready yet so the caller can fall back to the hand-drawn arc.
function drawPlayerSprite(ctx: CanvasRenderingContext2D, px: number, py: number, diameter: number, angle: number, mouth: number): boolean {
  if (!isReady(SPRITES.pacmanPlayerBody)) return false;
  const pad = 4;
  const size = Math.ceil(diameter) + pad * 2;
  const layer = getPlayerLayer(size);
  const lctx = layer.getContext("2d");
  if (!lctx) return false;

  const cx = size / 2;
  const cy = size / 2;
  const r = diameter / 2;

  lctx.clearRect(0, 0, size, size);
  lctx.drawImage(SPRITES.pacmanPlayerBody, cx - r, cy - r, diameter, diameter);

  lctx.globalCompositeOperation = "destination-out";
  lctx.beginPath();
  lctx.moveTo(cx, cy);
  lctx.arc(cx, cy, r + 1, angle + mouth * Math.PI, angle + (2 - mouth) * Math.PI);
  lctx.closePath();
  lctx.fill();
  lctx.globalCompositeOperation = "source-over";

  ctx.drawImage(layer, px - size / 2, py - size / 2, size, size);
  return true;
}

export function draw(ctx: CanvasRenderingContext2D, state: MazeState, ts: number, width: number, height: number): void {
  const dtMs = lastDrawTs === null ? 16.7 : Math.max(0, ts - lastDrawTs);
  lastDrawTs = ts;
  particles.update(dtMs);
  shake.update(dtMs);

  const cell = Math.min(width / COLS, height / ROWS);
  const offX = (width - cell * COLS) / 2;
  const offY = (height - cell * ROWS) / 2;
  const scared = ts < state.scaredUntil;

  // Drain any pending cosmetic-event queue now that we know this frame's
  // cell size/offsets, so the burst lands exactly on the right tile.
  while (pendingGhostEaten.length) {
    const ev = pendingGhostEaten.shift()!;
    const ex = offX + (ev.c + 0.5) * cell;
    const ey = offY + (ev.r + 0.5) * cell;
    particles.sparks(ex, ey);
    const sx = offX + (ev.startC + 0.5) * cell;
    const sy = offY + (ev.startR + 0.5) * cell;
    particles.dust(sx, sy, -Math.PI / 2, 8);
  }
  while (pendingPlayerCaught.length) {
    const ev = pendingPlayerCaught.shift()!;
    const cx = offX + (ev.c + 0.5) * cell;
    const cy = offY + (ev.r + 0.5) * cell;
    particles.debris(cx, cy);
    shake.trigger(cell * 0.5, 320);
  }

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#150c33";
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  shake.apply(ctx);

  ctx.fillStyle = "#3d2585";
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (state.maze[r][c]) {
        ctx.fillRect(offX + c * cell + 1, offY + r * cell + 1, cell - 2, cell - 2);
      }
    }
  }

  ctx.fillStyle = "#ffd43b";
  state.dots.forEach((key) => {
    const [r, c] = key.split(",").map(Number);
    const dx = offX + (c + 0.5) * cell;
    const dy = offY + (r + 0.5) * cell;
    if (isReady(SPRITES.dotGem)) {
      const dr = cell * 0.22;
      ctx.drawImage(SPRITES.dotGem, dx - dr, dy - dr, dr * 2, dr * 2);
    } else {
      ctx.beginPath();
      ctx.arc(dx, dy, cell * 0.09, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  const pulse = 0.7 + 0.3 * Math.sin(ts / 120);
  state.power.forEach((key) => {
    const [r, c] = key.split(",").map(Number);
    const px = offX + (c + 0.5) * cell;
    const py = offY + (r + 0.5) * cell;
    const pr = cell * 0.32 * pulse;
    if (isReady(SPRITES.sparkle)) {
      ctx.drawImage(SPRITES.sparkle, px - pr, py - pr, pr * 2, pr * 2);
    } else {
      ctx.beginPath();
      ctx.arc(px, py, cell * 0.28 * pulse, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  if (state.fruit) {
    const fx = offX + (state.fruit.c + 0.5) * cell;
    const fy = offY + (state.fruit.r + 0.5) * cell;
    const fr = cell * 0.36;
    if (isReady(SPRITES.starBadge)) {
      ctx.drawImage(SPRITES.starBadge, fx - fr, fy - fr, fr * 2, fr * 2);
    } else {
      // Hand-drawn 5-point star fallback if the sprite hasn't loaded.
      ctx.fillStyle = "#ff9f1c";
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const rad = i % 2 === 0 ? fr : fr * 0.45;
        const angle = (Math.PI / 5) * i - Math.PI / 2;
        const sx = fx + Math.cos(angle) * rad;
        const sy = fy + Math.sin(angle) * rad;
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  if (state.speedPellet) {
    const sx0 = offX + (state.speedPellet.c + 0.5) * cell;
    const sy0 = offY + (state.speedPellet.r + 0.5) * cell;
    const boltPulse = 0.75 + 0.25 * Math.sin(ts / 90);
    const s = cell * 0.34 * boltPulse;
    // Hand-drawn lightning bolt — no dedicated sprite for this pickup, so it
    // stays a simple canvas path (still 100% render.ts's concern).
    ctx.fillStyle = "#5cf5ff";
    ctx.beginPath();
    ctx.moveTo(sx0 + s * 0.15, sy0 - s);
    ctx.lineTo(sx0 - s * 0.5, sy0 + s * 0.1);
    ctx.lineTo(sx0 - s * 0.05, sy0 + s * 0.1);
    ctx.lineTo(sx0 - s * 0.15, sy0 + s);
    ctx.lineTo(sx0 + s * 0.5, sy0 - s * 0.1);
    ctx.lineTo(sx0 + s * 0.05, sy0 - s * 0.1);
    ctx.closePath();
    ctx.fill();
  }

  state.ghosts.forEach((g) => {
    const bob = ghostBobOffset(g.personality, ts, scared, cell);
    const gx = offX + (g.c + 0.5) * cell;
    const gy = offY + (g.r + 0.5) * cell + bob;
    const size = cell * 0.85;
    const sprite = GHOST_SPRITES[PERSONALITY_SPRITE_INDEX[g.personality]];
    if (isReady(sprite)) {
      const half = size / 2;
      ctx.drawImage(sprite, gx - half, gy - half, size, size);
      if (scared) {
        ctx.globalCompositeOperation = "source-atop";
        ctx.fillStyle = "rgba(68,68,255,0.55)";
        ctx.fillRect(gx - half, gy - half, size, size);
        ctx.globalCompositeOperation = "source-over";
      }
    } else {
      drawGhost(ctx, gx, gy, size, g.color, scared);
    }
    // "Scared" (edible) is otherwise conveyed by color alone (a blue tint) —
    // add a shape-based cue too, since color-blind players (or anyone on a
    // washed-out screen) shouldn't have to guess whether a ghost is safe to
    // eat. A dashed ring reads clearly regardless of hue perception.
    if (scared) {
      ctx.save();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.setLineDash([cell * 0.08, cell * 0.06]);
      ctx.beginPath();
      ctx.arc(gx, gy, size * 0.62, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  });

  const p = state.player;
  const px = offX + (p.c + 0.5) * cell;
  const py = offY + (p.r + 0.5) * cell;
  const angle = Math.atan2(p.dir.y, p.dir.x) || 0;
  const mouth = 0.15 + 0.15 * Math.abs(Math.sin(ts / 100));
  if (!drawPlayerSprite(ctx, px, py, cell * 0.84, angle, mouth)) {
    ctx.fillStyle = "#ffd43b";
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.arc(px, py, cell * 0.42, angle + mouth * Math.PI, angle + (2 - mouth) * Math.PI);
    ctx.closePath();
    ctx.fill();
  }

  particles.draw(ctx);

  ctx.restore();

  // HUD — deliberately drawn after the shake restore() above so the score/
  // wave/lives readout never itself shakes, only the maze does.
  drawLabel(ctx, "❤".repeat(Math.max(0, state.lives)), 10, 22, {
    size: 16,
    fill: "#ff4d8d",
    align: "left",
  });
  drawLabel(ctx, `Wave ${state.wave}`, width - 10, 22, {
    size: 14,
    align: "right",
  });

  if (waveBannerStart !== null) {
    const progress = (ts - waveBannerStart) / WAVE_BANNER_MS;
    if (progress >= 1) {
      waveBannerStart = null;
    } else {
      drawBanner(ctx, "WAVE CLEAR!", width / 2, height / 2, progress, {
        fill: "#8bff56",
      });
    }
  }
}
