// All CanvasRenderingContext2D calls for Turbo Dash live here — the "UI"
// half's rendering concern, kept separate from engine.ts's game rules.

import { drawShadow, SPRITES, isReady, OBSTACLE_CAR_SPRITES } from "../../lib/sprites";
import { LANES, NITRO_COOLDOWN, laneX, type RacingState } from "./engine";

export function draw(ctx: CanvasRenderingContext2D, state: RacingState, ts: number, width: number, height: number): void {
  const carW = width / LANES - 24;
  const carH = height * 0.11;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#2b2b38";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#150c33";
  ctx.fillRect(0, 0, width * 0.02, height);
  ctx.fillRect(width * 0.98, 0, width * 0.02, height);

  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 3;
  ctx.setLineDash([height * 0.09, height * 0.08]);
  for (let l = 1; l < LANES; l++) {
    ctx.beginPath();
    ctx.lineDashOffset = -state.roadOffset;
    ctx.moveTo((width / LANES) * l, 0);
    ctx.lineTo((width / LANES) * l, height);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  state.obstacles.forEach((o) => {
    const ox = laneX(width, o.lane);
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

  const nitroActive = ts < state.nitroUntil;
  if (nitroActive && isReady(SPRITES.smoke)) {
    const smokeSize = carW * 1.3;
    ctx.globalAlpha = 0.7;
    ctx.drawImage(SPRITES.smoke, state.x - smokeSize / 2, height * 0.78 + carH * 0.3, smokeSize, smokeSize);
    ctx.globalAlpha = 1;
  }
  drawShadow(ctx, state.x, height * 0.78 + carH / 2 - 2, carW * 1.1);
  if (nitroActive) {
    ctx.fillStyle = "rgba(255,212,59,0.5)";
    ctx.fillRect(state.x - carW / 2, height * 0.78 + carH / 2, carW, height * 0.08);
  }
  if (isReady(SPRITES.carPlayer)) {
    ctx.drawImage(SPRITES.carPlayer, state.x - carW / 2, height * 0.78 - carH / 2, carW, carH);
    if (nitroActive) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "#ffd43b";
      ctx.beginPath();
      ctx.roundRect(state.x - carW / 2, height * 0.78 - carH / 2, carW, carH, 8);
      ctx.fill();
      ctx.restore();
    }
  } else {
    ctx.fillStyle = nitroActive ? "#ffd43b" : "#2ee6d6";
    ctx.beginPath();
    ctx.roundRect(state.x - carW / 2, height * 0.78 - carH / 2, carW, carH, 8);
    ctx.fill();
  }

  ctx.font = "bold 14px sans-serif";
  ctx.fillStyle = "#f5f5ff";
  ctx.textAlign = "left";
  ctx.fillText(`${Math.round(state.speed * 20)} mph`, 10, 20);
  if (ts - state.lastNitroAt < NITRO_COOLDOWN && !nitroActive) {
    ctx.textAlign = "right";
    ctx.fillText("nitro charging…", width - 10, 20);
  } else if (!nitroActive) {
    ctx.textAlign = "right";
    ctx.fillText("nitro ready!", width - 10, 20);
  }
}
