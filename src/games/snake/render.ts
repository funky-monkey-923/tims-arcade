// All CanvasRenderingContext2D calls for Wiggle Worm live here — the "UI"
// half's rendering concern, kept separate from engine.ts's game rules.

import { SPRITES, isReady } from "../../lib/sprites";
import { GRID, type SnakeState } from "./engine";

export function draw(ctx: CanvasRenderingContext2D, state: SnakeState, ts: number, width: number, height: number): void {
  const cell = width / GRID;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#150c33";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  for (let i = 1; i < GRID; i++) {
    ctx.beginPath();
    ctx.moveTo(i * cell, 0);
    ctx.lineTo(i * cell, height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * cell);
    ctx.lineTo(width, i * cell);
    ctx.stroke();
  }

  // food (pulsing coin)
  const pulse = 0.85 + 0.15 * Math.sin(ts / 150);
  const foodX = (state.food.x + 0.5) * cell;
  const foodY = (state.food.y + 0.5) * cell;
  const foodR = (cell / 2.2) * pulse;
  if (isReady(SPRITES.coin)) {
    ctx.drawImage(SPRITES.coin, foodX - foodR, foodY - foodR, foodR * 2, foodR * 2);
  } else {
    ctx.fillStyle = "#ffd43b";
    ctx.beginPath();
    ctx.arc(foodX, foodY, foodR * 0.85, 0, Math.PI * 2);
    ctx.fill();
  }

  // snake
  state.snake.forEach((seg, i) => {
    ctx.fillStyle = i === 0 ? "#8bff56" : "#5fce38";
    const pad = 1.5;
    ctx.beginPath();
    ctx.roundRect(seg.x * cell + pad, seg.y * cell + pad, cell - pad * 2, cell - pad * 2, 6);
    ctx.fill();
  });
}
