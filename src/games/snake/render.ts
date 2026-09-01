// All CanvasRenderingContext2D calls for Wiggle Worm live here — the "UI"
// half's rendering concern, kept separate from engine.ts's game rules.

import { SPRITES, isReady } from "../../lib/sprites";
import { GRID, type SnakeState } from "./engine";

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, outerR: number, innerR: number): void {
  const spikes = 5;
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (Math.PI / spikes) * i - Math.PI / 2;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

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

  // obstacle tiles — solid blocking walls, drawn before food/snake so they
  // read clearly as part of the arena floor
  ctx.fillStyle = "#3a2b52";
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  for (const w of state.walls) {
    const x = w.x * cell;
    const y = w.y * cell;
    ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2);
    ctx.strokeRect(x + 2.5, y + 2.5, cell - 5, cell - 5);
  }

  // portals — a linked teleport pair, drawn as dashed rings so they read as
  // distinct from both walls and food
  if (state.portals) {
    ctx.save();
    ctx.strokeStyle = "#7ce7ff";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    for (const p of state.portals) {
      const px = (p.x + 0.5) * cell;
      const py = (p.y + 0.5) * cell;
      ctx.beginPath();
      ctx.arc(px, py, cell * 0.36, (ts / 300) % (Math.PI * 2), (ts / 300) % (Math.PI * 2) + Math.PI * 1.6);
      ctx.stroke();
    }
    ctx.restore();
  }

  // food — shape (not just color) always distinguishes kind, per this app's
  // accessibility rule that gameplay state must never be color-only.
  const foodX = (state.food.x + 0.5) * cell;
  const foodY = (state.food.y + 0.5) * cell;
  const pulse = 0.85 + 0.15 * Math.sin(ts / 150);

  if (state.food.kind === "golden") {
    // golden food: a pulsing star that visibly shrinks as its despawn timer
    // runs out, so the countdown is legible without a separate UI element
    const expiresAt = state.food.expiresAt ?? ts;
    const remaining = Math.max(0, Math.min(1, (expiresAt - ts) / 6000));
    const outerR = cell * 0.46 * (0.6 + 0.4 * remaining) * pulse;
    ctx.fillStyle = "#ffb703";
    drawStar(ctx, foodX, foodY, outerR, outerR * 0.45);
  } else if (state.food.kind === "shrink") {
    // shrink food: a downward-pointing triangle with a "minus" glyph —
    // reads as "take something away" at a glance, distinct shape and color
    const r = cell * 0.4 * pulse;
    ctx.fillStyle = "#9b6bff";
    ctx.beginPath();
    ctx.moveTo(foodX, foodY + r);
    ctx.lineTo(foodX - r, foodY - r * 0.7);
    ctx.lineTo(foodX + r, foodY - r * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#150c33";
    ctx.lineWidth = Math.max(1.5, cell * 0.06);
    ctx.beginPath();
    ctx.moveTo(foodX - r * 0.4, foodY - r * 0.05);
    ctx.lineTo(foodX + r * 0.4, foodY - r * 0.05);
    ctx.stroke();
  } else {
    // normal food: the original pulsing coin
    const foodR = (cell / 2.2) * pulse;
    if (isReady(SPRITES.coin)) {
      ctx.drawImage(SPRITES.coin, foodX - foodR, foodY - foodR, foodR * 2, foodR * 2);
    } else {
      ctx.fillStyle = "#ffd43b";
      ctx.beginPath();
      ctx.arc(foodX, foodY, foodR * 0.85, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // snake
  state.snake.forEach((seg, i) => {
    ctx.fillStyle = i === 0 ? "#8bff56" : "#5fce38";
    const pad = 1.5;
    ctx.beginPath();
    ctx.roundRect(seg.x * cell + pad, seg.y * cell + pad, cell - pad * 2, cell - pad * 2, 6);
    ctx.fill();
  });

  // The head is only a slightly lighter green than the body today — add a
  // pair of eyes so which end is "the front" is legible by shape too, not
  // just a subtle shade difference that's easy to miss at a glance (or for
  // a color-blind player to not register as different at all).
  const head = state.snake[0];
  if (head) {
    const hx = (head.x + 0.5) * cell;
    const hy = (head.y + 0.5) * cell;
    const dx = state.dir.x || 0;
    const dy = state.dir.y || -1;
    const eyeOffset = cell * 0.16;
    const eyeR = cell * 0.09;
    // perpendicular offset so the two eyes sit side-by-side across the
    // direction of travel, not stacked front-to-back
    const px = -dy;
    const py = dx;
    ctx.fillStyle = "#150c33";
    [-1, 1].forEach((side) => {
      ctx.beginPath();
      ctx.arc(hx + dx * eyeOffset + px * eyeOffset * side, hy + dy * eyeOffset + py * eyeOffset * side, eyeR, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}
