// All CanvasRenderingContext2D calls for Star Defender live here — the
// "UI" half's rendering concern, kept separate from engine.ts's game rules.

import type { StarDefenderState } from "./engine";
import { SPRITES, METEOR_SPRITES, isReady } from "../../lib/sprites";

export function draw(ctx: CanvasRenderingContext2D, state: StarDefenderState, ts: number, width: number, height: number): void {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#150c33";
  ctx.fillRect(0, 0, width, height);

  const { player, wave, bullets } = state;

  // enemies
  wave.enemies.forEach((e) => {
    if (!e.alive) return;
    const ex = e.x + wave.offsetX;
    const sprite = METEOR_SPRITES[(e.row + e.col) % METEOR_SPRITES.length];
    if (isReady(sprite)) {
      const size = wave.cell;
      ctx.drawImage(sprite, ex - size / 2, e.y - size / 2, size, size);
    } else {
      ctx.font = `${Math.floor(wave.cell * 0.8)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("👾", ex, e.y);
    }
  });

  // bullets — player bullets travel up, enemy bullets travel down. Both
  // sprites' default art points "nose up", so only enemy bullets need the
  // 180° rotation.
  bullets.forEach((b) => {
    if (b.from === "player") {
      if (isReady(SPRITES.missilePlayer)) {
        const w = 8;
        const h = 20;
        ctx.drawImage(SPRITES.missilePlayer, b.x - w / 2, b.y - h / 2, w, h);
      } else {
        ctx.fillStyle = "#2ee6d6";
        ctx.fillRect(b.x - 2, b.y - 6, 4, 12);
      }
    } else {
      if (isReady(SPRITES.missileEnemy)) {
        const w = 8;
        const h = 20;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(Math.PI);
        ctx.drawImage(SPRITES.missileEnemy, -w / 2, -h / 2, w, h);
        ctx.restore();
      } else {
        ctx.fillStyle = "#ff4d8d";
        ctx.fillRect(b.x - 2, b.y - 6, 4, 12);
      }
    }
  });

  // player ship
  if (isReady(SPRITES.shipPlayer)) {
    const w = player.w;
    const h = w * (SPRITES.shipPlayer.naturalHeight / SPRITES.shipPlayer.naturalWidth);
    ctx.drawImage(SPRITES.shipPlayer, player.x - w / 2, player.y - h / 2, w, h);
  } else {
    ctx.fillStyle = "#8bff56";
    ctx.beginPath();
    ctx.moveTo(player.x, player.y - player.h);
    ctx.lineTo(player.x - player.w / 2, player.y + player.h / 2);
    ctx.lineTo(player.x + player.w / 2, player.y + player.h / 2);
    ctx.closePath();
    ctx.fill();
  }

  // explosion flashes (bonus juice — no fallback if the sprite isn't ready)
  if (isReady(SPRITES.explosion)) {
    const size = wave.cell * 1.4;
    state.explosions.forEach((ex) => {
      const remaining = ex.until - ts;
      if (remaining <= 0) return;
      ctx.globalAlpha = Math.max(0, Math.min(1, remaining / 260));
      ctx.drawImage(SPRITES.explosion, ex.x - size / 2, ex.y - size / 2, size, size);
      ctx.globalAlpha = 1;
    });
  }

  // lives / wave HUD
  ctx.font = "14px sans-serif";
  ctx.textAlign = "left";
  ctx.fillStyle = "#f5f5ff";
  ctx.fillText("❤️".repeat(Math.max(0, state.lives)), 8, 18);
  ctx.textAlign = "right";
  ctx.fillText(`Wave ${state.waveNumber}`, width - 8, 18);
}
