// A small, allocation-conscious particle system plus a screen-shake helper,
// shared by every game's render.ts.
//
// Why this lives on the render side rather than in engine state: engines are
// pure logic with no DOM/canvas awareness (see games/engineTypes.ts), and
// particles are 100% cosmetic — they never feed back into a rule, a score, or
// a collision. Putting them in engine state would bloat the state object that
// gets snapshotted and reasoned about, for no gameplay benefit. So a render.ts
// module owns a ParticleField at module scope, spawns into it when it notices
// a state change worth celebrating, and drives update()/draw() from its own
// draw() call.

import { motion, scaleForMotion } from "./motion";

// Hard ceiling on live particles across a single field. A game that spawns
// on a per-frame condition (rather than on an edge) can otherwise emit
// forever and quietly grow the pool until the tab is sluggish — this makes
// the worst case a fixed, small amount of memory and a bounded draw loop.
// 400 is comfortably more than any single celebration needs; the confetti
// burst, the largest preset here, tops out at 90.
export const MAX_PARTICLES = 400;

// Longest frame delta we'll integrate in one step. After a tab switch or a
// GC pause the raw delta can be seconds, which would teleport every particle
// off-screen in a single frame. Clamping just makes the burst run slightly
// slow for one frame instead.
const MAX_STEP_MS = 50;

export type ParticleShape = "square" | "circle" | "spark" | "ribbon";

export interface Particle {
  x: number;
  y: number;
  /** Velocity in px/second. */
  vx: number;
  vy: number;
  /** Remaining lifetime in ms; the particle dies at <= 0. */
  life: number;
  maxLife: number;
  size: number;
  color: string;
  /** Downward acceleration in px/second^2. */
  gravity: number;
  /** Exponential velocity decay coefficient, in 1/second. 0 = no drag. */
  drag: number;
  /** Rotation speed in radians/second. Only meaningful for square/ribbon. */
  spin?: number;
  /** Current rotation in radians. */
  angle?: number;
  shape: ParticleShape;
}

export interface SpawnOptions {
  x: number;
  y: number;
  /** Half-width/half-height of the random box the spawn point is jittered in. */
  spreadX?: number;
  spreadY?: number;
  /** Centre of the emission cone, in radians (0 = +X, PI/2 = down). */
  angle?: number;
  /** Half-angle of the emission cone. Math.PI gives a full circle. */
  spread?: number;
  speedMin?: number;
  speedMax?: number;
  colors: string[];
  /** Lifetime range in ms. */
  lifeMin?: number;
  lifeMax?: number;
  sizeMin?: number;
  sizeMax?: number;
  gravity?: number;
  drag?: number;
  spinMin?: number;
  spinMax?: number;
  shape?: ParticleShape;
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pick(colors: string[]): string {
  return colors.length > 0 ? colors[Math.floor(Math.random() * colors.length)] : "#ffffff";
}

// Reduced-motion policy, applied uniformly by every emitter below.
//
// We *reduce* rather than *remove*. The arcade's accessibility principle is
// that feedback must never depend on a single channel — a goal reads as a
// goal through the banner, the sound, and the burst of color together. Delete
// the burst entirely and a player who relies on it loses a channel; keep a
// quarter of it, moving at under half speed, and the moment still reads while
// the large-area motion that actually triggers vestibular discomfort is gone.
// (Screen shake, by contrast, carries no information at all and does go to
// zero — see scaleForMotion in motion.ts.)
const REDUCED_COUNT_FACTOR = 0.25;
const REDUCED_SPEED_FACTOR = 0.4;

function reducedCount(count: number): number {
  if (!motion.reduced) return count;
  // At least one particle, so a preset can never silently become a no-op.
  return Math.max(1, Math.round(count * REDUCED_COUNT_FACTOR));
}

function reducedSpeed(speed: number): number {
  return motion.reduced ? speed * REDUCED_SPEED_FACTOR : speed;
}

export class ParticleField {
  // A pool, not a list: indices [0, live) are alive, and everything from
  // `live` upward is a dead particle object kept around to be re-initialised
  // by the next spawn(). Steady-state allocation is therefore zero.
  private items: Particle[] = [];
  private live = 0;

  get count(): number {
    return this.live;
  }

  /**
   * Generic emitter. Every named preset below is a thin wrapper over this, so
   * a game with a one-off effect can call spawn() directly rather than
   * growing the preset list.
   */
  spawn(count: number, opts: SpawnOptions): void {
    const wanted = reducedCount(count);
    const room = MAX_PARTICLES - this.live;
    const n = Math.min(wanted, room);
    if (n <= 0) return;

    const baseAngle = opts.angle ?? -Math.PI / 2;
    const spread = opts.spread ?? Math.PI;
    const speedMin = reducedSpeed(opts.speedMin ?? 60);
    const speedMax = reducedSpeed(opts.speedMax ?? 180);
    const lifeMin = opts.lifeMin ?? 400;
    const lifeMax = opts.lifeMax ?? 900;
    const sizeMin = opts.sizeMin ?? 3;
    const sizeMax = opts.sizeMax ?? 6;
    const spinMin = opts.spinMin ?? 0;
    const spinMax = opts.spinMax ?? 0;
    const shape = opts.shape ?? "square";

    for (let i = 0; i < n; i++) {
      const a = baseAngle + rand(-spread, spread);
      const speed = rand(speedMin, speedMax);
      const life = rand(lifeMin, lifeMax);

      let p = this.items[this.live];
      if (p === undefined) {
        p = {
          x: 0, y: 0, vx: 0, vy: 0,
          life: 0, maxLife: 0,
          size: 0, color: "#fff",
          gravity: 0, drag: 0,
          shape: "square",
        };
        this.items.push(p);
      }

      p.x = opts.x + rand(-(opts.spreadX ?? 0), opts.spreadX ?? 0);
      p.y = opts.y + rand(-(opts.spreadY ?? 0), opts.spreadY ?? 0);
      p.vx = Math.cos(a) * speed;
      p.vy = Math.sin(a) * speed;
      p.life = life;
      p.maxLife = life;
      p.size = rand(sizeMin, sizeMax);
      p.color = pick(opts.colors);
      p.gravity = opts.gravity ?? 0;
      p.drag = opts.drag ?? 0;
      p.spin = spinMax !== 0 || spinMin !== 0 ? rand(spinMin, spinMax) : 0;
      p.angle = Math.random() * Math.PI * 2;
      p.shape = shape;

      this.live++;
    }
  }

  // ---- Named presets -------------------------------------------------
  // Each documents the game moment it exists for, so a renderer picks by
  // intent ("this is a crash") rather than by fiddling with raw spawn opts.

  /**
   * Kickoff Clash: goal scored. Bright multi-colour ribbons that tumble as
   * they fall, spawned across a wide band so it reads as raining down on the
   * pitch rather than erupting from one point.
   */
  confetti(x: number, y: number, count = 90): void {
    this.spawn(count, {
      x, y,
      spreadX: 90,
      spreadY: 20,
      angle: -Math.PI / 2,
      spread: Math.PI / 2.2,
      speedMin: 120,
      speedMax: 320,
      colors: ["#ffd43b", "#2ee6d6", "#ff4d8d", "#8bff56", "#f5f5ff", "#a97bff"],
      lifeMin: 900,
      lifeMax: 1800,
      sizeMin: 4,
      sizeMax: 8,
      gravity: 420,
      drag: 0.6,
      spinMin: -9,
      spinMax: 9,
      shape: "ribbon",
    });
  }

  /**
   * Kickoff Clash: a player planting a foot to turn or striking the ball
   * (turf kicked up). Turbo Dash: tyre dust on a lane change. `dir` is the
   * direction the puff should drift, in radians — normally the opposite of
   * the mover's heading.
   */
  dust(x: number, y: number, dir: number, count = 10): void {
    this.spawn(count, {
      x, y,
      spreadX: 4,
      spreadY: 3,
      angle: dir,
      spread: Math.PI / 5,
      speedMin: 30,
      speedMax: 110,
      colors: ["rgba(226,226,214,0.9)", "rgba(198,198,186,0.8)", "rgba(246,246,238,0.75)"],
      lifeMin: 220,
      lifeMax: 480,
      sizeMin: 3,
      sizeMax: 8,
      gravity: -20, // drifts gently upward as it dissipates, like real dust
      drag: 3.2,
      shape: "circle",
    });
  }

  /**
   * Turbo Dash: crash impact and metal-on-barrier scrape. Fast, bright and
   * very short-lived — a spark should be gone before the eye settles on it,
   * which is what sells it as hot metal rather than as more confetti.
   */
  sparks(x: number, y: number, count = 22): void {
    this.spawn(count, {
      x, y,
      spreadX: 3,
      spreadY: 3,
      angle: -Math.PI / 2,
      spread: Math.PI,
      speedMin: 220,
      speedMax: 520,
      colors: ["#fff3b0", "#ffd43b", "#ff9e3d", "#ffffff"],
      lifeMin: 140,
      lifeMax: 340,
      sizeMin: 2,
      sizeMax: 4,
      gravity: 120,
      drag: 2.4,
      shape: "spark",
    });
  }

  /**
   * Turbo Dash: crash. The heavy counterpart to sparks() — chunky dark
   * fragments with real gravity that arc out and fall, so a collision has
   * visible weight and not just a flash.
   */
  debris(x: number, y: number, count = 16): void {
    this.spawn(count, {
      x, y,
      spreadX: 8,
      spreadY: 6,
      angle: -Math.PI / 2,
      spread: Math.PI / 1.6,
      speedMin: 90,
      speedMax: 280,
      colors: ["#2b2b38", "#4a4a5c", "#150c33", "#6b5f4a"],
      lifeMin: 500,
      lifeMax: 1100,
      sizeMin: 4,
      sizeMax: 9,
      gravity: 620,
      drag: 0.4,
      spinMin: -7,
      spinMax: 7,
      shape: "square",
    });
  }

  /**
   * Continuous emission behind a moving thing: Turbo Dash's nitro flame, a
   * struck ball's comet tail. Deliberately weightless and nearly still — the
   * effect comes from the mover leaving particles behind, so any velocity of
   * their own just smears the trail.
   */
  trail(x: number, y: number, color: string, count = 3): void {
    this.spawn(count, {
      x, y,
      spreadX: 3,
      spreadY: 3,
      angle: 0,
      spread: Math.PI,
      speedMin: 5,
      speedMax: 30,
      colors: [color],
      lifeMin: 260,
      lifeMax: 560,
      sizeMin: 3,
      sizeMax: 7,
      gravity: 0,
      drag: 1.6,
      shape: "circle",
    });
  }

  // ---- Simulation ----------------------------------------------------

  /**
   * Integrates one frame. O(live) with swap-and-pop compaction: a dead
   * particle trades places with the last live one and the live count shrinks,
   * so the object itself stays in the pool for reuse and no array is
   * allocated per frame.
   */
  update(dtMs: number): void {
    const step = Math.min(Math.max(dtMs, 0), MAX_STEP_MS);
    const dt = step / 1000;
    if (dt <= 0) return;

    let i = 0;
    while (i < this.live) {
      const p = this.items[i];
      p.life -= step;
      if (p.life <= 0) {
        const last = this.live - 1;
        this.items[i] = this.items[last];
        this.items[last] = p;
        this.live = last;
        continue; // don't advance i — a fresh particle now occupies this slot
      }

      p.vy += p.gravity * dt;
      if (p.drag > 0) {
        // Exponential decay rather than a per-frame multiplier, so the same
        // drag value behaves identically at 60fps and 144fps.
        const k = Math.exp(-p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.spin) p.angle = (p.angle ?? 0) + p.spin * dt;

      i++;
    }
  }

  /** Draws every live particle. Leaves ctx exactly as it found it. */
  draw(ctx: CanvasRenderingContext2D): void {
    if (this.live === 0) return;
    ctx.save();
    for (let i = 0; i < this.live; i++) {
      const p = this.items[i];
      const t = Math.max(0, Math.min(1, p.life / p.maxLife));
      ctx.globalAlpha = t;

      switch (p.shape) {
        case "circle":
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * t, 0, Math.PI * 2);
          ctx.fill();
          break;

        case "spark": {
          // Drawn as a short streak along its own velocity, which is what
          // makes a spark look fast rather than just small.
          const speed = Math.hypot(p.vx, p.vy) || 1;
          const len = p.size * 2.5;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(1, p.size * 0.5);
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - (p.vx / speed) * len, p.y - (p.vy / speed) * len);
          ctx.stroke();
          break;
        }

        case "ribbon": {
          // A wide, thin rectangle whose height is squashed by cos(angle):
          // cheap fake 3D tumble, so falling confetti flashes edge-on the way
          // paper does instead of reading as flat spinning bars.
          const a = p.angle ?? 0;
          const flutter = Math.abs(Math.cos(a * 1.7));
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(a);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size, (-p.size * 0.5 * flutter) / 2, p.size * 2, Math.max(1, p.size * 0.5 * flutter));
          ctx.restore();
          break;
        }

        case "square":
        default: {
          const a = p.angle ?? 0;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(a);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
          ctx.restore();
          break;
        }
      }
    }
    ctx.restore();
  }

  /**
   * Drops every live particle. Keeps the pooled objects so a restart doesn't
   * re-allocate. Renderers call this on game reset, otherwise the previous
   * round's confetti is still falling over a fresh kickoff.
   */
  clear(): void {
    this.live = 0;
  }
}

export interface ShakeOffset {
  x: number;
  y: number;
}

/**
 * Camera shake for impacts — a goal, a crash, a knockout.
 *
 * Always returns a zero offset under reduced motion. Unlike particles, shake
 * is purely affective: it conveys nothing that the sound, the banner and the
 * score don't already say, so suppressing it entirely costs the player no
 * information (see the reduced-motion note above ParticleField).
 */
export class ScreenShake {
  private magnitude = 0;
  private remaining = 0;
  private duration = 0;
  private ox = 0;
  private oy = 0;

  /**
   * Strongest-wins: a small ongoing rumble can't cut short or water down a
   * big impact that lands mid-shake, but a big one always overrides.
   */
  trigger(magnitude: number, durationMs: number): void {
    const current = this.remaining > 0 ? this.magnitude * (this.remaining / this.duration) : 0;
    if (magnitude < current) return;
    this.magnitude = magnitude;
    this.duration = Math.max(1, durationMs);
    this.remaining = this.duration;
  }

  /**
   * Advances the shake and picks this frame's offset. The offset is computed
   * once here rather than inside offset()/apply(), so several calls within
   * one frame all agree — otherwise a layer drawn with two apply() calls
   * would tear apart.
   */
  update(dtMs: number): void {
    if (this.remaining <= 0) {
      this.ox = 0;
      this.oy = 0;
      return;
    }
    this.remaining = Math.max(0, this.remaining - Math.min(Math.max(dtMs, 0), MAX_STEP_MS));
    const decay = this.remaining / this.duration;
    const amp = scaleForMotion(this.magnitude * decay);
    this.ox = (Math.random() * 2 - 1) * amp;
    this.oy = (Math.random() * 2 - 1) * amp;
  }

  offset(): ShakeOffset {
    return { x: this.ox, y: this.oy };
  }

  /**
   * Translates ctx by the current offset. Deliberately does not save/restore
   * — callers wrap their whole shaken layer in their own save()/restore()
   * pair, and an extra one here would just be a second stack frame to get
   * wrong.
   */
  apply(ctx: CanvasRenderingContext2D): void {
    if (this.ox !== 0 || this.oy !== 0) ctx.translate(this.ox, this.oy);
  }

  /** Ends any in-progress shake immediately (game reset, pause). */
  clear(): void {
    this.magnitude = 0;
    this.remaining = 0;
    this.ox = 0;
    this.oy = 0;
  }
}
