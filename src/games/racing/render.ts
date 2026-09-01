// All CanvasRenderingContext2D calls for Turbo Dash live here — the "UI"
// half's rendering concern, kept separate from engine.ts's game rules.

import { drawShadow, SPRITES, isReady, OBSTACLE_CAR_SPRITES, RIVAL_CAR_SPRITES, ROADSIDE_SPRITES } from "../../lib/sprites";
import { LANES, NITRO_COOLDOWN, laneX, getPlayerPosition, type RacingState } from "./engine";
import { ParticleField, ScreenShake } from "../../lib/particles";
import { drawLabel, drawBanner, drawOutlinedText } from "../../lib/canvasText";
import { scaleForMotion } from "../../lib/motion";

// Screen pixels per unit of distance-gap between the player and an AI
// racer. Tuned so racers within roughly a second's worth of pace
// difference (a few hundred distance-units, given state.distance
// advances by ~speed*60/sec) render on-track near the player, while
// bigger gaps push them off-screen into the edge "radar ping" indicator.
const AI_GAP_SCALE = 0.4;

// Mirrors engine.ts's private LAP_BANNER_MS (not exported — render.ts has no
// business importing gameplay constants it doesn't need, but it does need
// this one duration to animate the banner it's told to show). Keep in sync
// if the engine's value ever changes.
const LAP_BANNER_MS = 2000;

// --- Track curvature (visual only) -----------------------------------------
// A slow, lazy S-curve applied purely at render time — the road surface,
// lane-divider lines, obstacles, AI cars, the player car, and roadside
// scenery all get the same horizontal offset added at their own y-position,
// so none of this touches engine.ts's actual lane/collision math: everything
// just gets bent sideways together, in lockstep, as pure decoration.
//
// Driven off state.distance (not ts/rAF), same reasoning as SKY_DRIFT_FACTOR
// above: it must freeze correctly whenever the race itself is frozen
// (paused/countdown/finished) rather than drifting as "free" decoration
// while everything else holds.
const CURVE_FREQUENCY = 0.0013; // radians per distance-unit — a full
// left-right-left cycle roughly every ~4800 distance-units, i.e. a bit over
// two full S-bends across an ~15000-unit lap at cruising speed: noticeable
// without being frantic.
const CURVE_Y_SPAN = 1.1; // radians of extra phase spanned from the top of
// the screen (y=0) to the bottom (y=height). This — not the distance term
// alone — is what actually sells "the road bends" rather than "the screen
// shifts sideways": a point near the player's own car (large y) and a point
// near the horizon (small y) at the same instant sit at different phases of
// the sine, so lane lines and objects at different depths get visibly
// different offsets, exactly like a real curve receding into the distance.
const CURVE_AMPLITUDE_FRACTION = 0.07; // max horizontal displacement, as a
// fraction of track width, at the extremes of the curve (~7%, inside the
// 5-10%-of-track-width ballpark from the design brief).

/**
 * Purely cosmetic horizontal offset for whatever's being drawn at screen-
 * space `y`, given the race's current distance. Every caller in this file
 * (road bands, lane dividers, obstacles, AI cars, the player car, roadside
 * scenery) samples this at its own y so everything bends together and still
 * lines up within its lane on the curved road.
 *
 * Takes the already-resolved `amplitude` (see `scaleForMotion` at each
 * frame's one call site in `draw()`/`drawShoulderScenery`) rather than
 * recomputing it itself — this function is called 150+ times in a single
 * frame (every road band + lane-divider sample + obstacle + car), and
 * `scaleForMotion` only depends on `width` and the reduced-motion flag,
 * neither of which changes mid-frame, so recomputing it per-sample was pure
 * waste.
 */
function curveOffsetAtY(amplitude: number, distance: number, y: number, height: number): number {
  if (amplitude === 0) return 0;
  const phase = distance * CURVE_FREQUENCY + (y / height) * CURVE_Y_SPAN;
  return Math.sin(phase) * amplitude;
}

// Cosmetic-only module state — screen shake/particles are pure visual
// flourish with no gameplay meaning (see lib/particles.ts's file comment),
// so they live here rather than in RacingState. GameShell fully unmounts
// this component between playthroughs, but this module itself does not get
// re-imported, so resetEffects() (called by TurboDash.tsx whenever a fresh
// race starts) is what actually clears the slate between races.
const particles = new ParticleField();
const shake = new ScreenShake();
let lastFrameTs = 0;

/** Called by TurboDash.tsx whenever a new race's state is created. */
export function resetEffects(): void {
  particles.clear();
  shake.clear();
  lastFrameTs = 0;
}

/** Crash impact: sparks + heavier debris + a short, sharp shake. */
export function onCrash(x: number, y: number): void {
  particles.sparks(x, y);
  particles.debris(x, y);
  shake.trigger(10, 260);
}

/** Nitro activation: an extra burst on top of the continuous flame trail
 * drawn every frame nitro is active (see the trail spawn in `draw` below),
 * plus a small punch of shake so the boost has weight. */
export function onNitro(x: number, y: number): void {
  particles.sparks(x, y, 14);
  shake.trigger(4, 120);
}

function ordinal(n: number): string {
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${n}th`;
}

// --- Roadside scenery ---------------------------------------------------
// Purely cosmetic, purely a function of state.distance (which already
// advances by state.speed once per tick, exactly like state.obstacles' `y`
// and state.roadOffset — see engine.ts) — so scenery scrolls in lockstep
// with the road and obstacles with no extra state of its own to track,
// spawn, or despawn. Each "slot" is spaced `SCENERY_SPACING` distance-units
// apart along an infinite, implicit world line; which slots are currently
// on-screen is recomputed fresh every frame from state.distance.
const SCENERY_SPACING_FACTOR = 0.6; // * height
// Multiplier used to scramble the ROADSIDE_SPRITES index per slot so the
// shoulder doesn't read as a fixed short-period repeat (a plain `k % len`
// would visibly cycle every `len` slots) — an arbitrary odd stride through
// the small sprite array, offset per side so left/right don't mirror.
const SCENERY_STRIDE = 5;

function drawSceneryItem(ctx: CanvasRenderingContext2D, sprite: HTMLImageElement, cx: number, groundY: number, maxW: number): void {
  if (!isReady(sprite)) return;
  const aspect = sprite.naturalHeight / sprite.naturalWidth;
  const w = maxW;
  const h = w * aspect;
  drawShadow(ctx, cx, groundY + h * 0.05, w * 0.9);
  ctx.drawImage(sprite, cx - w / 2, groundY - h, w, h);
}

function drawShoulderScenery(ctx: CanvasRenderingContext2D, state: RacingState, width: number, height: number, margin: number, curveAmplitude: number): void {
  const spacing = height * SCENERY_SPACING_FACTOR;
  const kCenter = -state.distance / spacing;
  const kMin = Math.floor(kCenter - height / spacing - 1);
  const kMax = Math.ceil(kCenter + 1);
  const itemW = Math.max(18, margin * 0.85);

  for (let k = kMin; k <= kMax; k++) {
    const y = state.distance + k * spacing;
    if (y < -120 || y > height + 40) continue;
    // Roadside scenery is drawn outside the road's scale/translate
    // transform (see draw() below), so it samples the same curve offset
    // directly in canvas space rather than through that transform.
    const curveOffset = curveOffsetAtY(curveAmplitude, state.distance, y, height);

    const leftIdx = Math.abs(k * SCENERY_STRIDE) % ROADSIDE_SPRITES.length;
    drawSceneryItem(ctx, ROADSIDE_SPRITES[leftIdx], margin * 0.5 + curveOffset, y, itemW);

    const rightIdx = Math.abs(k * SCENERY_STRIDE + 3) % ROADSIDE_SPRITES.length;
    drawSceneryItem(ctx, ROADSIDE_SPRITES[rightIdx], width - margin * 0.5 + curveOffset, y, itemW);
  }
}

// --- Sky parallax ---------------------------------------------------------
// A slow-drifting cloud band across the top of the canvas. Driven off
// state.distance (not the raw rAF timestamp) so it freezes correctly
// whenever the race itself is frozen (paused, countdown, finished) rather
// than continuing to drift as pure decoration while everything else holds.
const SKY_DRIFT_FACTOR = 0.02; // slower than the road/scenery for a depth cue

function drawSky(ctx: CanvasRenderingContext2D, state: RacingState, width: number, height: number): void {
  const bandH = height * 0.09;
  const grd = ctx.createLinearGradient(0, 0, 0, bandH);
  grd.addColorStop(0, "#0d0726");
  grd.addColorStop(1, "#241a52");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, width, bandH);

  const wrap = width + 220;
  const drift = state.distance * SKY_DRIFT_FACTOR;
  const clouds: { sprite: HTMLImageElement; w: number; y: number; phase: number }[] = [
    { sprite: SPRITES.cloud1, w: width * 0.26, y: bandH * 0.32, phase: 0 },
    { sprite: SPRITES.cloud2, w: width * 0.2, y: bandH * 0.62, phase: wrap * 0.5 },
  ];
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, bandH);
  ctx.clip();
  for (const c of clouds) {
    if (!isReady(c.sprite)) continue;
    const aspect = c.sprite.naturalHeight / c.sprite.naturalWidth;
    const x = (((c.phase - drift) % wrap) + wrap) % wrap - 200;
    ctx.globalAlpha = 0.75;
    ctx.drawImage(c.sprite, x, c.y - (c.w * aspect) / 2, c.w, c.w * aspect);
  }
  ctx.restore();
}

// --- Start-light countdown ------------------------------------------------
// Purely presentational — owned/sequenced by TurboDash.tsx (a useState
// phase + timers, see that file), which just tells us how many lights are
// lit each frame. No engine involvement: the race's step() loop simply
// doesn't run until TurboDash.tsx flips to "racing".
export interface StartLightPhase {
  litCount: number; // 0..3 red lights lit so far
  go: boolean; // true once it's lights-out/green
}

const START_LIGHT_COUNT = 3;

export function drawStartLights(ctx: CanvasRenderingContext2D, width: number, height: number, phase: StartLightPhase): void {
  ctx.save();
  ctx.fillStyle = "rgba(13,7,38,0.55)";
  ctx.fillRect(0, 0, width, height);

  const gantryW = Math.min(width * 0.6, 220);
  const gantryH = gantryW * (SPRITES.startLights.naturalHeight / Math.max(1, SPRITES.startLights.naturalWidth) || 0.4);
  const gx = width / 2 - gantryW / 2;
  const gy = height * 0.32 - gantryH / 2;
  if (isReady(SPRITES.startLights)) {
    ctx.drawImage(SPRITES.startLights, gx, gy, gantryW, gantryH);
  } else {
    ctx.fillStyle = "#2b2b38";
    ctx.fillRect(gx, gy, gantryW, gantryH);
  }

  // Lights themselves are drawn as an overlay row of circles rather than
  // baked into the (static) gantry sprite, since the sprite has no separate
  // per-light frames to swap between — this is what actually animates.
  const lightR = gantryW * 0.07;
  const lightY = gy + gantryH * 0.55;
  const gap = gantryW / (START_LIGHT_COUNT + 1);
  for (let i = 0; i < START_LIGHT_COUNT; i++) {
    const lx = gx + gap * (i + 1);
    const lit = !phase.go && i < phase.litCount;
    ctx.beginPath();
    ctx.arc(lx, lightY, lightR, 0, Math.PI * 2);
    ctx.fillStyle = phase.go ? "rgba(139,255,86,0.25)" : lit ? "#ff4d8d" : "rgba(255,255,255,0.12)";
    ctx.fill();
    if (lit || phase.go) {
      ctx.save();
      ctx.shadowBlur = 14;
      ctx.shadowColor = phase.go ? "#8bff56" : "#ff4d8d";
      ctx.beginPath();
      ctx.arc(lx, lightY, lightR * 0.7, 0, Math.PI * 2);
      ctx.fillStyle = phase.go ? "#8bff56" : "#ff4d8d";
      ctx.fill();
      ctx.restore();
    }
  }

  // Text cue pairing the light color with words, same accessibility
  // precedent as the existing NITRO labels: the state is never color-only.
  drawOutlinedText(ctx, phase.go ? "GO!" : "GET READY", width / 2, height * 0.5, {
    size: phase.go ? 40 : 24,
    fill: phase.go ? "#8bff56" : "#f5f5ff",
    outline: "#150c33",
    outlineWidth: 4,
  });
  ctx.restore();
}

export function draw(ctx: CanvasRenderingContext2D, state: RacingState, ts: number, width: number, height: number): void {
  const carW = width / LANES - 24;
  const carH = height * 0.11;

  const dt = lastFrameTs ? Math.min(200, ts - lastFrameTs) : 16.7;
  lastFrameTs = ts;
  particles.update(dt);
  shake.update(dt);

  // Horizontal margin reserved for roadside scenery, as a fraction of the
  // canvas width. Rather than recomputing every lane/obstacle/car x
  // coordinate to fit inside a narrower track, the whole "road" layer below
  // is drawn through a matching scale+translate transform — every existing
  // coordinate (laneX(width, ...), state.x, o.y, etc., all derived from the
  // same `width` engine.ts was given) still lines up perfectly, just
  // uniformly compressed and shifted right to make room on each side. Only
  // pixels move; no gameplay math changes.
  const margin = width * 0.11;
  const roadScale = (width - margin * 2) / width;
  // Computed once per frame (see curveOffsetAtY's own comment for why) and
  // threaded through every call site below instead of each one re-deriving
  // it from `width`/reduced-motion.
  const curveAmplitude = scaleForMotion(width * CURVE_AMPLITUDE_FRACTION);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#1a1140";
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  shake.apply(ctx);

  drawSky(ctx, state, width, height);
  drawShoulderScenery(ctx, state, width, height, margin, curveAmplitude);

  ctx.save();
  ctx.translate(margin, 0);
  ctx.scale(roadScale, 1);

  ctx.fillStyle = "#2b2b38";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#150c33";
  ctx.fillRect(0, 0, width * 0.02, height);
  ctx.fillRect(width * 0.98, 0, width * 0.02, height);

  // Only the two edge stripes are redrawn per band, not the whole-width road
  // body: the body color is uniform, so the flat, un-offset fill just above
  // already covers it correctly everywhere except the thin sliver right at
  // each curved edge — and that sliver is exactly where the (offset) edge
  // stripe below gets redrawn on top anyway. Re-filling the full-width body
  // per band used to triple this loop's fillRect count for no visual
  // difference; skipping it cuts this hot loop by a third.
  const bandH = Math.max(4, height / 60);
  for (let y = 0; y < height; y += bandH) {
    const off = curveOffsetAtY(curveAmplitude, state.distance, y + bandH / 2, height);
    const h = Math.min(bandH + 1, height - y + 1);
    ctx.fillStyle = "#150c33";
    ctx.fillRect(off, y, width * 0.02, h);
    ctx.fillRect(off + width * 0.98, y, width * 0.02, h);
  }

  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 3;
  ctx.setLineDash([height * 0.09, height * 0.08]);
  const CURVE_LANE_SAMPLES = 24; // points sampled per lane-divider polyline —
  // a single straight moveTo/lineTo can't visually curve, so each divider is
  // drawn as a short polyline through several y-sampled points instead.
  for (let l = 1; l < LANES; l++) {
    ctx.beginPath();
    ctx.lineDashOffset = -state.roadOffset;
    const baseX = (width / LANES) * l;
    for (let s = 0; s <= CURVE_LANE_SAMPLES; s++) {
      const y = (height * s) / CURVE_LANE_SAMPLES;
      const x = baseX + curveOffsetAtY(curveAmplitude, state.distance, y, height);
      if (s === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);

  state.obstacles.forEach((o) => {
    const ox = laneX(width, o.lane) + curveOffsetAtY(curveAmplitude, state.distance, o.y, height);
    drawShadow(ctx, ox, o.y + carH / 2 - 2, carW * 1.1);
    const sprite = OBSTACLE_CAR_SPRITES[o.spriteIndex % OBSTACLE_CAR_SPRITES.length];
    if (isReady(sprite)) {
      ctx.drawImage(sprite, ox - carW / 2, o.y - carH / 2, carW, carH);
    } else {
      ctx.fillStyle = "#ff4d8d";
      ctx.beginPath();
      ctx.roundRect(ox - carW / 2, o.y - carH / 2, carW, carH, 8);
      ctx.fill();
    }
  });

  const carY = height * 0.78;
  state.aiRacers.forEach((ai, i) => {
    const gap = ai.distance - state.distance; // positive = ahead of player
    const ay = carY - gap * AI_GAP_SCALE;
    const ax = laneX(width, ai.lane) + curveOffsetAtY(curveAmplitude, state.distance, ay, height);
    if (ay > -carH && ay < height + carH) {
      drawShadow(ctx, ax, ay + carH / 2 - 2, carW * 1.1);
      const sprite = RIVAL_CAR_SPRITES[i % RIVAL_CAR_SPRITES.length];
      if (isReady(sprite)) {
        ctx.drawImage(sprite, ax - carW / 2, ay - carH / 2, carW, carH);
      } else {
        ctx.fillStyle = ai.color;
        ctx.beginPath();
        ctx.roundRect(ax - carW / 2, ay - carH / 2, carW, carH, 8);
        ctx.fill();
      }
    } else {
      // Off-screen "radar ping": a small triangle pinned to the edge the
      // racer is off toward, plus their name, so the player still has
      // positional awareness of someone they can't currently see. Kept as a
      // shape (not just a color dot) — this is the accessibility-relevant
      // cue this game already had, restyled but not removed.
      const atTop = gap > 0;
      const edgeY = atTop ? 30 : height - 18;
      // Recomputed at the indicator's actual on-screen y (rather than reusing
      // the far-off-screen `ax`/`ay` above) so the ping sits at the same
      // curve offset as the road edge it's pinned to.
      const pingX = laneX(width, ai.lane) + curveOffsetAtY(curveAmplitude, state.distance, edgeY, height);
      ctx.fillStyle = ai.color;
      ctx.beginPath();
      if (atTop) {
        ctx.moveTo(pingX, edgeY - 7);
        ctx.lineTo(pingX - 7, edgeY + 7);
        ctx.lineTo(pingX + 7, edgeY + 7);
      } else {
        ctx.moveTo(pingX, edgeY + 7);
        ctx.lineTo(pingX - 7, edgeY - 7);
        ctx.lineTo(pingX + 7, edgeY - 7);
      }
      ctx.closePath();
      ctx.fill();
      drawLabel(ctx, ai.name, pingX, atTop ? edgeY + 18 : edgeY - 11, { align: "center", size: 11 });
    }
  });

  const nitroActive = ts < state.nitroUntil;
  // Player car's curve offset, sampled once at its fixed screen row (carY),
  // and reused for the shadow/trail/nitro-overlay/sprite below so they all
  // move together rather than drifting apart.
  const playerX = state.x + curveOffsetAtY(curveAmplitude, state.distance, carY, height);
  if (nitroActive) {
    // Continuous flame trail behind the player car — spawned every frame
    // nitro is active (see onNitro() above for the one-shot activation
    // burst). Two colors interleaved so the trail reads as fire rather than
    // a single flat-colored smear.
    const flameY = height * 0.78 + carH * 0.42;
    particles.trail(playerX - carW * 0.15, flameY, "#ffd43b", 2);
    particles.trail(playerX + carW * 0.15, flameY, "#ff9e3d", 2);
  }
  drawShadow(ctx, playerX, height * 0.78 + carH / 2 - 2, carW * 1.1);
  if (nitroActive) {
    ctx.fillStyle = "rgba(255,212,59,0.5)";
    ctx.fillRect(playerX - carW / 2, height * 0.78 + carH / 2, carW, height * 0.08);
  }
  if (isReady(SPRITES.carPlayer)) {
    ctx.drawImage(SPRITES.carPlayer, playerX - carW / 2, height * 0.78 - carH / 2, carW, carH);
    if (nitroActive) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "#ffd43b";
      ctx.beginPath();
      ctx.roundRect(playerX - carW / 2, height * 0.78 - carH / 2, carW, carH, 8);
      ctx.fill();
      ctx.restore();
    }
  } else {
    ctx.fillStyle = nitroActive ? "#ffd43b" : "#2ee6d6";
    ctx.beginPath();
    ctx.roundRect(playerX - carW / 2, height * 0.78 - carH / 2, carW, carH, 8);
    ctx.fill();
  }

  // Particles are drawn in the same (scaled/translated) road space they were
  // spawned in, so the flame trail/sparks/debris scroll and sit exactly
  // where the car and crash actually are.
  particles.draw(ctx);

  ctx.restore(); // road transform
  ctx.restore(); // shake — HUD text below stays put even while the world shakes

  drawLabel(ctx, `${Math.round(state.speed * 20)} mph`, 10, 22, { size: 15 });
  // Nitro state is otherwise shown via color (gold tint) + flame trail — add
  // a text label here too, matching the "charging…"/"ready!" labels already
  // shown the rest of the time, so the state is legible without relying on
  // color at all.
  if (nitroActive) {
    drawLabel(ctx, "NITRO!", width - 10, 22, { align: "right", size: 15, fill: "#ffd43b" });
  } else if (ts - state.lastNitroAt < NITRO_COOLDOWN) {
    drawLabel(ctx, "nitro charging…", width - 10, 22, { align: "right", size: 13 });
  } else {
    drawLabel(ctx, "nitro ready!", width - 10, 22, { align: "right", size: 13, fill: "#8bff56" });
  }

  drawLabel(ctx, `LAP ${Math.min(state.lap, state.totalLaps)}/${state.totalLaps}`, 10, 42, { size: 15 });
  drawLabel(ctx, `${ordinal(getPlayerPosition(state))} place`, width - 10, 42, { align: "right", size: 15 });

  if (ts < state.lapBannerUntil) {
    const progress = 1 - (state.lapBannerUntil - ts) / LAP_BANNER_MS;
    drawBanner(ctx, `LAP ${state.lapBannerLap} of ${state.totalLaps}!`, width / 2, height / 2, progress);
  }

  if (state.finished || state.dnf) {
    if (state.finished) {
      drawBanner(ctx, `Finished — ${ordinal(getPlayerPosition(state))} place!`, width / 2, height / 2, 1, {
        fill: "#2ee6d6",
        size: 26,
      });
    } else {
      drawBanner(ctx, "DNF — too many crashes", width / 2, height / 2, 1, { fill: "#ff4d8d", size: 24 });
    }
  }
}
