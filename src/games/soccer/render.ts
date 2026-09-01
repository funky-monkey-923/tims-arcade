// All CanvasRenderingContext2D calls for Kickoff Clash live here — the
// "UI" half's rendering concern, kept separate from engine.ts's game rules.

import { drawShadow, isReady, SPRITES } from "../../lib/sprites";
import type { AIChar, PlayerChar, SoccerState } from "./engine";

const STAMINA_LOW_THRESHOLD = 25;
const CHARGE_MAX_MS = 850;

function drawCircle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

// Which circle is "you" is otherwise conveyed by color + a same-color
// teammate now sharing the field — a white ring around the player-
// controlled circle only (never the teammate's, even though they share a
// color) gives a shape-based tell that doesn't depend on distinguishing hues.
function drawSelfRing(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, r + 3, 0, Math.PI * 2);
  ctx.stroke();
}

function drawChargeMeter(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number): void {
  ctx.save();
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(x, y, r + 8, -Math.PI / 2, Math.PI * 1.5);
  ctx.stroke();
  ctx.strokeStyle = t >= 1 ? "#ffd43b" : "#8bff56";
  ctx.beginPath();
  ctx.arc(x, y, r + 8, -Math.PI / 2, -Math.PI / 2 + t * Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawStaminaBar(ctx: CanvasRenderingContext2D, player: PlayerChar, width: number): void {
  const barW = width * 0.3;
  const barH = 8;
  const x = 10;
  const y = 54;
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(x, y, barW, barH);
  const pct = player.stamina / 100;
  ctx.fillStyle = player.stamina < STAMINA_LOW_THRESHOLD ? "#ff4d8d" : "#8bff56";
  ctx.fillRect(x, y, barW * pct, barH);
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, barW, barH);
  ctx.font = "9px sans-serif";
  ctx.fillStyle = "#f5f5ff";
  ctx.textAlign = "left";
  ctx.fillText("stamina", x, y - 2);
}

function drawPitch(ctx: CanvasRenderingContext2D, width: number, height: number, goalTop: number, goalBottom: number): void {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#163a1f";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 2;
  ctx.strokeRect(6, 6, width - 12, height - 12);
  ctx.beginPath();
  ctx.moveTo(width / 2, 6);
  ctx.lineTo(width / 2, height - 6);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(width / 2, height / 2, height * 0.12, 0, Math.PI * 2);
  ctx.stroke();

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

function drawAI(ctx: CanvasRenderingContext2D, ai: AIChar, color: string): void {
  drawShadow(ctx, ai.x, ai.y + ai.r * 0.7, ai.r * 1.8);
  drawCircle(ctx, ai.x, ai.y, ai.r, color);
}

function drawBall(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  if (isReady(SPRITES.soccerBall)) {
    const d = r * 2;
    ctx.drawImage(SPRITES.soccerBall, x - d / 2, y - d / 2, d, d);
  } else {
    drawCircle(ctx, x, y, r, "#ffffff");
  }
}

function drawScoreClock(ctx: CanvasRenderingContext2D, state: SoccerState, width: number): void {
  ctx.font = "bold 16px sans-serif";
  ctx.fillStyle = "#f5f5ff";
  ctx.textAlign = "center";
  ctx.fillText(`${state.playerGoals} - ${state.cpuGoals}`, width / 2, 26);
  ctx.font = "12px sans-serif";
  const half = state.half === 1 ? "1st" : "2nd";
  ctx.fillText(`${half}  ${Math.max(0, Math.ceil(state.timeLeft / 1000))}s`, width / 2, 44);
}

function drawHalftimeBanner(ctx: CanvasRenderingContext2D, state: SoccerState, width: number, height: number): void {
  ctx.save();
  ctx.fillStyle = "rgba(21,12,51,0.7)";
  ctx.fillRect(0, height * 0.36, width, height * 0.28);
  ctx.textAlign = "center";
  ctx.font = "bold 24px 'Lilita One', sans-serif";
  ctx.fillStyle = "#ffd43b";
  ctx.fillText("Halftime!", width / 2, height / 2 - 6);
  ctx.font = "bold 18px sans-serif";
  ctx.fillStyle = "#f5f5ff";
  ctx.fillText(`${state.playerGoals} - ${state.cpuGoals}`, width / 2, height / 2 + 22);
  ctx.restore();
}

function drawShootout(ctx: CanvasRenderingContext2D, state: SoccerState, ts: number, width: number, height: number): void {
  const so = state.shootout;
  if (!so) return;
  const goalHalf = height * 0.16;
  const goalTop = height / 2 - goalHalf;
  const goalBottom = height / 2 + goalHalf;
  drawPitch(ctx, width, height, goalTop, goalBottom);

  ctx.save();
  ctx.fillStyle = "rgba(21,12,51,0.5)";
  ctx.fillRect(0, 10, width, 34);
  ctx.textAlign = "center";
  ctx.font = "bold 20px 'Lilita One', sans-serif";
  ctx.fillStyle = "#ffd43b";
  ctx.fillText("Penalties!", width / 2, 34);
  ctx.restore();

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
  ctx.font = "10px sans-serif";
  ctx.fillStyle = "#f5f5ff";
  ctx.textAlign = "right";
  ctx.fillText("YOU", width / 2 - ((attempts - 1) * gap) / 2 - 10, rowY + 3);
  ctx.fillText("CPU", width / 2 - ((attempts - 1) * gap) / 2 - 10, rowY + 19);

  const goalX = width - 20;
  const keeperX = goalX - 20;
  drawShadow(ctx, keeperX, height / 2, 18);
  let keeperY = height / 2;
  if (so.keeperDiveDir === -1) keeperY = height / 2 - goalHalf * 0.7;
  else if (so.keeperDiveDir === 1) keeperY = height / 2 + goalHalf * 0.7;
  drawCircle(ctx, keeperX, keeperY, 12, "#ffd43b");

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
  drawBall(ctx, ballX, ballY, 10);

  if (so.stage === "aiming" && so.turn === "player") {
    ctx.font = "12px sans-serif";
    ctx.fillStyle = "#f5f5ff";
    ctx.textAlign = "center";
    ctx.fillText("←/→ aim, hold shoot to charge", width / 2, height - 16);
  }
}

export function draw(ctx: CanvasRenderingContext2D, state: SoccerState, ts: number, width: number, height: number): void {
  const goalHalf = height * 0.16;
  const goalTop = height / 2 - goalHalf;
  const goalBottom = height / 2 + goalHalf;

  if (state.phase === "shootout") {
    drawShootout(ctx, state, ts, width, height);
    return;
  }

  drawPitch(ctx, width, height, goalTop, goalBottom);

  // teammate/opponents share their side's hue, in a distinct shade so the
  // player's own circle (marked with the white ring below) still stands out.
  drawAI(ctx, state.teammate, "#8ff2e6");
  drawAI(ctx, state.opp1, "#ff4d8d");
  drawAI(ctx, state.opp2, "#c9295f");

  drawShadow(ctx, state.player.x, state.player.y + state.player.r * 0.7, state.player.r * 1.8);
  drawCircle(ctx, state.player.x, state.player.y, state.player.r, "#2ee6d6");
  drawSelfRing(ctx, state.player.x, state.player.y, state.player.r);

  drawBall(ctx, state.ball.x, state.ball.y, state.ball.r);

  if (state.player.chargeStart !== null) {
    const t = Math.min(1, (ts - state.player.chargeStart) / CHARGE_MAX_MS);
    drawChargeMeter(ctx, state.player.x, state.player.y, state.player.r, t);
  }

  drawScoreClock(ctx, state, width);
  drawStaminaBar(ctx, state.player, width);

  if (state.phase === "halftime") drawHalftimeBanner(ctx, state, width, height);
}
