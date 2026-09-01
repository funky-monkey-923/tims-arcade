// All CanvasRenderingContext2D calls for Kickoff Clash live here — the
// "UI" half's rendering concern, kept separate from engine.ts's game rules.
//
// This module owns every cosmetic-only bit of state (particles, screen
// shake, goal banners, net ripples, the kickoff countdown overlay, sprint
// dust/motion tracking) at module scope — none of it feeds back into
// engine.ts. KickoffClash.tsx triggers these through the small exported
// functions below (onGoal/onKick/onWhistle/setCountdown) from the same
// `if (events.…)` blocks where it plays sfx, and calls resetEffects() when a
// fresh match starts so a previous match's confetti/shake/banners can't leak
// into the next mount (GameShell fully unmounts/remounts between matches,
// but this module's state does not reset itself).

import { drawShadow, isReady, PLAYER_SPRITE_FACING, SOCCER_PLAYER_SPRITES, SPRITES } from "../../lib/sprites";
import { ParticleField, ScreenShake } from "../../lib/particles";
import { drawBanner, drawLabel, drawOutlinedText } from "../../lib/canvasText";
import { scaleForMotion } from "../../lib/motion";
import type { AIChar, PlayerChar, SoccerState } from "./engine";

const STAMINA_LOW_THRESHOLD = 25;
const CHARGE_MAX_MS = 850;

// ---- Cosmetic-only module state ------------------------------------------
// See file header: none of this is read by engine.ts, and all of it is
// cleared by resetEffects().

const particles = new ParticleField();
const shake = new ScreenShake();

let prevDrawTs = 0;

interface MotionTrack {
  prevX: number;
  prevY: number;
  seeded: boolean;
  speed: number; // px/frame, roughly — draw() is called once per rAF tick same as step()
}
function freshTrack(): MotionTrack {
  return { prevX: 0, prevY: 0, seeded: false, speed: 0 };
}
const motionTrack = {
  player: freshTrack(),
  teammate: freshTrack(),
  opp1: freshTrack(),
  opp2: freshTrack(),
  ball: freshTrack(),
};

function updateTrack(track: MotionTrack, x: number, y: number): number {
  if (!track.seeded) {
    track.prevX = x;
    track.prevY = y;
    track.seeded = true;
    track.speed = 0;
    return 0;
  }
  const speed = Math.hypot(x - track.prevX, y - track.prevY);
  track.prevX = x;
  track.prevY = y;
  track.speed = speed;
  return speed;
}

interface GoalBanner {
  text: string;
  startTs: number;
  durationMs: number;
  fill: string;
  outline: string;
}
let goalBanner: GoalBanner | null = null;

interface NetRipple {
  side: "left" | "right";
  startTs: number;
}
let netRipple: NetRipple | null = null;
const NET_RIPPLE_MS = 550;

// Deferred rather than spawned directly in onGoal(): that function only
// knows *that* a goal went in, not the canvas width/height needed to place a
// centered burst — same reason MunchMaze's ghost-eaten/caught events queue
// until draw() knows this frame's geometry. Drained on the very next draw().
let pendingGoalConfetti = false;

let kickFlashUntil = 0; // ball squash-on-strike window
let kickFlashStart = 0;

interface WhistleRing {
  startTs: number;
}
let whistleRing: WhistleRing | null = null;
const WHISTLE_RING_MS = 450;

let countdownLabel: string | null = null;
let countdownSetAt = 0;
const COUNTDOWN_LABEL_MS = 900;

let ballSpinAngle = 0;

/** Kickoff Clash: a goal just went in. `scoredByPlayer` gates the
 * celebration — per the brief, the CPU's goal gets sound + a calmer banner
 * but no confetti/shake/cheer-worthy fanfare visuals. */
export function onGoal(scoredByPlayer: boolean, tsMs: number): void {
  netRipple = { side: scoredByPlayer ? "right" : "left", startTs: tsMs };
  if (scoredByPlayer) {
    shake.trigger(16, 420);
    goalBanner = { text: "GOAL!", startTs: tsMs, durationMs: 1700, fill: "#ffd43b", outline: "#150c33" };
    // The player's own goal is this game's biggest celebratory moment (it
    // already gets the biggest banner + strongest shake of any event here),
    // but had no particle burst at all — confetti() exists specifically for
    // this (see its doc comment in lib/particles.ts) and was simply never
    // wired in. Kept out of the CPU-scored branch on purpose, matching the
    // existing "no cheer-worthy fanfare" rule for the opponent's goal.
    pendingGoalConfetti = true;
  } else {
    shake.trigger(7, 220);
    goalBanner = { text: "They scored...", startTs: tsMs, durationMs: 1300, fill: "#c9295f", outline: "#150c33" };
  }
}

/** A ball strike (charge-up shot fired, by anyone). Kicks up turf and gives
 * the ball a brief squash. */
export function onKick(x: number, y: number, tsMs: number): void {
  particles.dust(x, y, Math.random() * Math.PI * 2, 8);
  kickFlashUntil = tsMs + 140;
  kickFlashStart = tsMs;
}

/** Any whistle moment (kickoff, halftime, full-time) — a soft expanding ring
 * at center pitch. Deliberately not a screen flash: rapid full-screen
 * flashing is off the table (see the a11y note in draw()). */
export function onWhistle(tsMs: number): void {
  whistleRing = { startTs: tsMs };
}

/** Purely-presentational kickoff countdown label ("3", "2", "1", "GO!").
 * KickoffClash.tsx owns the state machine/timers; this just displays
 * whatever it's told, banner-style. Pass `null` to clear. */
export function setCountdown(label: string | null, tsMs: number): void {
  countdownLabel = label;
  countdownSetAt = tsMs;
}

/** Clears every bit of cosmetic state. Call once when a fresh match starts —
 * GameShell fully unmounts/remounts KickoffClash between playthroughs, but
 * this module's state would otherwise leak into the next one. */
export function resetEffects(): void {
  particles.clear();
  shake.clear();
  prevDrawTs = 0;
  motionTrack.player = freshTrack();
  motionTrack.teammate = freshTrack();
  motionTrack.opp1 = freshTrack();
  motionTrack.opp2 = freshTrack();
  motionTrack.ball = freshTrack();
  goalBanner = null;
  netRipple = null;
  kickFlashUntil = 0;
  whistleRing = null;
  countdownLabel = null;
  ballSpinAngle = 0;
  pendingGoalConfetti = false;
}

// ---- Pitch / stadium ------------------------------------------------------

const CROWD_BAND_H = 12;

// Crowd dot positions are precomputed once per canvas size and cached rather
// than re-randomized every frame — a stippled crowd that reshuffles 60x/sec
// would read as static noise, not a stand full of people.
let crowdDotsCache: { w: number; h: number; dots: { x: number; y: number; c: string; top: boolean }[] } | null = null;
const CROWD_COLORS = ["rgba(245,245,255,0.55)", "rgba(245,245,255,0.3)", "rgba(255,212,59,0.35)", "rgba(46,230,214,0.25)"];

function getCrowdDots(width: number, height: number) {
  if (crowdDotsCache && crowdDotsCache.w === width && crowdDotsCache.h === height) return crowdDotsCache.dots;
  const dots: { x: number; y: number; c: string; top: boolean }[] = [];
  const gap = 6;
  for (let x = 4; x < width - 4; x += gap) {
    dots.push({ x, y: rand2(x, 1) * CROWD_BAND_H, c: CROWD_COLORS[Math.floor(rand2(x, 2) * CROWD_COLORS.length)], top: true });
    dots.push({ x, y: rand2(x, 3) * CROWD_BAND_H, c: CROWD_COLORS[Math.floor(rand2(x, 4) * CROWD_COLORS.length)], top: false });
  }
  crowdDotsCache = { w: width, h: height, dots };
  return dots;
}

// Deterministic pseudo-random in [0,1) from a couple of integer seeds — used
// so the crowd stipple pattern is stable across a resize-free session
// without needing to store a big array of Math.random() calls up front.
function rand2(a: number, b: number): number {
  const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function drawCrowd(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.save();
  for (const dot of getCrowdDots(width, height)) {
    ctx.fillStyle = dot.c;
    ctx.beginPath();
    ctx.arc(dot.x, dot.top ? dot.y + 2 : height - dot.y - 2, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawGoalNet(ctx: CanvasRenderingContext2D, x: number, goalTop: number, goalBottom: number, depth: number, side: "left" | "right", tsMs: number): void {
  const meshGap = 6;
  const h = goalBottom - goalTop;
  ctx.save();
  ctx.strokeStyle = "rgba(245,245,255,0.4)";
  ctx.lineWidth = 1;

  let bulge = 0;
  if (netRipple && netRipple.side === side) {
    const progress = (tsMs - netRipple.startTs) / NET_RIPPLE_MS;
    if (progress >= 0 && progress < 1) bulge = scaleForMotion((1 - progress) * depth * 0.8);
  }
  const dir = side === "left" ? -1 : 1;

  for (let i = 0; i <= depth; i += meshGap) {
    // vertical mesh lines, bulging outward (away from the pitch) near mid-height
    ctx.beginPath();
    for (let y = goalTop; y <= goalBottom; y += 4) {
      const t = (y - goalTop) / h;
      const sway = Math.sin(t * Math.PI) * bulge * (i / Math.max(1, depth));
      const px = x + dir * i + dir * sway;
      if (y === goalTop) ctx.moveTo(px, y);
      else ctx.lineTo(px, y);
    }
    ctx.stroke();
  }
  for (let y = goalTop; y <= goalBottom; y += meshGap) {
    ctx.beginPath();
    const t = (y - goalTop) / h;
    const sway = Math.sin(t * Math.PI) * bulge;
    ctx.moveTo(x, y);
    ctx.lineTo(x + dir * depth + dir * sway, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPitch(ctx: CanvasRenderingContext2D, width: number, height: number, goalTop: number, goalBottom: number, tsMs: number): void {
  ctx.clearRect(0, 0, width, height);

  // Stadium exterior behind the crowd band.
  ctx.fillStyle = "#0b1f14";
  ctx.fillRect(0, 0, width, height);
  drawCrowd(ctx, width, height);

  const pitchTop = CROWD_BAND_H;
  const pitchBottom = height - CROWD_BAND_H;
  const pitchH = pitchBottom - pitchTop;

  // Mown stripes: alternating light/dark green vertical bands.
  const stripeCount = 8;
  const stripeW = width / stripeCount;
  for (let i = 0; i < stripeCount; i++) {
    ctx.fillStyle = i % 2 === 0 ? "#1d4a26" : "#194020";
    ctx.fillRect(i * stripeW, pitchTop, stripeW + 1, pitchH);
  }

  // Floodlight vignette — soft darkening at the corners.
  const vignette = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.25, width / 2, height / 2, Math.max(width, height) * 0.72);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.38)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, pitchTop, width, pitchH);

  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 2;
  ctx.strokeRect(6, pitchTop + 4, width - 12, pitchH - 8);

  // Halfway line + centre circle.
  ctx.beginPath();
  ctx.moveTo(width / 2, pitchTop + 4);
  ctx.lineTo(width / 2, pitchBottom - 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(width / 2, height / 2, height * 0.12, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(width / 2, height / 2, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fill();

  // Penalty boxes.
  const boxW = width * 0.14;
  const boxH = pitchH * 0.55;
  ctx.strokeRect(6, height / 2 - boxH / 2, boxW, boxH);
  ctx.strokeRect(width - 6 - boxW, height / 2 - boxH / 2, boxW, boxH);

  // Corner arcs.
  const cr = height * 0.045;
  ctx.beginPath();
  ctx.arc(6, pitchTop + 4, cr, 0, Math.PI / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(width - 6, pitchTop + 4, cr, Math.PI / 2, Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(6, pitchBottom - 4, cr, -Math.PI / 2, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(width - 6, pitchBottom - 4, cr, Math.PI, Math.PI * 1.5);
  ctx.stroke();

  // Goal frames + procedural nets (drawn before the frame stroke so the
  // mesh reads as sitting inside the goal, not on top of the frame).
  drawGoalNet(ctx, -2, goalTop, goalBottom, 12, "left", tsMs);
  drawGoalNet(ctx, width + 2, goalTop, goalBottom, 12, "right", tsMs);

  ctx.strokeStyle = "#f5f5ff";
  ctx.lineWidth = 4;
  ctx.strokeRect(-4, goalTop, 14, goalBottom - goalTop);
  ctx.strokeRect(width - 10, goalTop, 14, goalBottom - goalTop);

  if (isReady(SPRITES.cornerFlag)) {
    const f = height * 0.05;
    const inset = 10;
    const corners: [number, number][] = [
      [inset, inset],
      [width - inset - f, inset],
      [inset, height - inset - f],
      [width - inset - f, height - inset - f],
    ];
    for (const [cx, cy] of corners) {
      ctx.drawImage(SPRITES.cornerFlag, cx, cy, f, f);
    }
  }
}

// ---- Characters -------------------------------------------------------

const SPRINT_DUST_THRESHOLD = 4.2; // px/frame — only the player's dodge burst clears this

function drawCharacter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  heading: number,
  sprite: HTMLImageElement,
  tint: string,
  track: MotionTrack,
  ts: number,
  isSelf: boolean
): void {
  const speed = updateTrack(track, x, y);

  drawShadow(ctx, x, y + r * 0.7, r * 1.8);

  const bobAmp = scaleForMotion(Math.min(1, speed / 3) * 2);
  const bob = Math.sin(ts / 90) * bobAmp;
  const squash = scaleForMotion(Math.min(1, speed / 5) * 0.12);

  if (isReady(sprite)) {
    const targetH = r * 2.5;
    const targetW = targetH * (sprite.naturalWidth / Math.max(1, sprite.naturalHeight));
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.rotate(heading + PLAYER_SPRITE_FACING);
    // Squash/stretch along the direction of travel (local +X after rotate),
    // stronger when sprinting — cheap fake-locomotion in place of run frames.
    ctx.scale(1 + squash, 1 - squash);
    ctx.drawImage(sprite, -targetW / 2, -targetH / 2, targetW, targetH);
    // Kit-color tint: only paints the sprite's own opaque pixels, so the
    // face/hair detail stays legible and the team color still reads at a
    // glance as an underlay accent rather than replacing the art.
    ctx.globalCompositeOperation = "source-atop";
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = tint;
    ctx.fillRect(-targetW / 2, -targetH / 2, targetW, targetH);
    ctx.restore();
  } else {
    ctx.fillStyle = tint;
    ctx.beginPath();
    ctx.arc(x, y + bob, r, 0, Math.PI * 2);
    ctx.fill();
  }

  if (isSelf) drawSelfRing(ctx, x, y + bob, r);

  if (speed > SPRINT_DUST_THRESHOLD) {
    particles.dust(x - Math.cos(heading) * r, y - Math.sin(heading) * r, heading + Math.PI, 2);
  }
}

// Which sprite is "you" is otherwise conveyed by color + a same-color
// teammate now sharing the field — a white ring around the player-
// controlled sprite only (never the teammate's, even though they share a
// tint) gives a shape-based tell that doesn't depend on distinguishing hues.
function drawSelfRing(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.save();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2.5;
  ctx.shadowColor = "rgba(255,255,255,0.6)";
  ctx.shadowBlur = 4;
  ctx.beginPath();
  ctx.arc(x, y, r + 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawChargeMeter(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number): void {
  ctx.save();
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(x, y, r + 9, -Math.PI / 2, Math.PI * 1.5);
  ctx.stroke();
  ctx.strokeStyle = t >= 1 ? "#ffd43b" : "#8bff56";
  ctx.beginPath();
  ctx.arc(x, y, r + 9, -Math.PI / 2, -Math.PI / 2 + t * Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawAI(ctx: CanvasRenderingContext2D, ai: AIChar, sprite: HTMLImageElement, tint: string, track: MotionTrack, ts: number): void {
  drawCharacter(ctx, ai.x, ai.y, ai.r, ai.heading, sprite, tint, track, ts, false);
}

// ---- Ball ------------------------------------------------------------

function drawBall(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, ts: number): void {
  const speed = updateTrack(motionTrack.ball, x, y);
  ballSpinAngle += speed / Math.max(1, r);

  const kicking = ts < kickFlashUntil;
  const kickT = kicking ? 1 - (kickFlashUntil - ts) / Math.max(1, kickFlashUntil - kickFlashStart) : 1;
  const squash = kicking ? scaleForMotion((1 - kickT) * 0.28) : 0;

  if (speed > 3) {
    particles.trail(x, y, "rgba(245,245,255,0.65)", 1);
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ballSpinAngle);
  ctx.scale(1 + squash, 1 - squash);
  if (isReady(SPRITES.soccerBall)) {
    const d = r * 2;
    ctx.drawImage(SPRITES.soccerBall, -d / 2, -d / 2, d, d);
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ---- HUD ---------------------------------------------------------------

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawStaminaBar(ctx: CanvasRenderingContext2D, player: PlayerChar, width: number): void {
  const barW = width * 0.3;
  const barH = 9;
  const x = 10;
  const y = 56;
  ctx.save();
  ctx.fillStyle = "rgba(11,31,20,0.55)";
  roundedRect(ctx, x - 4, y - 15, barW + 8, barH + 20, 6);
  ctx.fill();

  ctx.fillStyle = "rgba(0,0,0,0.45)";
  roundedRect(ctx, x, y, barW, barH, 4);
  ctx.fill();
  const pct = player.stamina / 100;
  const low = player.stamina < STAMINA_LOW_THRESHOLD;
  ctx.fillStyle = low ? "#ff4d8d" : "#8bff56";
  roundedRect(ctx, x, y, barW * pct, barH, 4);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1;
  roundedRect(ctx, x, y, barW, barH, 4);
  ctx.stroke();
  ctx.restore();

  drawLabel(ctx, low ? "STAMINA ⚠" : "STAMINA", x, y - 4, { size: 9, fill: low ? "#ffb3cf" : "#f5f5ff" });
}

function drawScoreClock(ctx: CanvasRenderingContext2D, state: SoccerState, width: number): void {
  ctx.save();
  const panelW = 150;
  const panelH = 44;
  ctx.fillStyle = "rgba(11,31,20,0.6)";
  roundedRect(ctx, width / 2 - panelW / 2, 6, panelW, panelH, 10);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 1;
  roundedRect(ctx, width / 2 - panelW / 2, 6, panelW, panelH, 10);
  ctx.stroke();

  // Team-color chips flank the score so the tally still reads without
  // relying on which number is "yours" being memorized.
  ctx.fillStyle = "#2ee6d6";
  ctx.beginPath();
  ctx.arc(width / 2 - 34, 24, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ff4d8d";
  ctx.beginPath();
  ctx.arc(width / 2 + 34, 24, 5, 0, Math.PI * 2);
  ctx.fill();

  drawOutlinedText(ctx, `${state.playerGoals} - ${state.cpuGoals}`, width / 2, 30, {
    size: 18,
    fill: "#f5f5ff",
    outline: "#0b1f14",
    outlineWidth: 3,
    align: "center",
    baseline: "middle",
  });

  const half = state.half === 1 ? "1st Half" : "2nd Half";
  drawLabel(ctx, `${half}  •  ${Math.max(0, Math.ceil(state.timeLeft / 1000))}s`, width / 2, 44, {
    size: 11,
    fill: "#cfe8d8",
    align: "center",
  });
  ctx.restore();
}

function drawHalftimeBanner(ctx: CanvasRenderingContext2D, state: SoccerState, width: number, height: number): void {
  ctx.save();
  ctx.fillStyle = "rgba(11,10,26,0.7)";
  ctx.fillRect(0, height * 0.36, width, height * 0.28);
  drawOutlinedText(ctx, "Halftime!", width / 2, height / 2 - 6, {
    size: 26,
    fill: "#ffd43b",
    outline: "#150c33",
    outlineWidth: 4,
    align: "center",
    baseline: "middle",
  });
  drawOutlinedText(ctx, `${state.playerGoals} - ${state.cpuGoals}`, width / 2, height / 2 + 22, {
    size: 18,
    fill: "#f5f5ff",
    outline: "#150c33",
    outlineWidth: 3,
    align: "center",
    baseline: "middle",
  });
  ctx.restore();
}

function drawShootout(ctx: CanvasRenderingContext2D, state: SoccerState, ts: number, width: number, height: number): void {
  const so = state.shootout;
  if (!so) return;
  const goalHalf = height * 0.16;
  const goalTop = height / 2 - goalHalf;
  const goalBottom = height / 2 + goalHalf;
  drawPitch(ctx, width, height, goalTop, goalBottom, ts);

  ctx.save();
  ctx.fillStyle = "rgba(11,10,26,0.55)";
  roundedRect(ctx, width / 2 - 80, 10, 160, 30, 8);
  ctx.fill();
  ctx.restore();
  drawOutlinedText(ctx, "Penalties!", width / 2, 30, {
    size: 20,
    fill: "#ffd43b",
    outline: "#150c33",
    outlineWidth: 3,
    align: "center",
    baseline: "middle",
  });

  // running tally: filled = make, hollow = miss, dim = not yet taken
  const pipR = 6;
  const gap = 16;
  const rowY = 52;
  const attempts = Math.max(so.playerAttempts.length, so.cpuAttempts.length, 3);
  for (let i = 0; i < attempts; i++) {
    const px = width / 2 - ((attempts - 1) * gap) / 2 + i * gap;
    const made = so.playerAttempts[i];
    ctx.beginPath();
    ctx.arc(px, rowY, pipR, 0, Math.PI * 2);
    ctx.fillStyle = made === undefined ? "rgba(255,255,255,0.2)" : made ? "#8bff56" : "#ff4d8d";
    ctx.fill();
    const cMade = so.cpuAttempts[i];
    ctx.beginPath();
    ctx.arc(px, rowY + 16, pipR, 0, Math.PI * 2);
    ctx.fillStyle = cMade === undefined ? "rgba(255,255,255,0.2)" : cMade ? "#8bff56" : "#ff4d8d";
    ctx.fill();
  }
  drawLabel(ctx, "YOU", width / 2 - ((attempts - 1) * gap) / 2 - 10, rowY + 3, { size: 10, align: "right" });
  drawLabel(ctx, "CPU", width / 2 - ((attempts - 1) * gap) / 2 - 10, rowY + 19, { size: 10, align: "right" });

  const goalX = width - 20;
  const keeperX = goalX - 20;
  drawShadow(ctx, keeperX, height / 2, 20);
  let keeperY = height / 2;
  let keeperHeading = Math.PI; // faces the pitch (left)
  if (so.keeperDiveDir === -1) {
    keeperY = height / 2 - goalHalf * 0.7;
    keeperHeading = Math.PI - 0.6;
  } else if (so.keeperDiveDir === 1) {
    keeperY = height / 2 + goalHalf * 0.7;
    keeperHeading = Math.PI + 0.6;
  }
  const keeperSprite = SOCCER_PLAYER_SPRITES.keeper;
  if (isReady(keeperSprite)) {
    const targetH = 30;
    const targetW = targetH * (keeperSprite.naturalWidth / Math.max(1, keeperSprite.naturalHeight));
    ctx.save();
    ctx.translate(keeperX, keeperY);
    ctx.rotate(keeperHeading + PLAYER_SPRITE_FACING);
    ctx.drawImage(keeperSprite, -targetW / 2, -targetH / 2, targetW, targetH);
    ctx.restore();
  } else {
    ctx.fillStyle = "#ffd43b";
    ctx.beginPath();
    ctx.arc(keeperX, keeperY, 12, 0, Math.PI * 2);
    ctx.fill();
  }

  let ballX = so.ballX;
  let ballY = so.ballY;
  if (so.stage === "resolving" && so.resolveAt !== null) {
    const total = 800;
    const remaining = Math.max(0, so.resolveAt - ts);
    const progress = Math.min(1, Math.max(0, 1 - remaining / total));
    const targetY = so.shotDir === -1 ? height / 2 - goalHalf * 0.7 : so.shotDir === 1 ? height / 2 + goalHalf * 0.7 : height / 2;
    ballX = so.ballX + (goalX - so.ballX) * progress;
    ballY = so.ballY + (targetY - so.ballY) * progress;
  }
  drawBall(ctx, ballX, ballY, 10, ts);
  particles.draw(ctx);

  if (so.stage === "aiming" && so.turn === "player") {
    drawLabel(ctx, "←/→ aim, hold shoot to charge", width / 2, height - 16, { size: 12, align: "center" });
  }
}

export function draw(ctx: CanvasRenderingContext2D, state: SoccerState, ts: number, width: number, height: number): void {
  const dt = prevDrawTs ? ts - prevDrawTs : 16.7;
  prevDrawTs = ts;
  particles.update(dt);
  shake.update(dt);

  if (pendingGoalConfetti) {
    pendingGoalConfetti = false;
    // Rains down across a wide band over the pitch, per confetti()'s own
    // design (see lib/particles.ts) — not aimed at a specific goal mouth.
    particles.confetti(width / 2, height * 0.12);
  }

  const goalHalf = height * 0.16;
  const goalTop = height / 2 - goalHalf;
  const goalBottom = height / 2 + goalHalf;

  if (state.phase === "shootout") {
    drawShootout(ctx, state, ts, width, height);
    return;
  }

  ctx.save();
  shake.apply(ctx);

  drawPitch(ctx, width, height, goalTop, goalBottom, ts);

  // Teammate/opponents share their side's tint, in a distinct shade so the
  // player's own sprite (marked with the white self-ring) still stands out;
  // each also gets a visibly different face/hair sprite so "you vs. your
  // teammate" and "defender 1 vs. defender 2" stay distinguishable.
  drawAI(ctx, state.teammate, SOCCER_PLAYER_SPRITES.teammate, "#8ff2e6", motionTrack.teammate, ts);
  drawAI(ctx, state.opp1, SOCCER_PLAYER_SPRITES.opponentA, "#ff4d8d", motionTrack.opp1, ts);
  drawAI(ctx, state.opp2, SOCCER_PLAYER_SPRITES.opponentB, "#c9295f", motionTrack.opp2, ts);

  drawCharacter(ctx, state.player.x, state.player.y, state.player.r, state.player.heading, SOCCER_PLAYER_SPRITES.player, "#2ee6d6", motionTrack.player, ts, true);

  drawBall(ctx, state.ball.x, state.ball.y, state.ball.r, ts);

  if (state.player.chargeStart !== null) {
    const t = Math.min(1, (ts - state.player.chargeStart) / CHARGE_MAX_MS);
    drawChargeMeter(ctx, state.player.x, state.player.y, state.player.r, t);
  }

  particles.draw(ctx);

  // Whistle ring: a soft expanding circle at center pitch, not a screen
  // flash — see the a11y note in KickoffClash.tsx's task brief about never
  // flashing the whole screen.
  if (whistleRing) {
    const progress = (ts - whistleRing.startTs) / WHISTLE_RING_MS;
    if (progress >= 0 && progress < 1) {
      ctx.save();
      ctx.globalAlpha = (1 - progress) * 0.6;
      ctx.strokeStyle = "#f5f5ff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, scaleForMotion(10 + progress * 60) || 1, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else {
      whistleRing = null;
    }
  }

  ctx.restore(); // end shake-affected layer — HUD below stays screen-locked

  drawScoreClock(ctx, state, width);
  drawStaminaBar(ctx, state.player, width);

  if (state.phase === "halftime") drawHalftimeBanner(ctx, state, width, height);

  if (goalBanner) {
    const progress = (ts - goalBanner.startTs) / goalBanner.durationMs;
    if (progress >= 1) {
      goalBanner = null;
    } else {
      drawBanner(ctx, goalBanner.text, width / 2, height * 0.4, progress, {
        size: 40,
        fill: goalBanner.fill,
        outline: goalBanner.outline,
        outlineWidth: 5,
      });
    }
  }

  if (countdownLabel !== null) {
    ctx.save();
    ctx.fillStyle = "rgba(11,10,26,0.35)";
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
    const progress = Math.min(1, (ts - countdownSetAt) / COUNTDOWN_LABEL_MS);
    drawBanner(ctx, countdownLabel, width / 2, height / 2, progress, {
      size: 56,
      fill: countdownLabel === "GO!" ? "#8bff56" : "#ffd43b",
      outline: "#0b1f14",
      outlineWidth: 6,
    });
  }
}
