// Small shared sprite loader for the royalty-free art bundled in
// src/assets/game/sprites/ (see CREDITS.md for provenance/license).
// Each entry is a plain <img> kicked off eagerly; canvases check
// `isReady(img)` before drawing so a slow/failed load just falls back to
// whatever the game draws by hand instead of a blank sprite.

import coinUrl from "../assets/game/sprites/coin.png";
import sparkleUrl from "../assets/game/sprites/sparkle.png";
import shadowUrl from "../assets/game/sprites/shadow.png";
import smokeUrl from "../assets/game/sprites/smoke.png";

// Added 2026-08-31 from the second batch of Kenney asset packs — see
// CREDITS.md for which pack each file came from and its license.
import carPlayerUrl from "../assets/game/sprites/car-player.png";
import carBlackUrl from "../assets/game/sprites/car-black.png";
import carGreenUrl from "../assets/game/sprites/car-green.png";
import carYellowUrl from "../assets/game/sprites/car-yellow.png";
import carRedUrl from "../assets/game/sprites/car-red.png";
import shipPlayerUrl from "../assets/game/sprites/ship-player.png";
import meteor1Url from "../assets/game/sprites/meteor-1.png";
import meteor2Url from "../assets/game/sprites/meteor-2.png";
import meteor3Url from "../assets/game/sprites/meteor-3.png";
import meteor4Url from "../assets/game/sprites/meteor-4.png";
import missilePlayerUrl from "../assets/game/sprites/missile-player.png";
import missileEnemyUrl from "../assets/game/sprites/missile-enemy.png";
import explosionUrl from "../assets/game/sprites/explosion.png";
import soccerBallUrl from "../assets/game/sprites/soccer-ball.png";
import cornerFlagUrl from "../assets/game/sprites/corner-flag.png";
import gloveImpactUrl from "../assets/game/sprites/glove-impact.png";
import ghostWalkUrl from "../assets/game/sprites/ghost-walk.png";
import ghostFlyUrl from "../assets/game/sprites/ghost-fly.png";
import ghostFloatUrl from "../assets/game/sprites/ghost-float.png";
import ghostSpikeUrl from "../assets/game/sprites/ghost-spike.png";
import dotGemUrl from "../assets/game/sprites/dot-gem.png";
import starBadgeUrl from "../assets/game/sprites/star-badge.png";

function loadImage(url: string): HTMLImageElement {
  const img = new Image();
  img.src = url;
  return img;
}

export const SPRITES = {
  coin: loadImage(coinUrl),
  sparkle: loadImage(sparkleUrl),
  shadow: loadImage(shadowUrl),
  smoke: loadImage(smokeUrl),
  carPlayer: loadImage(carPlayerUrl),
  carBlack: loadImage(carBlackUrl),
  carGreen: loadImage(carGreenUrl),
  carYellow: loadImage(carYellowUrl),
  carRed: loadImage(carRedUrl),
  shipPlayer: loadImage(shipPlayerUrl),
  meteor1: loadImage(meteor1Url),
  meteor2: loadImage(meteor2Url),
  meteor3: loadImage(meteor3Url),
  meteor4: loadImage(meteor4Url),
  missilePlayer: loadImage(missilePlayerUrl),
  missileEnemy: loadImage(missileEnemyUrl),
  explosion: loadImage(explosionUrl),
  soccerBall: loadImage(soccerBallUrl),
  cornerFlag: loadImage(cornerFlagUrl),
  gloveImpact: loadImage(gloveImpactUrl),
  ghostWalk: loadImage(ghostWalkUrl),
  ghostFly: loadImage(ghostFlyUrl),
  ghostFloat: loadImage(ghostFloatUrl),
  ghostSpike: loadImage(ghostSpikeUrl),
  dotGem: loadImage(dotGemUrl),
  starBadge: loadImage(starBadgeUrl),
};

// Cycles through the 4 distinct Munch Maze ghost sprites by index so each
// ghost keeps a stable, recognizable look across frames (classic Pac-Man
// gave each ghost its own personality/silhouette — this is the visual
// equivalent). Index is stable per-ghost (e.g. its spawn order), not per-frame.
export const GHOST_SPRITES = [SPRITES.ghostWalk, SPRITES.ghostFly, SPRITES.ghostFloat, SPRITES.ghostSpike];

// Cycles through the 4 meteor art variants for Star Defender's enemy
// formation so rows/columns don't all look pixel-identical.
export const METEOR_SPRITES = [SPRITES.meteor1, SPRITES.meteor2, SPRITES.meteor3, SPRITES.meteor4];

// Non-blue traffic-car colors for Turbo Dash obstacles (blue is reserved
// for the player's own car so it always reads as "you").
export const OBSTACLE_CAR_SPRITES = [SPRITES.carBlack, SPRITES.carGreen, SPRITES.carYellow, SPRITES.carRed];

export function isReady(img: HTMLImageElement | null | undefined): boolean {
  return !!img && img.complete && img.naturalWidth > 0;
}

// Draws a soft elliptical drop shadow under a character, centered at
// (x, groundY), sized relative to `w`. Falls back to a plain drawn ellipse
// if the sprite hasn't loaded yet.
export function drawShadow(ctx: CanvasRenderingContext2D, x: number, groundY: number, w: number): void {
  const h = w * 0.35;
  if (isReady(SPRITES.shadow)) {
    ctx.drawImage(SPRITES.shadow, x - w / 2, groundY - h / 2, w, h);
  } else {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(x, groundY, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}
