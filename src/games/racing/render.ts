// All CanvasRenderingContext2D calls for Turbo Dash live here — the "UI"
// half's rendering concern, kept separate from engine.ts's game rules.

import { drawShadow, SPRITES, isReady, OBSTACLE_CAR_SPRITES } from "../../lib/sprites";
import { LANES, NITRO_COOLDOWN, laneX, getPlayerPosition, type RacingState } from "./engine";

// Screen pixels per unit of distance-gap between the player and an AI
// racer. Tuned so racers within roughly a second's worth of pace
// difference (a few hundred distance-units, given state.distance
// advances by ~speed*60/sec) render on-track near the player, while
// bigger gaps push them off-screen into the edge "radar ping" indicator.
const AI_GAP_SCALE = 0.4;

function ordinal(n: number): string {
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${n}th`;
}

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

  const carY = height * 0.78;
  state.aiRacers.forEach((ai) => {
    const ax = laneX(width, ai.lane);
    const gap = ai.distance - state.distance; // positive = ahead of player
    const ay = carY - gap * AI_GAP_SCALE;
    if (ay > -carH && ay < height + carH) {
      drawShadow(ctx, ax, ay + carH / 2 - 2, carW * 1.1);
      ctx.fillStyle = ai.color;
      ctx.beginPath();
      ctx.roundRect(ax - carW / 2, ay - carH / 2, carW, carH, 8);
      ctx.fill();
    } else {
      // Off-screen "radar ping": a small triangle pinned to the edge the
      // racer is off toward, plus their name, so the player still has
      // positional awareness of someone they can't currently see.
      const atTop = gap > 0;
      const edgeY = atTop ? 30 : height - 18;
      ctx.fillStyle = ai.color;
      ctx.beginPath();
      if (atTop) {
        ctx.moveTo(ax, edgeY - 7);
        ctx.lineTo(ax - 7, edgeY + 7);
        ctx.lineTo(ax + 7, edgeY + 7);
      } else {
        ctx.moveTo(ax, edgeY + 7);
        ctx.lineTo(ax - 7, edgeY - 7);
        ctx.lineTo(ax + 7, edgeY - 7);
      }
      ctx.closePath();
      ctx.fill();
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(ai.name, ax, atTop ? edgeY + 18 : edgeY - 11);
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
  // Nitro state is otherwise shown via color (gold tint) + smoke — add a
  // text label here too, matching the "charging…"/"ready!" labels already
  // shown the rest of the time, so the state is legible without relying on
  // color at all.
  ctx.textAlign = "right";
  if (nitroActive) {
    ctx.fillText("NITRO!", width - 10, 20);
  } else if (ts - state.lastNitroAt < NITRO_COOLDOWN) {
    ctx.fillText("nitro charging…", width - 10, 20);
  } else {
    ctx.fillText("nitro ready!", width - 10, 20);
  }

  ctx.textAlign = "left";
  ctx.fillText(`LAP ${Math.min(state.lap, state.totalLaps)}/${state.totalLaps}`, 10, 40);
  ctx.textAlign = "right";
  ctx.fillText(`${ordinal(getPlayerPosition(state))} place`, width - 10, 40);

  if (ts < state.lapBannerUntil) {
    // Same fade idiom used elsewhere in this codebase (e.g. invaders'
    // explosion fade): alpha = remaining/duration, present-then-gone.
    const remaining = state.lapBannerUntil - ts;
    ctx.globalAlpha = Math.max(0, Math.min(1, remaining / 2000));
    ctx.font = "bold 28px sans-serif";
    ctx.fillStyle = "#ffd43b";
    ctx.textAlign = "center";
    ctx.fillText(`LAP ${state.lapBannerLap} of ${state.totalLaps}!`, width / 2, height / 2);
    ctx.globalAlpha = 1;
  }

  if (state.finished || state.dnf) {
    ctx.font = "bold 24px sans-serif";
    ctx.textAlign = "center";
    if (state.finished) {
      ctx.fillStyle = "#2ee6d6";
      ctx.fillText(`Finished — ${ordinal(getPlayerPosition(state))} place!`, width / 2, height / 2);
    } else {
      ctx.fillStyle = "#ff4d8d";
      ctx.fillText("DNF — too many crashes", width / 2, height / 2);
    }
  }
}
