// All CanvasRenderingContext2D calls for Star Defender live here — the
// "UI" half's rendering concern, kept separate from engine.ts's game rules.

import type { StarDefenderState, PowerupKind } from "./engine";
import { SPRITES, METEOR_SPRITES, isReady } from "../../lib/sprites";
import { ParticleField, ScreenShake } from "../../lib/particles";
import { drawLabel, drawBanner } from "../../lib/canvasText";
import { motion } from "../../lib/motion";

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

// ---------------------------------------------------------------------------
// Cosmetic-only module state. None of this feeds back into engine.ts — it's
// pure visual flourish (particles/shake/starfield/banners), so it lives here
// rather than in StarDefenderState (see lib/particles.ts's file comment for
// the rationale). GameShell fully unmounts/remounts StarDefender.tsx between
// playthroughs, but this module itself isn't re-imported on remount, so
// resetEffects() (called by StarDefender.tsx whenever a fresh run starts) is
// what actually clears the slate.
// ---------------------------------------------------------------------------

const particles = new ParticleField();
const shake = new ScreenShake();
let lastFrameTs = 0;

interface Star {
  x: number;
  y: number;
  r: number;
}
interface StarLayer {
  stars: Star[];
  speed: number;
  alpha: number;
}
// 3 depth layers moving at different speeds for a cheap parallax read —
// closer "layer" = bigger/brighter/faster, matching how real depth parallax
// reads even as flat dots.
const STAR_LAYER_DEFS = [
  { count: 44, speed: 0.14, alpha: 0.45, minR: 0.5, maxR: 1.1 },
  { count: 28, speed: 0.3, alpha: 0.7, minR: 0.9, maxR: 1.6 },
  { count: 14, speed: 0.55, alpha: 1, minR: 1.3, maxR: 2.2 },
];
let starLayers: StarLayer[] = [];
let starLayersKey = "";

let ufoPhase = 0;

interface BannerState {
  text: string;
  startTs: number;
  durationMs: number;
  fill: string;
}
let banner: BannerState | null = null;

/** Called by StarDefender.tsx whenever a new run's state is created. */
export function resetEffects(): void {
  particles.clear();
  shake.clear();
  lastFrameTs = 0;
  starLayers = [];
  starLayersKey = "";
  ufoPhase = 0;
  banner = null;
}

/** Regular enemy destroyed: a modest spark burst, no shake — this shouldn't
 * compete with the bigger moments (boss hit, UFO kill, player death). */
export function onEnemyKilled(x: number, y: number): void {
  particles.sparks(x, y, 12);
}

/** Player took a hit (life lost): heavier debris + a real shake, since
 * losing a life is the single worst thing that can happen mid-run. */
export function onPlayerHit(x: number, y: number): void {
  particles.debris(x, y, 16);
  shake.trigger(9, 260);
}

/** A single shot landing on the boss: small spark + a light punch — enough
 * to feel every hit land without it adding up to boss-defeat-sized shake. */
export function onBossHit(x: number, y: number): void {
  particles.sparks(x, y, 8);
  shake.trigger(3, 90);
}

/** Boss defeated: the biggest moment in the game — heavy debris, a big spark
 * burst, a strong shake, and a "BOSS DEFEATED!" banner. */
export function onBossDefeated(x: number, y: number, ts: number): void {
  particles.debris(x, y, 36);
  particles.sparks(x, y, 28);
  shake.trigger(16, 500);
  banner = { text: "BOSS DEFEATED!", startTs: ts, durationMs: 2200, fill: "#ff4d8d" };
}

/** A normal (non-boss) wave cleared: just the banner, no shake — nothing was
 * destroyed in a way that should jolt the screen. */
export function onWaveClear(ts: number): void {
  banner = { text: "WAVE CLEAR!", startTs: ts, durationMs: 1600, fill: "#8bff56" };
}

/** Bonus UFO shot down: a rare, special-feeling hit — sparks plus a
 * noticeably bigger shake than a regular enemy kill gets. */
export function onUfoHit(x: number, y: number): void {
  particles.sparks(x, y, 20);
  shake.trigger(6, 180);
}

// --- Starfield --------------------------------------------------------------

function ensureStarLayers(width: number, height: number): void {
  const key = `${width}x${height}`;
  if (starLayersKey === key && starLayers.length > 0) return;
  starLayersKey = key;
  starLayers = STAR_LAYER_DEFS.map((def) => ({
    speed: def.speed,
    alpha: def.alpha,
    stars: Array.from({ length: def.count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: def.minR + Math.random() * (def.maxR - def.minR),
    })),
  }));
}

function drawStarfield(ctx: CanvasRenderingContext2D, width: number, height: number, dt: number): void {
  ensureStarLayers(width, height);
  // Subtle under reduced motion rather than frozen entirely — a completely
  // static starfield still reads fine, but slowing it (rather than stopping
  // it dead) avoids a jarring hard cut the moment the setting is toggled.
  const speedScale = motion.reduced ? 0.25 : 1;
  const frames = dt / 16.7;
  ctx.save();
  ctx.fillStyle = "#f5f5ff";
  starLayers.forEach((layer) => {
    ctx.globalAlpha = layer.alpha;
    layer.stars.forEach((star) => {
      star.y += layer.speed * speedScale * frames;
      if (star.y > height) star.y -= height;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      ctx.fill();
    });
  });
  ctx.restore();
}

// --- Bunkers -----------------------------------------------------------------

function drawBunkers(ctx: CanvasRenderingContext2D, state: StarDefenderState): void {
  const useSprite = isReady(SPRITES.bunkerCrate);
  state.bunkers.forEach((bunker) => {
    bunker.cells.forEach((row, r) => {
      row.forEach((present, c) => {
        if (!present) return;
        const x = bunker.x + c * bunker.cellW;
        const y = bunker.y + r * bunker.cellH;
        if (useSprite) {
          ctx.drawImage(SPRITES.bunkerCrate, x, y, bunker.cellW - 1, bunker.cellH - 1);
        } else {
          ctx.fillStyle = "#8bff56";
          ctx.fillRect(x, y, bunker.cellW - 1, bunker.cellH - 1);
        }
      });
    });
  });
}

// --- Enemies -----------------------------------------------------------------

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

// --- Boss --------------------------------------------------------------------

function drawBossSprite(ctx: CanvasRenderingContext2D, state: StarDefenderState, width: number): void {
  const boss = state.boss;
  if (!boss) return;
  const size = width * 0.2;

  ctx.save();
  if (isReady(SPRITES.bossShip)) {
    const w = size;
    const h = w * (SPRITES.bossShip.naturalHeight / SPRITES.bossShip.naturalWidth);
    ctx.drawImage(SPRITES.bossShip, boss.x - w / 2, boss.y - h / 2, w, h);
  } else {
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
  }
  ctx.restore();
}

// Drawn outside the screen-shake transform (see draw() below) so this stays
// legible — a health bar jittering during a hit is exactly the moment you
// most need to read it.
function drawBossHud(ctx: CanvasRenderingContext2D, state: StarDefenderState, width: number): void {
  const boss = state.boss;
  if (!boss) return;

  const barW = width * 0.6;
  const barH = 14;
  const barX = width / 2 - barW / 2;
  const barY = 26;
  const pct = Math.max(0, Math.min(1, boss.hp / boss.maxHp));

  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath();
  ctx.roundRect(barX, barY, barW, barH, 6);
  ctx.fill();
  if (pct > 0) {
    ctx.fillStyle = "#ff4d8d";
    ctx.beginPath();
    ctx.roundRect(barX, barY, Math.max(barH, barW * pct), barH, 6);
    ctx.fill();
  }
  ctx.strokeStyle = "#ffe66d";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(barX, barY, barW, barH, 6);
  ctx.stroke();
  ctx.restore();

  drawLabel(ctx, `BOSS  ${Math.max(0, boss.hp)}/${boss.maxHp}`, width / 2, barY - 6, {
    align: "center",
    size: 12,
    fill: "#ffe66d",
  });
}

// --- UFO ----------------------------------------------------------------
// No sprite exists for this anywhere in the asset packs (see sprites.ts) —
// this is a real hand-drawn piece, not a placeholder: a gradient-shaded
// saucer body, a domed cockpit, and a ring of small pulsing rim lights, with
// a gentle bob so it feels alive rather than pasted on.

function drawUfo(ctx: CanvasRenderingContext2D, state: StarDefenderState, ts: number): void {
  const ufo = state.ufo;
  if (!ufo) return;

  ufoPhase = ts * 0.004;
  const bobAmp = motion.reduced ? 0 : 3;
  const y = ufo.y + Math.sin(ufoPhase) * bobAmp;
  const w = 40;
  const h = 15;

  ctx.save();
  ctx.translate(ufo.x, y);

  // soft ambient glow
  const glowR = w * 0.95;
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, glowR);
  glow.addColorStop(0, "rgba(139,255,86,0.32)");
  glow.addColorStop(1, "rgba(139,255,86,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, glowR, 0, Math.PI * 2);
  ctx.fill();

  // saucer body — gradient-shaded so it reads as a metal disc, not a flat oval
  const bodyGrd = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  bodyGrd.addColorStop(0, "#e4e4f6");
  bodyGrd.addColorStop(0.5, "#9c9cc9");
  bodyGrd.addColorStop(1, "#54547a");
  ctx.fillStyle = bodyGrd;
  ctx.beginPath();
  ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#2ee6d6";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // dome cockpit
  const domeGrd = ctx.createLinearGradient(0, -h * 0.95, 0, -h * 0.1);
  domeGrd.addColorStop(0, "#eaffe4");
  domeGrd.addColorStop(1, "#8bff56");
  ctx.fillStyle = domeGrd;
  ctx.beginPath();
  ctx.ellipse(0, -h * 0.3, w * 0.26, h * 0.55, 0, Math.PI, 0);
  ctx.fill();
  ctx.strokeStyle = "#2ee6d6";
  ctx.lineWidth = 1;
  ctx.stroke();

  // pulsing rim lights, alternating color so the ring reads as lights and
  // not a dashed outline
  const lightCount = 6;
  for (let i = 0; i < lightCount; i++) {
    const a = (i / lightCount) * Math.PI * 2;
    const lx = Math.cos(a) * (w / 2 - 3);
    const ly = Math.sin(a) * (h / 2 - 1.5) + h * 0.08;
    const pulse = (Math.sin(ufoPhase * 2 + i * 1.1) + 1) / 2;
    ctx.beginPath();
    ctx.arc(lx, ly, 1.4 + pulse * 0.9, 0, Math.PI * 2);
    ctx.fillStyle = i % 2 === 0 ? `rgba(255,212,59,${0.5 + pulse * 0.5})` : `rgba(255,77,141,${0.5 + pulse * 0.5})`;
    ctx.fill();
  }

  ctx.restore();
}

// --- Powerups ------------------------------------------------------------

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

  active.forEach((kind, i) => {
    drawLabel(ctx, POWERUP_LABELS[kind], width - 8, 40 + i * 16, {
      align: "right",
      size: 12,
      fill: POWERUP_COLORS[kind],
    });
  });
}

// --- Main draw -----------------------------------------------------------

export function draw(ctx: CanvasRenderingContext2D, state: StarDefenderState, ts: number, width: number, height: number): void {
  const dt = lastFrameTs ? Math.min(200, ts - lastFrameTs) : 16.7;
  lastFrameTs = ts;
  particles.update(dt);
  shake.update(dt);

  ctx.clearRect(0, 0, width, height);

  // background: dark gradient + scrolling multi-layer starfield (replaces
  // the old flat #150c33 fill)
  const bgGrd = ctx.createLinearGradient(0, 0, 0, height);
  bgGrd.addColorStop(0, "#0d0726");
  bgGrd.addColorStop(1, "#201454");
  ctx.fillStyle = bgGrd;
  ctx.fillRect(0, 0, width, height);
  drawStarfield(ctx, width, height, dt);

  const { player, wave, bullets } = state;

  ctx.save();
  shake.apply(ctx);

  drawBunkers(ctx, state);
  drawUfo(ctx, state, ts);

  if (state.boss) {
    drawBossSprite(ctx, state, width);
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

  particles.draw(ctx);

  ctx.restore(); // shake — HUD/banner below stay put even while the world shakes

  if (state.boss) drawBossHud(ctx, state, width);
  drawPowerupHud(ctx, state, width, ts);

  // lives / wave HUD
  drawLabel(ctx, "❤️".repeat(Math.max(0, state.lives)), 8, 22, { size: 16 });
  drawLabel(ctx, state.boss ? `Wave ${state.waveNumber} — BOSS` : `Wave ${state.waveNumber}`, width - 8, 22, {
    align: "right",
    size: 14,
  });

  if (banner) {
    const elapsed = ts - banner.startTs;
    if (elapsed > banner.durationMs) {
      banner = null;
    } else {
      const progress = elapsed / banner.durationMs;
      drawBanner(ctx, banner.text, width / 2, height * 0.4, progress, { fill: banner.fill, size: 30 });
    }
  }
}
