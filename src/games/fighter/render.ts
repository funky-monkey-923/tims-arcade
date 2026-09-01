// All CanvasRenderingContext2D calls for Rumble Ring live here — the "UI"
// half's rendering concern, kept separate from engine.ts's game rules.

import { drawShadow, isReady, SPRITES } from "../../lib/sprites";
import type { Fighter, MatchState } from "./engine";

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

function drawFighter(ctx: CanvasRenderingContext2D, f: Fighter, width: number, height: number, ground: number, ts: number): void {
  const w = width * 0.07;
  const h = height * 0.24;
  const bx = f.x - w / 2;
  const by = f.y - h;
  drawShadow(ctx, f.x, ground + 4, w * 1.6);

  // Super glow ring — drawn behind the body so it reads as an aura, not an
  // overlay on top of the fighter.
  if (f.state === "super") {
    const pulse = 0.55 + 0.35 * Math.sin(ts / 90);
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = f.color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(f.x, by + h / 2, w * 1.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.fillStyle = f.state === "hit" ? "#ffffff" : f.color;
  ctx.beginPath();
  ctx.roundRect(bx, by, w, h, 8);
  ctx.fill();

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

function drawHud(ctx: CanvasRenderingContext2D, state: MatchState, width: number, ts: number): void {
  const pad = 14;
  const barW = width / 2 - pad * 2;
  const barH = 16;
  const meterH = 6;

  // health bars
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(pad, pad, barW, barH);
  ctx.fillRect(width - pad - barW, pad, barW, barH);
  ctx.fillStyle = "#8bff56";
  ctx.fillRect(pad, pad, barW * (state.player.health / MAX_HEALTH), barH);
  ctx.fillStyle = "#ff4d8d";
  const cpuHealthW = barW * (state.cpu.health / MAX_HEALTH);
  ctx.fillRect(width - pad - cpuHealthW, pad, cpuHealthW, barH);

  // super meter bars, just beneath the health bars — glow/pulse once full
  // as a cheap "ready!" cue (same pulsing idiom used elsewhere in this
  // codebase's render.ts files, e.g. games/pacman/render.ts).
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

  ctx.font = "bold 12px sans-serif";
  ctx.fillStyle = "#f5f5ff";
  ctx.textAlign = "left";
  ctx.fillText("YOU", pad, meterY + meterH + 14);
  ctx.textAlign = "right";
  ctx.fillText("RIVAL", width - pad, meterY + meterH + 14);
  ctx.textAlign = "center";
  ctx.fillText(`${Math.ceil(state.timeLeft / 1000)}`, width / 2, pad + barH);

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

function drawRoundBanner(ctx: CanvasRenderingContext2D, state: MatchState, width: number, height: number): void {
  if (state.phase === "fighting") return;
  ctx.save();
  ctx.fillStyle = "rgba(21,12,51,0.6)";
  ctx.fillRect(0, height * 0.38, width, height * 0.24);
  ctx.textAlign = "center";
  ctx.font = "bold 26px 'Lilita One', sans-serif";
  let label: string;
  if (state.phase === "matchEnd") {
    if (state.roundsWon.player > state.roundsWon.cpu) label = "You Win the Match!";
    else if (state.roundsWon.cpu > state.roundsWon.player) label = "Rival Wins the Match!";
    else label = "Match Draw!";
  } else {
    label = `Round ${state.round + 1} — Fight!`;
  }
  ctx.fillStyle = "#ffd43b";
  ctx.fillText(label, width / 2, height / 2 + 9);
  ctx.restore();
}

export function draw(ctx: CanvasRenderingContext2D, state: MatchState, ts: number, width: number, height: number): void {
  const ground = state.ground;

  ctx.clearRect(0, 0, width, height);
  const grd = ctx.createLinearGradient(0, 0, 0, height);
  grd.addColorStop(0, "#2e1a6b");
  grd.addColorStop(1, "#150c33");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#3d2585";
  ctx.fillRect(0, ground, width, height - ground);
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.beginPath();
  ctx.moveTo(0, ground);
  ctx.lineTo(width, ground);
  ctx.stroke();

  drawFighter(ctx, state.cpu, width, height, ground, ts);
  drawFighter(ctx, state.player, width, height, ground, ts);
  drawHud(ctx, state, width, ts);
  drawRoundBanner(ctx, state, width, height);
}
