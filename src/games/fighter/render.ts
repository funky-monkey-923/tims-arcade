// All CanvasRenderingContext2D calls for Rumble Ring live here — the "UI"
// half's rendering concern, kept separate from engine.ts's game rules.

import { drawShadow, isReady, SPRITES } from "../../lib/sprites";
import type { Fighter, MatchState } from "./engine";

const MAX_HEALTH = 100;
const MOVES = {
  punch: { range: 0.16 },
  kick: { range: 0.22 },
};

function drawFighter(ctx: CanvasRenderingContext2D, f: Fighter, width: number, height: number, ground: number): void {
  const w = width * 0.07;
  const h = height * 0.24;
  const bx = f.x - w / 2;
  const by = f.y - h;
  drawShadow(ctx, f.x, ground + 4, w * 1.6);
  ctx.fillStyle = f.state === "hit" ? "#ffffff" : f.color;
  ctx.beginPath();
  ctx.roundRect(bx, by, w, h, 8);
  ctx.fill();
  // glove/limb during attack
  if (f.state === "punch" || f.state === "kick") {
    const reach = f.facing * width * MOVES[f.state].range;
    const cx = f.x + reach;
    const cy = by + h * 0.35;
    if (isReady(SPRITES.gloveImpact)) {
      const size = w * 0.7;
      ctx.drawImage(SPRITES.gloveImpact, cx - size / 2, cy - size / 2, size, size);
    } else {
      ctx.fillStyle = "#ffd43b";
      ctx.beginPath();
      ctx.arc(cx, cy, w * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
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

function drawHealthBars(ctx: CanvasRenderingContext2D, state: MatchState, width: number): void {
  const pad = 14;
  const barW = width / 2 - pad * 2;
  const barH = 16;
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(pad, pad, barW, barH);
  ctx.fillRect(width - pad - barW, pad, barW, barH);
  ctx.fillStyle = "#8bff56";
  ctx.fillRect(pad, pad, barW * (state.player.health / MAX_HEALTH), barH);
  ctx.fillStyle = "#ff4d8d";
  const cpuW = barW * (state.cpu.health / MAX_HEALTH);
  ctx.fillRect(width - pad - cpuW, pad, cpuW, barH);
  ctx.font = "bold 12px sans-serif";
  ctx.fillStyle = "#f5f5ff";
  ctx.textAlign = "left";
  ctx.fillText("YOU", pad, pad + barH + 14);
  ctx.textAlign = "right";
  ctx.fillText("RIVAL", width - pad, pad + barH + 14);
  ctx.textAlign = "center";
  ctx.fillText(`${Math.ceil(state.timeLeft / 1000)}`, width / 2, pad + barH);
}

export function draw(ctx: CanvasRenderingContext2D, state: MatchState, width: number, height: number): void {
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

  drawFighter(ctx, state.cpu, width, height, ground);
  drawFighter(ctx, state.player, width, height, ground);
  drawHealthBars(ctx, state, width);
}
