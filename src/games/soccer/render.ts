// All CanvasRenderingContext2D calls for Kickoff Clash live here — the
// "UI" half's rendering concern, kept separate from engine.ts's game rules.

import { drawShadow, isReady, SPRITES } from "../../lib/sprites";
import type { SoccerState } from "./engine";

export function draw(ctx: CanvasRenderingContext2D, state: SoccerState, width: number, height: number): void {
  const goalHalf = height * 0.16;
  const goalTop = height / 2 - goalHalf;
  const goalBottom = height / 2 + goalHalf;

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

  drawShadow(ctx, state.player.x, state.player.y + state.player.r * 0.7, state.player.r * 1.8);
  drawShadow(ctx, state.cpu.x, state.cpu.y + state.cpu.r * 0.7, state.cpu.r * 1.8);
  ctx.fillStyle = "#2ee6d6";
  ctx.beginPath();
  ctx.arc(state.player.x, state.player.y, state.player.r, 0, Math.PI * 2);
  ctx.fill();
  // Which circle is "you" vs the CPU is otherwise conveyed by color alone
  // (teal vs coral) — both players move freely, so position isn't a
  // reliable cue either. A white ring around the player-controlled one
  // gives a shape-based tell that doesn't depend on distinguishing hues.
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(state.player.x, state.player.y, state.player.r + 3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#ff4d8d";
  ctx.beginPath();
  ctx.arc(state.cpu.x, state.cpu.y, state.cpu.r, 0, Math.PI * 2);
  ctx.fill();
  if (isReady(SPRITES.soccerBall)) {
    const d = state.ball.r * 2;
    ctx.drawImage(SPRITES.soccerBall, state.ball.x - d / 2, state.ball.y - d / 2, d, d);
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(state.ball.x, state.ball.y, state.ball.r, 0, Math.PI * 2);
    ctx.fill();
  }

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

  ctx.font = "bold 16px sans-serif";
  ctx.fillStyle = "#f5f5ff";
  ctx.textAlign = "center";
  ctx.fillText(`${state.playerGoals} - ${state.cpuGoals}`, width / 2, 26);
  ctx.font = "12px sans-serif";
  ctx.fillText(`${Math.max(0, Math.ceil(state.timeLeft / 1000))}s`, width / 2, 44);
}
