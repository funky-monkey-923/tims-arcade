// All CanvasRenderingContext2D calls for Star Defender live here — the
// "UI" half's rendering concern, kept separate from engine.ts's game rules.

import type { StarDefenderState, PowerupKind } from "./engine";
import { SPRITES, METEOR_SPRITES, isReady } from "../../lib/sprites";

const POWERUP_COLORS: Record<PowerupKind, string> = {
  spread: "#2ee6d6",
  rapid: "#ffd43b",
  shield: "#8bff56",
  life: "#ff4d8d",
};
const POWERUP_LABELS: Record<PowerupKind, string> = {
  spread: "SPREAD",
  rapid: "RAPID",
  shield: "SHIELD",
  life: "+1 LIFE",
};

function drawBunkers(ctx: CanvasRenderingContext2D, state: StarDefenderState): void {
  ctx.fillStyle = "#8bff56";
  state.bunkers.forEach((bunker) => {
    bunker.cells.forEach((row, r) => {
      row.forEach((present, c) => {
        if (!present) return;
        ctx.fillRect(bunker.x + c * bunker.cellW, bunker.y + r * bunker.cellH, bunker.cellW - 1, bunker.cellH - 1);
      });
    });
  });
}

function drawEnemy(ctx: CanvasRenderingContext2D, ex: number, ey: number, cell: number, spriteIdx: number, hp: number): void {
  const sprite = METEOR_SPRITES[spriteIdx % METEOR_SPRITES.length];
  if (isReady(sprite)) {
    const size = cell;
    ctx.drawImage(sprite, ex - size / 2, ey - size / 2, size, size);
  } else {
    ctx.font = `${Math.floor(cell * 0.8)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("👾", ex, ey);
  }
  // Shielded enemies (hp > 1 at full health) get a colored ring so they read
  // as tougher even on the fallback-emoji path.
  if (hp > 1) {
    ctx.save();
    ctx.strokeStyle = "#2ee6d6";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ex, ey, cell * 0.55, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawBoss(ctx: CanvasRenderingContext2D, state: StarDefenderState, width: number): void {
  const boss = state.boss;
  if (!boss) return;
  const size = width * 0.16;

  ctx.save();
  ctx.fillStyle = "#ff4d8d";
  ctx.beginPath();
  ctx.roundRect(boss.x - size / 2, boss.y - size / 2, size, size, 10);
  ctx.fill();
  ctx.strokeStyle = "#ffe66d";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.font = `${Math.floor(size * 0.5)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("👹", boss.x, boss.y);
  ctx.restore();

  // boss health bar, top of screen
  const barW = width * 0.6;
  const barH = 14;
  const barX = width / 2 - barW / 2;
  const barY = 26;
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = "#ff4d8d";
  ctx.fillRect(barX, barY, barW * Math.max(0, boss.hp / boss.maxHp), barH);
  ctx.strokeStyle = "#ffe66d";
  ctx.lineWidth = 2;
  ctx.strokeRect(barX, barY, barW, barH);
  ctx.font = "bold 11px sans-serif";
  ctx.fillStyle = "#f5f5ff";
  ctx.textAlign = "center";
  ctx.fillText("BOSS", width / 2, barY - 5);
}

function drawUfo(ctx: CanvasRenderingContext2D, state: StarDefenderState): void {
  const ufo = state.ufo;
  if (!ufo) return;
  ctx.save();
  ctx.fillStyle = "#ffe66d";
  ctx.beginPath();
  ctx.ellipse(ufo.x, ufo.y, 18, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2ee6d6";
  ctx.beginPath();
  ctx.ellipse(ufo.x, ufo.y - 5, 9, 6, 0, Math.PI, 0);
  ctx.fill();
  ctx.restore();
}

function drawPowerups(ctx: CanvasRenderingContext2D, state: StarDefenderState): void {
  state.powerupDrops.forEach((p) => {
    ctx.save();
    ctx.fillStyle = POWERUP_COLORS[p.kind];
    ctx.beginPath();
    ctx.roundRect(p.x - 9, p.y - 9, 18, 18, 5);
    ctx.fill();
    ctx.strokeStyle = "#150c33";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = "bold 9px sans-serif";
    ctx.fillStyle = "#150c33";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(p.kind[0].toUpperCase(), p.x, p.y + 1);
    ctx.restore();
  });
}

function drawPowerupHud(ctx: CanvasRenderingContext2D, state: StarDefenderState, width: number, ts: number): void {
  const active: PowerupKind[] = [];
  if (state.activePowerups.spread && ts < state.activePowerups.spread) active.push("spread");
  if (state.activePowerups.rapid && ts < state.activePowerups.rapid) active.push("rapid");
  if (state.hasShield) active.push("shield");
  if (active.length === 0) return;

  ctx.font = "bold 11px sans-serif";
  ctx.textAlign = "right";
  active.forEach((kind, i) => {
    ctx.fillStyle = POWERUP_COLORS[kind];
    ctx.fillText(POWERUP_LABELS[kind], width - 8, 36 + i * 14);
  });
}

export function draw(ctx: CanvasRenderingContext2D, state: StarDefenderState, ts: number, width: number, height: number): void {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#150c33";
  ctx.fillRect(0, 0, width, height);

  const { player, wave, bullets } = state;

  drawBunkers(ctx, state);
  drawUfo(ctx, state);

  if (state.boss) {
    drawBoss(ctx, state, width);
  } else {
    // enemies
    wave.enemies.forEach((e) => {
      if (!e.alive) return;
      const ex = e.diving ? e.x : e.x + wave.offsetX;
      drawEnemy(ctx, ex, e.y, wave.cell, e.row + e.col, e.hp);
    });
  }

  drawPowerups(ctx, state);

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

  // shield flash — a brief ring around the ship when a shield powerup
  // absorbed a hit instead of costing a life
  if (ts < state.shieldFlashUntil) {
    const remaining = state.shieldFlashUntil - ts;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, remaining / 300));
    ctx.strokeStyle = "#8bff56";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.w * 0.8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
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

  drawPowerupHud(ctx, state, width, ts);

  // lives / wave HUD
  ctx.font = "14px sans-serif";
  ctx.textAlign = "left";
  ctx.fillStyle = "#f5f5ff";
  ctx.fillText("❤️".repeat(Math.max(0, state.lives)), 8, 18);
  ctx.textAlign = "right";
  ctx.fillText(state.boss ? `Wave ${state.waveNumber} — BOSS` : `Wave ${state.waveNumber}`, width - 8, 18);
}
