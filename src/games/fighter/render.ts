// All CanvasRenderingContext2D calls for Rumble Ring live here — the "UI"
// half's rendering concern, kept separate from engine.ts's game rules.
//
// Deep artistic overhaul: fighters now draw as real animated sprite pose
// sets (see FIGHTER_SPRITES in lib/sprites.ts) instead of flat roundRects,
// the arena has crowd/ring-post/rope theming instead of a bare gradient,
// hits carry particles + screen shake, banners use the shared drawBanner()
// slam-in, and the HUD uses lib/canvasText.ts helpers throughout.
//
// All cosmetic-only state (particles, shake, banner timing, walk-cycle
// frame timing) lives at module scope here — never in engine state — per
// the engine/render split documented in engineTypes.ts. RumbleRing.tsx calls
// the small exported trigger functions below from the same `if (events.…)`
// blocks where it already plays SFX, and calls resetEffects() when a new
// match starts (GameShell fully unmounts/remounts between playthroughs, so
// module state here would otherwise leak into the next one).

import { drawShadow, isReady, SPRITES, FIGHTER_SPRITES, fighterPoseSetReady, type FighterPoseSet } from "../../lib/sprites";
import { ParticleField, ScreenShake } from "../../lib/particles";
import { drawBanner, drawLabel, drawOutlinedText, displayFont } from "../../lib/canvasText";
import type { Fighter, FighterState, MatchPhase, MatchState } from "./engine";

const MAX_HEALTH = 100;
// Mirrors computeMoveInfo()'s ranges in engine.ts just for the glove/limb
// visual reach — render.ts never touches gameplay ranges, this is purely
// "how far out from the body to draw the effect".
const VISUAL_REACH: Record<string, number> = {
  punch: 0.16,
  kick: 0.22,
  throw: 0.14,
  super: 0.22,
};

// ---- Cosmetic-only module state --------------------------------------

const particles = new ParticleField();
const shake = new ScreenShake();

// Round/match banner: timed from the moment we notice state.phase change
// (detected here, not signalled by RumbleRing.tsx — MatchState already
// carries everything the banner needs: phase, round, roundsWon, health).
let lastPhase: MatchPhase = "fighting";
let bannerStartTs = 0;
// Kept a touch under RumbleRing.tsx's ROUND_BANNER_MS pause so the banner's
// fade always finishes before the next round/setup screen appears.
const BANNER_ANIM_MS = 1400;

// draw() gets a raw rAF timestamp, not a per-frame delta, so particles/shake
// (which integrate in real ms) track the previous frame's ts themselves.
// Reset alongside everything else in resetEffects() so a fresh match doesn't
// briefly see a huge synthetic delta from the previous match's last frame.
let lastDrawTs: number | null = null;

// Walk-cycle frame toggle is a pure function of `ts`, so it needs no stored
// state to reset between matches.
const WALK_FRAME_MS = 140;

export function resetEffects(): void {
  particles.clear();
  shake.clear();
  lastPhase = "fighting";
  bannerStartTs = 0;
  lastDrawTs = null;
}

// ---- Exported hit/impact triggers ------------------------------------
// Called by RumbleRing.tsx from the same tick-loop branches that already
// play SFX for these events. Coordinates are approximate (the midpoint
// between the two fighters, roughly torso height) since these are purely
// decorative and the exact pixel doesn't matter.

export function onHitLanded(x: number, y: number, heavy: boolean): void {
  particles.sparks(x, y, heavy ? 40 : 16);
  shake.trigger(heavy ? 14 : 4, heavy ? 260 : 120);
}

export function onBlock(x: number, y: number): void {
  particles.sparks(x, y, 8);
  shake.trigger(2, 80);
}

export function onKo(x: number, y: number): void {
  particles.sparks(x, y, 50);
  particles.debris(x, y, 22);
  shake.trigger(20, 420);
}

// ---- Fighter sprite pose selection ------------------------------------

// Maps a fighter's live FighterState to the closest pose in its
// FighterPoseSet. There's no dedicated "block" pose — `duck` (a crouched
// guard stance) is the best fit. There's no dedicated "throw"/"super" pose
// either: `punch` reads best for both — a throw is a quick grab-and-heave
// (a punch-like forward reach sells it fine at this scale) and a super's
// long active window is already carried by the pulsing color-glow ring
// drawn behind the body, so reusing `punch` there keeps the charged attack
// looking like a bigger, held punch rather than introducing a mismatched
// idle stance mid-special.
function pickPoseImage(poses: FighterPoseSet, state: FighterState, ts: number): HTMLImageElement {
  switch (state) {
    case "idle":
      return poses.idle;
    case "walk":
      return Math.floor(ts / WALK_FRAME_MS) % 2 === 0 ? poses.walk[0] : poses.walk[1];
    case "jump":
      return poses.jump;
    case "block":
      return poses.duck;
    case "hit":
      return poses.hurt;
    case "punch":
    case "throw":
    case "super":
      return poses.punch;
    case "kick":
      return poses.kick;
    default:
      return poses.idle;
  }
}

function drawFighterFallback(ctx: CanvasRenderingContext2D, f: Fighter, width: number, height: number): void {
  const w = width * 0.07;
  const h = height * 0.24;
  const bx = f.x - w / 2;
  const by = f.y - h;

  ctx.fillStyle = f.state === "hit" ? "#ffffff" : f.color;
  ctx.beginPath();
  ctx.roundRect(bx, by, w, h, 8);
  ctx.fill();

  if (f.state === "block") {
    ctx.strokeStyle = "#ffd43b";
    ctx.lineWidth = 3;
    ctx.strokeRect(bx - 2, by - 2, w + 4, h + 4);
  }
  // face marker showing facing direction
  ctx.fillStyle = "#150c33";
  ctx.beginPath();
  ctx.arc(f.x + f.facing * w * 0.22, by + h * 0.18, w * 0.12, 0, Math.PI * 2);
  ctx.fill();
}

function drawFighterSprite(ctx: CanvasRenderingContext2D, f: Fighter, poses: FighterPoseSet, height: number, ts: number): void {
  const img = pickPoseImage(poses, f.state, ts);
  const spriteH = height * 0.28;
  const aspect = img.naturalWidth > 0 && img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 0.75;
  const spriteW = spriteH * aspect;

  // Colored accent glow underlay so each character still reads as "who's
  // who" at a glance even though the art itself isn't recolored per
  // character — per the brief, the color is kept as an accent rather than
  // dropped once real art exists.
  ctx.save();
  ctx.globalAlpha = 0.32;
  ctx.fillStyle = f.color;
  ctx.beginPath();
  ctx.ellipse(f.x, f.y - spriteH * 0.42, spriteW * 0.48, spriteH * 0.52, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(f.x, f.y);
  if (f.facing === -1) ctx.scale(-1, 1);
  ctx.drawImage(img, -spriteW / 2, -spriteH, spriteW, spriteH);
  ctx.restore();
}

function drawFighter(ctx: CanvasRenderingContext2D, f: Fighter, width: number, height: number, ground: number, ts: number): void {
  drawShadow(ctx, f.x, ground + 4, width * 0.07 * 1.6);

  // Super glow ring — drawn behind the body so it reads as an aura, not an
  // overlay on top of the fighter. Also the only visual cue distinguishing
  // a held "super" from a plain "punch" pose reuse (see pickPoseImage).
  if (f.state === "super") {
    const pulse = 0.55 + 0.35 * Math.sin(ts / 90);
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = f.color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(f.x, f.y - height * 0.14, width * 0.07 * 1.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  const poses = FIGHTER_SPRITES[f.charId];
  const useSprite = !!poses && fighterPoseSetReady(poses);
  if (useSprite && poses) {
    drawFighterSprite(ctx, f, poses, height, ts);
  } else {
    drawFighterFallback(ctx, f, width, height);
  }

  const w = width * 0.07;
  const h = height * 0.24;
  const by = f.y - h;

  if (f.state === "punch" || f.state === "kick" || f.state === "super") {
    const reach = f.facing * width * VISUAL_REACH[f.state];
    const cx = f.x + reach;
    const cy = by + h * 0.35;
    const size = f.state === "super" ? w * 1.3 : w * 0.7;
    if (isReady(SPRITES.gloveImpact)) {
      ctx.drawImage(SPRITES.gloveImpact, cx - size / 2, cy - size / 2, size, size);
    } else {
      ctx.fillStyle = f.state === "super" ? f.color : "#ffd43b";
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Throw: a simple lunge — an extended limb bar reaching toward the
  // opponent, distinct from the round glove-impact used by punch/kick/super.
  if (f.state === "throw") {
    const reach = f.facing * width * VISUAL_REACH.throw;
    const armY = by + h * 0.32;
    const armH = h * 0.12;
    ctx.fillStyle = "#ffe66d";
    ctx.beginPath();
    ctx.roundRect(f.x + Math.min(0, reach), armY, Math.abs(reach), armH, 4);
    ctx.fill();
  }
}

// ---- Arena background: crowd, ring posts, ropes, vignette -------------

// Crowd dot positions are precomputed once per canvas size and cached
// rather than re-randomized every frame — a stippled crowd that reshuffles
// 60x/sec would read as static noise, not a stand full of people (same
// technique as Kickoff Clash's stadium crowd in games/soccer/render.ts).
let crowdDotsCache: { w: number; h: number; dots: { x: number; y: number; c: string }[] } | null = null;
const CROWD_COLORS = ["rgba(245,245,255,0.5)", "rgba(245,245,255,0.28)", "rgba(255,212,59,0.32)", "rgba(46,230,214,0.22)"];
const CROWD_BAND_H_FRAC = 0.16;

function rand2(a: number, b: number): number {
  const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function getCrowdDots(width: number, height: number): { x: number; y: number; c: string }[] {
  if (crowdDotsCache && crowdDotsCache.w === width && crowdDotsCache.h === height) return crowdDotsCache.dots;
  const bandH = height * CROWD_BAND_H_FRAC;
  const dots: { x: number; y: number; c: string }[] = [];
  const gap = 7;
  for (let x = 3; x < width - 3; x += gap) {
    const rows = 3;
    for (let r = 0; r < rows; r++) {
      const y = 4 + rand2(x, r * 3 + 1) * (bandH - 8) + r * (bandH / rows) * 0.15;
      dots.push({ x, y, c: CROWD_COLORS[Math.floor(rand2(x, r * 5 + 2) * CROWD_COLORS.length)] });
    }
  }
  crowdDotsCache = { w: width, h: height, dots };
  return dots;
}

function drawCrowd(ctx: CanvasRenderingContext2D, width: number): void {
  ctx.save();
  for (const dot of getCrowdDots(width, ctx.canvas.height)) {
    ctx.fillStyle = dot.c;
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, 1.7, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawRingPosts(ctx: CanvasRenderingContext2D, width: number, height: number, ground: number): void {
  const postW = width * 0.018;
  const postTop = ground - height * 0.42;
  for (const side of [width * 0.045, width * 0.955]) {
    ctx.fillStyle = "#e8483f";
    ctx.beginPath();
    ctx.roundRect(side - postW / 2, postTop, postW, ground - postTop, postW / 2);
    ctx.fill();
    ctx.fillStyle = "#ffd43b";
    ctx.beginPath();
    ctx.arc(side, postTop, postW * 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawRopes(ctx: CanvasRenderingContext2D, width: number, height: number, ground: number): void {
  const left = width * 0.045;
  const right = width * 0.955;
  const ropeColors = ["#ff4d8d", "#f5f5ff", "#2ee6d6"];
  const ropeYs = [ground - height * 0.34, ground - height * 0.22, ground - height * 0.1];
  ctx.save();
  ctx.lineWidth = Math.max(2, height * 0.006);
  ropeYs.forEach((y, i) => {
    ctx.strokeStyle = ropeColors[i % ropeColors.length];
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
  });
  ctx.restore();
}

function drawVignette(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const grd = ctx.createRadialGradient(width / 2, height * 0.42, height * 0.15, width / 2, height * 0.42, width * 0.75);
  grd.addColorStop(0, "rgba(0,0,0,0)");
  grd.addColorStop(0.7, "rgba(10,6,26,0.1)");
  grd.addColorStop(1, "rgba(6,3,18,0.55)");
  ctx.save();
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  // Stage spotlight: a soft bright cone from directly overhead, brightest
  // over the fighting area rather than the crowd band.
  const spot = ctx.createRadialGradient(width / 2, height * 0.05, 0, width / 2, height * 0.05, height * 0.75);
  spot.addColorStop(0, "rgba(255,244,214,0.16)");
  spot.addColorStop(1, "rgba(255,244,214,0)");
  ctx.save();
  ctx.fillStyle = spot;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function drawArenaBackground(ctx: CanvasRenderingContext2D, width: number, height: number, ground: number): void {
  const grd = ctx.createLinearGradient(0, 0, 0, height);
  grd.addColorStop(0, "#1c0f45");
  grd.addColorStop(0.55, "#2e1a6b");
  grd.addColorStop(1, "#150c33");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, width, height);

  drawCrowd(ctx, width);

  const floorGrd = ctx.createLinearGradient(0, ground, 0, height);
  floorGrd.addColorStop(0, "#4a2a99");
  floorGrd.addColorStop(1, "#2b1760");
  ctx.fillStyle = floorGrd;
  ctx.fillRect(0, ground, width, height - ground);
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.beginPath();
  ctx.moveTo(0, ground);
  ctx.lineTo(width, ground);
  ctx.stroke();

  drawRingPosts(ctx, width, height, ground);
  drawRopes(ctx, width, height, ground);
  drawVignette(ctx, width, height);
}

// ---- HUD ---------------------------------------------------------------

function drawHud(ctx: CanvasRenderingContext2D, state: MatchState, width: number, ts: number): void {
  const pad = 14;
  const barW = width / 2 - pad * 2;
  const barH = 16;
  const meterH = 6;

  // health bars — bar length + a numeric readout, never color alone.
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(pad, pad, barW, barH);
  ctx.fillRect(width - pad - barW, pad, barW, barH);
  ctx.fillStyle = "#8bff56";
  ctx.fillRect(pad, pad, barW * (state.player.health / MAX_HEALTH), barH);
  ctx.fillStyle = "#ff4d8d";
  const cpuHealthW = barW * (state.cpu.health / MAX_HEALTH);
  ctx.fillRect(width - pad - cpuHealthW, pad, cpuHealthW, barH);
  drawLabel(ctx, `${Math.round(state.player.health)}`, pad + 4, pad + barH - 3, { size: 11, align: "left" });
  drawLabel(ctx, `${Math.round(state.cpu.health)}`, width - pad - 4, pad + barH - 3, { size: 11, align: "right" });

  // super meter bars, just beneath the health bars — glow/pulse once full
  // as a cheap "ready!" cue, paired with a text label so readiness isn't
  // color-only.
  const meterY = pad + barH + 3;
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(pad, meterY, barW, meterH);
  ctx.fillRect(width - pad - barW, meterY, barW, meterH);
  const pulse = 0.7 + 0.3 * Math.sin(ts / 120);
  ctx.fillStyle = state.playerMeter >= 100 ? `rgba(255,212,59,${pulse})` : "#ffd43b";
  ctx.fillRect(pad, meterY, barW * (state.playerMeter / 100), meterH);
  ctx.fillStyle = state.cpuMeter >= 100 ? `rgba(255,212,59,${pulse})` : "#ffd43b";
  const cpuMeterW = barW * (state.cpuMeter / 100);
  ctx.fillRect(width - pad - cpuMeterW, meterY, cpuMeterW, meterH);

  const labelY = meterY + meterH + 14;
  drawLabel(ctx, "YOU", pad, labelY, { size: 12, align: "left", fill: state.player.color });
  drawLabel(ctx, "RIVAL", width - pad, labelY, { size: 12, align: "right", fill: state.cpu.color });
  if (state.playerMeter >= 100) drawLabel(ctx, "★ SUPER READY", pad, labelY + 13, { size: 10, align: "left", fill: "#ffd43b" });
  if (state.cpuMeter >= 100) drawLabel(ctx, "★ SUPER READY", width - pad, labelY + 13, { size: 10, align: "right", fill: "#ffd43b" });

  drawOutlinedText(ctx, `${Math.ceil(state.timeLeft / 1000)}`, width / 2, pad + barH, {
    size: 16,
    fill: "#f5f5ff",
    outline: "rgba(10,6,26,0.85)",
    outlineWidth: 2,
    align: "center",
    baseline: "alphabetic",
    font: displayFont(16),
  });

  // round pips — best-of-3, filled in for rounds already won
  const pipR = 5;
  const pipGap = 15;
  const pipY = meterY + meterH + 22;
  for (let i = 0; i < 3; i++) {
    const px = pad + 8 + i * pipGap;
    ctx.beginPath();
    ctx.arc(px, pipY, pipR, 0, Math.PI * 2);
    ctx.fillStyle = i < state.roundsWon.player ? "#8bff56" : "rgba(255,255,255,0.25)";
    ctx.fill();
    const cx2 = width - pad - 8 - i * pipGap;
    ctx.beginPath();
    ctx.arc(cx2, pipY, pipR, 0, Math.PI * 2);
    ctx.fillStyle = i < state.roundsWon.cpu ? "#ff4d8d" : "rgba(255,255,255,0.25)";
    ctx.fill();
  }
}

function drawRoundBanner(ctx: CanvasRenderingContext2D, state: MatchState, width: number, height: number, ts: number): void {
  if (state.phase === "fighting") return;
  const isKo = state.player.health <= 0 || state.cpu.health <= 0;
  let label: string;
  if (state.phase === "matchEnd") {
    let base: string;
    if (state.roundsWon.player > state.roundsWon.cpu) base = "You Win the Match!";
    else if (state.roundsWon.cpu > state.roundsWon.player) base = "Rival Wins the Match!";
    else base = "Match Draw!";
    label = isKo ? `K.O.! ${base}` : base;
  } else {
    label = isKo ? "K.O.!" : `Round ${state.round + 1} — Fight!`;
  }

  ctx.save();
  ctx.fillStyle = "rgba(21,12,51,0.55)";
  ctx.fillRect(0, height * 0.38, width, height * 0.24);
  ctx.restore();

  const progress = Math.min(1, (ts - bannerStartTs) / BANNER_ANIM_MS);
  drawBanner(ctx, label, width / 2, height / 2 + 4, progress, { size: Math.round(height * 0.075) });
}

export function draw(ctx: CanvasRenderingContext2D, state: MatchState, ts: number, width: number, height: number): void {
  const ground = state.ground;

  if (state.phase !== lastPhase) {
    bannerStartTs = ts;
    lastPhase = state.phase;
  }

  const dtMs = lastDrawTs === null ? 16 : ts - lastDrawTs;
  lastDrawTs = ts;
  particles.update(dtMs);
  shake.update(dtMs);

  ctx.clearRect(0, 0, width, height);
  ctx.save();
  shake.apply(ctx);

  drawArenaBackground(ctx, width, height, ground);

  drawFighter(ctx, state.cpu, width, height, ground, ts);
  drawFighter(ctx, state.player, width, height, ground, ts);
  particles.draw(ctx);

  ctx.restore();

  // HUD and banner are drawn outside the shake transform — camera shake on
  // the arena shouldn't jitter text the player needs to read.
  drawHud(ctx, state, width, ts);
  drawRoundBanner(ctx, state, width, height, ts);
}
