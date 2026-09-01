// All CanvasRenderingContext2D calls for Munch Maze live here — the "UI"
// half's rendering concern, kept separate from engine.ts's game rules.

import { SPRITES, GHOST_SPRITES, isReady } from "../../lib/sprites";
import { ROWS, COLS, type MazeState, type GhostPersonality } from "./engine";

// Fixed personality -> sprite mapping so a given personality always looks
// the same regardless of which wave first spawns it (see ghostCountForWave
// in engine.ts) — a kid can learn "the spiky one always hunts me" once and
// have it hold across every wave.
const PERSONALITY_SPRITE_INDEX: Record<GhostPersonality, number> = {
  chaser: 3, // ghostSpike — the always-aggressive hunter gets the spikiest look
  ambusher: 1, // ghostFly — swoops ahead to cut the player off
  wanderer: 2, // ghostFloat — aimless drifting
  lateActivator: 0, // ghostWalk — plain-looking until it "wakes up"
};

function drawGhost(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, scared: boolean): void {
  const r = size / 2;
  ctx.fillStyle = scared ? "#4444ff" : color;
  ctx.beginPath();
  ctx.arc(x, y, r, Math.PI, 0);
  ctx.lineTo(x + r, y + r);
  for (let i = 0; i < 3; i++) {
    ctx.lineTo(x + r - ((i + 0.5) * (2 * r)) / 3, y + (i % 2 === 0 ? r * 0.6 : r));
  }
  ctx.lineTo(x - r, y + r);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(x - r * 0.35, y - r * 0.1, r * 0.22, 0, Math.PI * 2);
  ctx.arc(x + r * 0.35, y - r * 0.1, r * 0.22, 0, Math.PI * 2);
  ctx.fill();
}

export function draw(ctx: CanvasRenderingContext2D, state: MazeState, ts: number, width: number, height: number): void {
  const cell = Math.min(width / COLS, height / ROWS);
  const offX = (width - cell * COLS) / 2;
  const offY = (height - cell * ROWS) / 2;
  const scared = ts < state.scaredUntil;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#150c33";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#3d2585";
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (state.maze[r][c]) {
        ctx.fillRect(offX + c * cell + 1, offY + r * cell + 1, cell - 2, cell - 2);
      }
    }
  }

  ctx.fillStyle = "#ffd43b";
  state.dots.forEach((key) => {
    const [r, c] = key.split(",").map(Number);
    const dx = offX + (c + 0.5) * cell;
    const dy = offY + (r + 0.5) * cell;
    if (isReady(SPRITES.dotGem)) {
      const dr = cell * 0.22;
      ctx.drawImage(SPRITES.dotGem, dx - dr, dy - dr, dr * 2, dr * 2);
    } else {
      ctx.beginPath();
      ctx.arc(dx, dy, cell * 0.09, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  const pulse = 0.7 + 0.3 * Math.sin(ts / 120);
  state.power.forEach((key) => {
    const [r, c] = key.split(",").map(Number);
    const px = offX + (c + 0.5) * cell;
    const py = offY + (r + 0.5) * cell;
    const pr = cell * 0.32 * pulse;
    if (isReady(SPRITES.sparkle)) {
      ctx.drawImage(SPRITES.sparkle, px - pr, py - pr, pr * 2, pr * 2);
    } else {
      ctx.beginPath();
      ctx.arc(px, py, cell * 0.28 * pulse, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  if (state.fruit) {
    const fx = offX + (state.fruit.c + 0.5) * cell;
    const fy = offY + (state.fruit.r + 0.5) * cell;
    const fr = cell * 0.36;
    if (isReady(SPRITES.starBadge)) {
      ctx.drawImage(SPRITES.starBadge, fx - fr, fy - fr, fr * 2, fr * 2);
    } else {
      // Hand-drawn 5-point star fallback if the sprite hasn't loaded.
      ctx.fillStyle = "#ff9f1c";
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const rad = i % 2 === 0 ? fr : fr * 0.45;
        const angle = (Math.PI / 5) * i - Math.PI / 2;
        const sx = fx + Math.cos(angle) * rad;
        const sy = fy + Math.sin(angle) * rad;
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  if (state.speedPellet) {
    const sx0 = offX + (state.speedPellet.c + 0.5) * cell;
    const sy0 = offY + (state.speedPellet.r + 0.5) * cell;
    const boltPulse = 0.75 + 0.25 * Math.sin(ts / 90);
    const s = cell * 0.34 * boltPulse;
    // Hand-drawn lightning bolt — no dedicated sprite for this pickup, so it
    // stays a simple canvas path (still 100% render.ts's concern).
    ctx.fillStyle = "#5cf5ff";
    ctx.beginPath();
    ctx.moveTo(sx0 + s * 0.15, sy0 - s);
    ctx.lineTo(sx0 - s * 0.5, sy0 + s * 0.1);
    ctx.lineTo(sx0 - s * 0.05, sy0 + s * 0.1);
    ctx.lineTo(sx0 - s * 0.15, sy0 + s);
    ctx.lineTo(sx0 + s * 0.5, sy0 - s * 0.1);
    ctx.lineTo(sx0 + s * 0.05, sy0 - s * 0.1);
    ctx.closePath();
    ctx.fill();
  }

  state.ghosts.forEach((g) => {
    const gx = offX + (g.c + 0.5) * cell;
    const gy = offY + (g.r + 0.5) * cell;
    const size = cell * 0.85;
    const sprite = GHOST_SPRITES[PERSONALITY_SPRITE_INDEX[g.personality]];
    if (isReady(sprite)) {
      const half = size / 2;
      ctx.drawImage(sprite, gx - half, gy - half, size, size);
      if (scared) {
        ctx.globalCompositeOperation = "source-atop";
        ctx.fillStyle = "rgba(68,68,255,0.55)";
        ctx.fillRect(gx - half, gy - half, size, size);
        ctx.globalCompositeOperation = "source-over";
      }
    } else {
      drawGhost(ctx, gx, gy, size, g.color, scared);
    }
    // "Scared" (edible) is otherwise conveyed by color alone (a blue tint) —
    // add a shape-based cue too, since color-blind players (or anyone on a
    // washed-out screen) shouldn't have to guess whether a ghost is safe to
    // eat. A dashed ring reads clearly regardless of hue perception.
    if (scared) {
      ctx.save();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.setLineDash([cell * 0.08, cell * 0.06]);
      ctx.beginPath();
      ctx.arc(gx, gy, size * 0.62, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  });

  const p = state.player;
  const px = offX + (p.c + 0.5) * cell;
  const py = offY + (p.r + 0.5) * cell;
  const angle = Math.atan2(p.dir.y, p.dir.x) || 0;
  const mouth = 0.15 + 0.15 * Math.abs(Math.sin(ts / 100));
  ctx.fillStyle = "#ffd43b";
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.arc(px, py, cell * 0.42, angle + mouth * Math.PI, angle + (2 - mouth) * Math.PI);
  ctx.closePath();
  ctx.fill();

  ctx.font = "14px sans-serif";
  ctx.textAlign = "left";
  ctx.fillStyle = "#f5f5ff";
  ctx.fillText("❤️".repeat(Math.max(0, state.lives)), 8, 18);
  ctx.textAlign = "right";
  ctx.fillText(`Wave ${state.wave}`, width - 8, 18);
}
