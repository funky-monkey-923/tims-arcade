// All CanvasRenderingContext2D calls for Wiggle Worm live here — the "UI"
// half's rendering concern, kept separate from engine.ts's game rules.
//
// Artistic-overhaul pass: the body is now hand-shaded (per-segment gradient +
// scale banding) rather than flat rects, the whole body slithers with a
// per-segment sine wiggle, and eating/dying/wave-changes trigger particles,
// screen shake and slam-in banners. All of that is *cosmetic-only* state —
// it lives entirely in this module (see the ParticleField/ScreenShake/banner
// variables below), never in SnakeState, per this app's engine/UI split.
// GameShell fully unmounts/remounts SnakeGame between runs, but this module
// stays loaded across that remount, so SnakeGame.tsx calls resetEffects() on
// every fresh run to avoid leaking a burst/shake/banner from a previous game
// into the next one.

import { SPRITES, isReady } from "../../lib/sprites";
import { GRID, type SnakeState, type FoodKind, type Vec } from "./engine";
import { ParticleField, ScreenShake } from "../../lib/particles";
import { drawBanner, drawLabel } from "../../lib/canvasText";
import { motion, scaleForMotion } from "../../lib/motion";

// ---- Cosmetic-only module state -------------------------------------------

const particles = new ParticleField();
const shake = new ScreenShake();

// The faint background gridlines never change between frames (they only
// depend on the canvas's own width/height, which is fixed for the run) —
// caching them into an offscreen layer avoids re-running 2*(GRID-1) stroke
// calls 60x/sec for something that's pure background decoration. Same
// "build once, blit every frame" approach as Munch Maze's wall-layer cache.
let gridLayer: HTMLCanvasElement | null = null;
let gridLayerWidth = 0;
let gridLayerHeight = 0;
function getGridLayer(width: number, height: number, cell: number): HTMLCanvasElement {
  if (!gridLayer) gridLayer = document.createElement("canvas");
  if (gridLayer.width !== width || gridLayer.height !== height || gridLayerWidth !== width || gridLayerHeight !== height) {
    gridLayer.width = width;
    gridLayer.height = height;
    const lctx = gridLayer.getContext("2d")!;
    lctx.clearRect(0, 0, width, height);
    lctx.strokeStyle = "rgba(255,255,255,0.04)";
    for (let i = 1; i < GRID; i++) {
      lctx.beginPath();
      lctx.moveTo(i * cell, 0);
      lctx.lineTo(i * cell, height);
      lctx.stroke();
      lctx.beginPath();
      lctx.moveTo(0, i * cell);
      lctx.lineTo(width, i * cell);
      lctx.stroke();
    }
    gridLayerWidth = width;
    gridLayerHeight = height;
  }
  return gridLayer;
}


interface BannerState {
  text: string;
  startTs: number;
  durationMs: number;
  fill: string;
}
let activeBanner: BannerState | null = null;

let lastFrameTs: number | null = null;
let lastEatTs = -Infinity;

const HEAD_PULSE_MS = 220;
const BANNER_DURATION_MS = 1300;
const DEATH_BANNER_DURATION_MS = 900;

function showBanner(text: string, ts: number, durationMs: number, fill: string): void {
  activeBanner = { text, startTs: ts, durationMs, fill };
}

/** Called by SnakeGame.tsx from the same `events.score !== undefined` block
 * where it already plays a food sfx. `x`/`y` are canvas-pixel coordinates of
 * the food that was just eaten. */
export function onEat(x: number, y: number, kind: FoodKind, ts: number): void {
  lastEatTs = ts;
  if (kind === "golden") {
    // The rarest, most valuable food gets the biggest, brightest burst.
    particles.sparks(x, y, 26);
  } else if (kind === "shrink") {
    // Reads as "losing" something: cooler color, particles fall away rather
    // than fly outward.
    particles.spawn(14, {
      x, y,
      spreadX: 4, spreadY: 4,
      angle: Math.PI / 2,
      spread: Math.PI / 3,
      speedMin: 30, speedMax: 100,
      colors: ["#9b6bff", "#c9a6ff", "#150c33"],
      lifeMin: 260, lifeMax: 520,
      sizeMin: 3, sizeMax: 6,
      gravity: 260,
      drag: 1.2,
      shape: "circle",
    });
  } else {
    particles.spawn(10, {
      x, y,
      spreadX: 3, spreadY: 3,
      angle: -Math.PI / 2,
      spread: Math.PI,
      speedMin: 40, speedMax: 110,
      colors: ["#ffd43b", "#fff3b0"],
      lifeMin: 240, lifeMax: 480,
      sizeMin: 2, sizeMax: 4,
      gravity: 70,
      drag: 1.6,
      shape: "circle",
    });
  }
}

/** Called by SnakeGame.tsx from the same `events.gameOver !== undefined`
 * block where it already plays the "hit" sfx. `x`/`y` are the dead head's
 * canvas-pixel position. */
export function onDeath(x: number, y: number, ts: number): void {
  particles.debris(x, y);
  shake.trigger(10, 260);
  showBanner("OUCH!", ts, DEATH_BANNER_DURATION_MS, "#ff6b6b");
}

/** Called by SnakeGame.tsx whenever it notices `state.wave` advanced. */
export function onWaveChange(wave: number, ts: number): void {
  showBanner(`WAVE ${wave}!`, ts, BANNER_DURATION_MS, "#ffd43b");
}

/** Drops all cosmetic-only state. SnakeGame.tsx calls this whenever a fresh
 * run starts — otherwise a burst/shake/banner from the previous playthrough
 * would still be live when the new one's first frame draws. */
export function resetEffects(): void {
  particles.clear();
  shake.clear();
  activeBanner = null;
  lastFrameTs = null;
  lastEatTs = -Infinity;
}

// ---- Small drawing helpers --------------------------------------------------

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, outerR: number, innerR: number): void {
  const spikes = 5;
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (Math.PI / spikes) * i - Math.PI / 2;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

// Near-head (bright, young-leaf green) to near-tail (deep, shadowed green).
const BODY_NEAR: Rgb = { r: 139, g: 230, b: 90 };
const BODY_FAR: Rgb = { r: 46, g: 104, b: 32 };
const HEAD_RGB: Rgb = { r: 158, g: 255, b: 110 };

function lerpRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}

function shade(rgb: Rgb, amt: number): string {
  const r = Math.min(255, Math.max(0, Math.round(rgb.r + amt)));
  const g = Math.min(255, Math.max(0, Math.round(rgb.g + amt)));
  const b = Math.min(255, Math.max(0, Math.round(rgb.b + amt)));
  return `rgb(${r},${g},${b})`;
}

function rgbToCss(rgb: Rgb): string {
  return `rgb(${Math.round(rgb.r)},${Math.round(rgb.g)},${Math.round(rgb.b)})`;
}

// Tangent direction of the body at segment `i`, approximated as the vector
// from the segment behind it to the segment ahead of it (a central
// difference), so it reads as a smooth curve through corners rather than a
// sharp per-cell direction flip. Used for both the wiggle's perpendicular
// axis and the head's snout/eye orientation.
function segDir(snake: Vec[], i: number): Vec {
  const len = snake.length;
  const a = snake[Math.max(i - 1, 0)];
  const b = snake[Math.min(i + 1, len - 1)];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const mag = Math.hypot(dx, dy) || 1;
  return { x: dx / mag, y: dy / mag };
}

export function draw(ctx: CanvasRenderingContext2D, state: SnakeState, ts: number, width: number, height: number): void {
  const dtMs = lastFrameTs === null ? 16.7 : Math.max(0, ts - lastFrameTs);
  lastFrameTs = ts;
  particles.update(dtMs);
  shake.update(dtMs);

  const cell = width / GRID;

  ctx.clearRect(0, 0, width, height);

  // Everything in the game world (but not the banner/HUD text below) shakes
  // together, so an impact reads as the whole arena getting rattled.
  ctx.save();
  shake.apply(ctx);

  ctx.fillStyle = "#150c33";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(getGridLayer(width, height, cell), 0, 0);

  // obstacle tiles — solid blocking walls, drawn before food/snake so they
  // read clearly as part of the arena floor
  ctx.fillStyle = "#3a2b52";
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  for (const w of state.walls) {
    const x = w.x * cell;
    const y = w.y * cell;
    ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
    ctx.strokeRect(x + 2.5, y + 2.5, cell - 5, cell - 5);
  }

  // portals — a linked teleport pair, drawn as dashed rings so they read as
  // distinct from both walls and food
  if (state.portals) {
    ctx.save();
    ctx.strokeStyle = "#7ce7ff";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    for (const p of state.portals) {
      const px = (p.x + 0.5) * cell;
      const py = (p.y + 0.5) * cell;
      ctx.beginPath();
      ctx.arc(px, py, cell * 0.36, (ts / 300) % (Math.PI * 2), (ts / 300) % (Math.PI * 2) + Math.PI * 1.6);
      ctx.stroke();
    }
    ctx.restore();
  }

  // food — shape (not just color) always distinguishes kind, per this app's
  // accessibility rule that gameplay state must never be color-only.
  const foodX = (state.food.x + 0.5) * cell;
  const foodY = (state.food.y + 0.5) * cell;
  const pulse = 0.85 + 0.15 * Math.sin(ts / 150);

  if (state.food.kind === "golden") {
    // golden food: a pulsing star that visibly shrinks as its despawn timer
    // runs out, so the countdown is legible without a separate UI element
    const expiresAt = state.food.expiresAt ?? ts;
    const remaining = Math.max(0, Math.min(1, (expiresAt - ts) / 6000));
    const outerR = cell * 0.46 * (0.6 + 0.4 * remaining) * pulse;
    ctx.save();
    ctx.shadowBlur = 10;
    ctx.shadowColor = "rgba(255,183,3,0.8)";
    ctx.fillStyle = "#ffb703";
    drawStar(ctx, foodX, foodY, outerR, outerR * 0.45);
    ctx.restore();
  } else if (state.food.kind === "shrink") {
    // shrink food: a downward-pointing triangle with a "minus" glyph —
    // reads as "take something away" at a glance, distinct shape and color
    const r = cell * 0.4 * pulse;
    ctx.fillStyle = "#9b6bff";
    ctx.beginPath();
    ctx.moveTo(foodX, foodY + r);
    ctx.lineTo(foodX - r, foodY - r * 0.7);
    ctx.lineTo(foodX + r, foodY - r * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#150c33";
    ctx.lineWidth = Math.max(1.5, cell * 0.06);
    ctx.beginPath();
    ctx.moveTo(foodX - r * 0.4, foodY - r * 0.05);
    ctx.lineTo(foodX + r * 0.4, foodY - r * 0.05);
    ctx.stroke();
  } else {
    // normal food: the original pulsing coin
    const foodR = (cell / 2.2) * pulse;
    if (isReady(SPRITES.coin)) {
      ctx.drawImage(SPRITES.coin, foodX - foodR, foodY - foodR, foodR * 2, foodR * 2);
    } else {
      ctx.fillStyle = "#ffd43b";
      ctx.beginPath();
      ctx.arc(foodX, foodY, foodR * 0.85, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Continuous trail behind the moving head — subtle, in the body's own
  // palette, so it reads as "slither residue" rather than a generic effect.
  if (!state.dead) {
    const head0 = state.snake[0];
    particles.trail((head0.x + 0.5) * cell, (head0.y + 0.5) * cell, "rgba(139,230,90,0.5)", 1);
  }

  // snake — hand-shaded gradient body with a per-segment sine wiggle so it
  // reads as slithering rather than a rigid rail of tiles. Wiggle amplitude
  // grows from 0 at the head to a maximum at the tail, matching how a real
  // snake's undulation is barely visible up front and most pronounced
  // further back. Purely decorative, so it's zeroed under reduced motion.
  const wiggleAmpBase = cell * 0.16;
  const total = state.snake.length;
  const segPad = 1.5;

  state.snake.forEach((seg, i) => {
    if (i === 0) return; // head is drawn separately, below, with its own shape
    const dir = segDir(state.snake, i);
    const perp = { x: -dir.y, y: dir.x };
    const wiggleT = total > 1 ? i / (total - 1) : 0;
    const amp = scaleForMotion(wiggleAmpBase * wiggleT);
    const wiggle = amp * Math.sin(ts / 130 - i * 0.85);

    const cx = seg.x * cell + cell / 2 + perp.x * wiggle;
    const cy = seg.y * cell + cell / 2 + perp.y * wiggle;
    const size = cell - segPad * 2;

    const t = total > 2 ? (i - 1) / (total - 2) : 0;
    const base = lerpRgb(BODY_NEAR, BODY_FAR, t);

    const grad = ctx.createLinearGradient(cx - size / 2, cy - size / 2, cx + size / 2, cy + size / 2);
    grad.addColorStop(0, shade(base, 45));
    grad.addColorStop(0.55, rgbToCss(base));
    grad.addColorStop(1, shade(base, -40));

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(cx - size / 2, cy - size / 2, size, size, 6);
    ctx.fill();

    // Scale-like banding: a small darker ellipse on alternating segments,
    // offset along the perpendicular axis so it reads as texture rather
    // than a solid stripe.
    if (i % 2 === 0) {
      ctx.fillStyle = shade(base, -55);
      ctx.beginPath();
      ctx.ellipse(cx, cy, size * 0.22, size * 0.14, Math.atan2(dir.y, dir.x), 0, Math.PI * 2);
      ctx.fill();
    }
  });

  // Head — bigger and shape-distinct from the body (an elongated ellipse
  // oriented along the direction of travel, i.e. a snout), plus eyes and an
  // occasional tongue-flick so "which end is the front" is legible even
  // before the eyes register.
  const head = state.snake[0];
  if (head) {
    const dir = state.dir.x !== 0 || state.dir.y !== 0 ? state.dir : { x: 1, y: 0 };
    const angle = Math.atan2(dir.y, dir.x);
    const hx = (head.x + 0.5) * cell;
    const hy = (head.y + 0.5) * cell;

    // Squash/stretch: a brief pulse right after eating, decaying back to
    // normal over HEAD_PULSE_MS. Purely decorative, so reduced motion drops
    // it to zero rather than merely damping it.
    const sinceEat = ts - lastEatTs;
    const pulseT = sinceEat >= 0 && sinceEat < HEAD_PULSE_MS ? 1 - sinceEat / HEAD_PULSE_MS : 0;
    const pulse2 = scaleForMotion(pulseT * 0.3);

    const radiusAlong = cell * (0.62 + pulse2);
    const radiusAcross = cell * (0.46 - pulse2 * 0.5);

    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(angle);
    const headGrad = ctx.createLinearGradient(-radiusAlong, -radiusAcross, radiusAlong, radiusAcross);
    headGrad.addColorStop(0, shade(HEAD_RGB, 40));
    headGrad.addColorStop(0.6, rgbToCss(HEAD_RGB));
    headGrad.addColorStop(1, shade(HEAD_RGB, -35));
    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, radiusAlong, radiusAcross, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eyes, side-by-side across the direction of travel (in local/rotated
    // space, that's simply +/-Y).
    const eyeForward = radiusAlong * 0.35;
    const eyeSide = radiusAcross * 0.55;
    const eyeR = cell * 0.09;
    ctx.fillStyle = "#150c33";
    [-1, 1].forEach((side) => {
      ctx.beginPath();
      ctx.arc(eyeForward, eyeSide * side, eyeR, 0, Math.PI * 2);
      ctx.fill();
    });

    // Tongue flick: a brief forked tongue darting out, on a fixed rhythm so
    // no extra state is needed — just a modulo on the timestamp. Skipped
    // entirely under reduced motion (a repeating dart-in-and-out motion is
    // exactly the kind of small, rapid movement that setting exists to cut).
    if (!motion.reduced) {
      const cyclePos = ts % 1700;
      if (cyclePos < 220) {
        const flick = Math.sin((cyclePos / 220) * Math.PI); // 0 -> 1 -> 0
        const tongueLen = radiusAlong * (0.55 + 0.45 * flick);
        const tipX = radiusAlong + tongueLen;
        const forkX = radiusAlong + tongueLen * 0.7;
        const forkSpread = cell * 0.09;
        ctx.strokeStyle = "#ff5d7a";
        ctx.lineWidth = Math.max(1, cell * 0.045);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(radiusAlong * 0.9, 0);
        ctx.lineTo(forkX, 0);
        ctx.lineTo(tipX, -forkSpread);
        ctx.moveTo(forkX, 0);
        ctx.lineTo(tipX, forkSpread);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  particles.draw(ctx);

  ctx.restore(); // end shake-affected world layer

  // HUD + banners — deliberately outside the shake transform so they stay
  // perfectly legible even while the arena is rattling.
  drawLabel(ctx, `Wave ${state.wave}`, 10, 20, { size: 13 });

  if (activeBanner) {
    const elapsed = ts - activeBanner.startTs;
    if (elapsed > activeBanner.durationMs) {
      activeBanner = null;
    } else {
      drawBanner(ctx, activeBanner.text, width / 2, height / 2, elapsed / activeBanner.durationMs, {
        fill: activeBanner.fill,
      });
    }
  }
}
