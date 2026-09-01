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

// Added 2026-08-31 for the Kickoff Clash / Turbo Dash artistic overhaul.
// Soccer players are top-down torso-and-head sprites that face +X (right)
// in the source art, so a canvas rotate() by the heading angle needs no
// extra offset — see PLAYER_SPRITE_FACING below.
import playerBlueAUrl from "../assets/game/sprites/player-blue-a.png";
import playerBlueBUrl from "../assets/game/sprites/player-blue-b.png";
import playerRedAUrl from "../assets/game/sprites/player-red-a.png";
import playerRedBUrl from "../assets/game/sprites/player-red-b.png";
import keeperGreenUrl from "../assets/game/sprites/keeper-green.png";
// Turbo Dash rivals: deliberately the "_2" body shape from the Kenney
// racing pack, so their silhouette differs from the "_1" shape used by the
// player car and the traffic obstacles even at a glance.
import carRivalRedUrl from "../assets/game/sprites/car-rival-red.png";
import carRivalBlueUrl from "../assets/game/sprites/car-rival-blue.png";
import carRivalYellowUrl from "../assets/game/sprites/car-rival-yellow.png";
import roadsideBush1Url from "../assets/game/sprites/roadside-bush-1.png";
import roadsideBush2Url from "../assets/game/sprites/roadside-bush-2.png";
import roadsideConeUrl from "../assets/game/sprites/roadside-cone.png";
import roadsideBarrelUrl from "../assets/game/sprites/roadside-barrel.png";
import roadsideBarrierUrl from "../assets/game/sprites/roadside-barrier.png";
import cloud1Url from "../assets/game/sprites/cloud-1.png";
import cloud2Url from "../assets/game/sprites/cloud-2.png";
import startLightsUrl from "../assets/game/sprites/start-lights.png";

// Added 2026-09-01 for the Star Defender / Rumble Ring artistic overhaul.
// Fighter poses come from the Kenney "Toon Characters" pack, which ships a
// full pose set per character (idle/attack/hurt/jump/duck/walk) rather than
// a single static image — that's what makes real animation states possible
// instead of one frozen sprite. Each of the 3 CHARACTERS in
// src/games/fighter/engine.ts gets its own character type so they read as
// visually distinct, not just recolored: Blaze (balanced) -> the male
// adventurer, Turbo (fast/light) -> the female adventurer, Titan (slow/heavy)
// -> the robot, whose blocky silhouette matches its "hits like a truck" stats.
import fighterBlazeIdleUrl from "../assets/game/sprites/fighter-blaze-idle.png";
import fighterBlazeAttack0Url from "../assets/game/sprites/fighter-blaze-attack0.png";
import fighterBlazeAttackKickUrl from "../assets/game/sprites/fighter-blaze-attackkick.png";
import fighterBlazeHurtUrl from "../assets/game/sprites/fighter-blaze-hurt.png";
import fighterBlazeJumpUrl from "../assets/game/sprites/fighter-blaze-jump.png";
import fighterBlazeDuckUrl from "../assets/game/sprites/fighter-blaze-duck.png";
import fighterBlazeWalk0Url from "../assets/game/sprites/fighter-blaze-walk0.png";
import fighterBlazeWalk1Url from "../assets/game/sprites/fighter-blaze-walk1.png";
import fighterTurboIdleUrl from "../assets/game/sprites/fighter-turbo-idle.png";
import fighterTurboAttack0Url from "../assets/game/sprites/fighter-turbo-attack0.png";
import fighterTurboAttackKickUrl from "../assets/game/sprites/fighter-turbo-attackkick.png";
import fighterTurboHurtUrl from "../assets/game/sprites/fighter-turbo-hurt.png";
import fighterTurboJumpUrl from "../assets/game/sprites/fighter-turbo-jump.png";
import fighterTurboDuckUrl from "../assets/game/sprites/fighter-turbo-duck.png";
import fighterTurboWalk0Url from "../assets/game/sprites/fighter-turbo-walk0.png";
import fighterTurboWalk1Url from "../assets/game/sprites/fighter-turbo-walk1.png";
import fighterTitanIdleUrl from "../assets/game/sprites/fighter-titan-idle.png";
import fighterTitanAttack0Url from "../assets/game/sprites/fighter-titan-attack0.png";
import fighterTitanAttackKickUrl from "../assets/game/sprites/fighter-titan-attackkick.png";
import fighterTitanHurtUrl from "../assets/game/sprites/fighter-titan-hurt.png";
import fighterTitanJumpUrl from "../assets/game/sprites/fighter-titan-jump.png";
import fighterTitanDuckUrl from "../assets/game/sprites/fighter-titan-duck.png";
import fighterTitanWalk0Url from "../assets/game/sprites/fighter-titan-walk0.png";
import fighterTitanWalk1Url from "../assets/game/sprites/fighter-titan-walk1.png";
// Bunker tile for Star Defender (replaces the flat filled-rect bunker cells)
// and a second, bulkier ship design promoted to "boss" so it doesn't share
// a silhouette with the player's ship.
import bunkerCrateUrl from "../assets/game/sprites/bunker-crate.png";
import bossShipUrl from "../assets/game/sprites/boss-ship.png";

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
  playerBlueA: loadImage(playerBlueAUrl),
  playerBlueB: loadImage(playerBlueBUrl),
  playerRedA: loadImage(playerRedAUrl),
  playerRedB: loadImage(playerRedBUrl),
  keeperGreen: loadImage(keeperGreenUrl),
  carRivalRed: loadImage(carRivalRedUrl),
  carRivalBlue: loadImage(carRivalBlueUrl),
  carRivalYellow: loadImage(carRivalYellowUrl),
  roadsideBush1: loadImage(roadsideBush1Url),
  roadsideBush2: loadImage(roadsideBush2Url),
  roadsideCone: loadImage(roadsideConeUrl),
  roadsideBarrel: loadImage(roadsideBarrelUrl),
  roadsideBarrier: loadImage(roadsideBarrierUrl),
  cloud1: loadImage(cloud1Url),
  cloud2: loadImage(cloud2Url),
  startLights: loadImage(startLightsUrl),
  fighterBlazeIdle: loadImage(fighterBlazeIdleUrl),
  fighterBlazeAttack0: loadImage(fighterBlazeAttack0Url),
  fighterBlazeAttackKick: loadImage(fighterBlazeAttackKickUrl),
  fighterBlazeHurt: loadImage(fighterBlazeHurtUrl),
  fighterBlazeJump: loadImage(fighterBlazeJumpUrl),
  fighterBlazeDuck: loadImage(fighterBlazeDuckUrl),
  fighterBlazeWalk0: loadImage(fighterBlazeWalk0Url),
  fighterBlazeWalk1: loadImage(fighterBlazeWalk1Url),
  fighterTurboIdle: loadImage(fighterTurboIdleUrl),
  fighterTurboAttack0: loadImage(fighterTurboAttack0Url),
  fighterTurboAttackKick: loadImage(fighterTurboAttackKickUrl),
  fighterTurboHurt: loadImage(fighterTurboHurtUrl),
  fighterTurboJump: loadImage(fighterTurboJumpUrl),
  fighterTurboDuck: loadImage(fighterTurboDuckUrl),
  fighterTurboWalk0: loadImage(fighterTurboWalk0Url),
  fighterTurboWalk1: loadImage(fighterTurboWalk1Url),
  fighterTitanIdle: loadImage(fighterTitanIdleUrl),
  fighterTitanAttack0: loadImage(fighterTitanAttack0Url),
  fighterTitanAttackKick: loadImage(fighterTitanAttackKickUrl),
  fighterTitanHurt: loadImage(fighterTitanHurtUrl),
  fighterTitanJump: loadImage(fighterTitanJumpUrl),
  fighterTitanDuck: loadImage(fighterTitanDuckUrl),
  fighterTitanWalk0: loadImage(fighterTitanWalk0Url),
  fighterTitanWalk1: loadImage(fighterTitanWalk1Url),
  bunkerCrate: loadImage(bunkerCrateUrl),
  bossShip: loadImage(bossShipUrl),
};

// The soccer character art is drawn facing right (+X, i.e. 0 radians in
// canvas space). Renderers rotate by `Math.atan2(dy, dx) + PLAYER_SPRITE_FACING`
// so if we ever swap in art with a different rest orientation, only this
// constant changes.
export const PLAYER_SPRITE_FACING = 0;

// Kickoff Clash's four outfield players. Both teams get two visibly
// different faces/hair so "you vs. your teammate" and "defender 1 vs.
// defender 2" stay distinguishable without relying on the kit color alone.
export const SOCCER_PLAYER_SPRITES = {
  player: SPRITES.playerBlueA,
  teammate: SPRITES.playerBlueB,
  opponentA: SPRITES.playerRedA,
  opponentB: SPRITES.playerRedB,
  keeper: SPRITES.keeperGreen,
};

// Turbo Dash's three named rivals, in the fixed order the engine spawns
// them: Red Comet, Blue Blaze, Gold Rush.
export const RIVAL_CAR_SPRITES = [SPRITES.carRivalRed, SPRITES.carRivalBlue, SPRITES.carRivalYellow];

// Scenery scattered along Turbo Dash's shoulders. Cycled by index so the
// roadside doesn't repeat in an obvious rhythm.
export const ROADSIDE_SPRITES = [
  SPRITES.roadsideBush1,
  SPRITES.roadsideCone,
  SPRITES.roadsideBush2,
  SPRITES.roadsideBarrel,
  SPRITES.roadsideBush1,
  SPRITES.roadsideBarrier,
];

export const CLOUD_SPRITES = [SPRITES.cloud1, SPRITES.cloud2];

// Rumble Ring's per-character pose set, keyed by CharacterDef.id
// (src/games/fighter/engine.ts). Every character has the same pose
// vocabulary so the fighter component can look up "this character's idle
// frame" generically without a character-specific switch statement. Facing
// convention: all poses face RIGHT at rest, same as PLAYER_SPRITE_FACING
// above — mirror horizontally (negative scale) for a character facing left.
export interface FighterPoseSet {
  idle: HTMLImageElement;
  punch: HTMLImageElement;
  kick: HTMLImageElement;
  hurt: HTMLImageElement;
  jump: HTMLImageElement;
  duck: HTMLImageElement;
  walk: [HTMLImageElement, HTMLImageElement];
}

export const FIGHTER_SPRITES: Record<string, FighterPoseSet> = {
  blaze: {
    idle: SPRITES.fighterBlazeIdle,
    punch: SPRITES.fighterBlazeAttack0,
    kick: SPRITES.fighterBlazeAttackKick,
    hurt: SPRITES.fighterBlazeHurt,
    jump: SPRITES.fighterBlazeJump,
    duck: SPRITES.fighterBlazeDuck,
    walk: [SPRITES.fighterBlazeWalk0, SPRITES.fighterBlazeWalk1],
  },
  turbo: {
    idle: SPRITES.fighterTurboIdle,
    punch: SPRITES.fighterTurboAttack0,
    kick: SPRITES.fighterTurboAttackKick,
    hurt: SPRITES.fighterTurboHurt,
    jump: SPRITES.fighterTurboJump,
    duck: SPRITES.fighterTurboDuck,
    walk: [SPRITES.fighterTurboWalk0, SPRITES.fighterTurboWalk1],
  },
  titan: {
    idle: SPRITES.fighterTitanIdle,
    punch: SPRITES.fighterTitanAttack0,
    kick: SPRITES.fighterTitanAttackKick,
    hurt: SPRITES.fighterTitanHurt,
    jump: SPRITES.fighterTitanJump,
    duck: SPRITES.fighterTitanDuck,
    walk: [SPRITES.fighterTitanWalk0, SPRITES.fighterTitanWalk1],
  },
};

// A pose set is only usable once every frame in it has loaded — checking
// just one frame could flash a mix of real art and fallback shapes across
// a single character mid-match, which would look broken rather than
// gracefully degraded.
export function fighterPoseSetReady(poses: FighterPoseSet): boolean {
  return (
    isReady(poses.idle) &&
    isReady(poses.punch) &&
    isReady(poses.kick) &&
    isReady(poses.hurt) &&
    isReady(poses.jump) &&
    isReady(poses.duck) &&
    isReady(poses.walk[0]) &&
    isReady(poses.walk[1])
  );
}

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
