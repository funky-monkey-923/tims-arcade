// Shared canvas text helpers. Every game's render.ts had grown its own
// sprinkling of `ctx.font = "bold 14px sans-serif"` plus a hand-rolled
// stroke/fill pair, which meant HUD text drifted in size and weight between
// games and none of it used the arcade's actual display face. These helpers
// give one place to fix that, and — just as importantly — they always
// save/restore, so a renderer can drop a label mid-draw without leaking
// ctx.font / textAlign / fillStyle / shadowBlur into whatever it draws next.
// (That leak was a real hazard: canvas state is global to the context, and
// the game loops draw dozens of shapes after their HUD pass.)

import { motion } from "./motion";

// Mirrors --font-display in index.css. Kept as one constant so the canvas
// and the DOM can't fall out of sync when the fallback stack changes.
const DISPLAY_STACK = `'Lilita One', 'Nunito', system-ui, sans-serif`;

// "bold" even though Lilita One only ships a 400 weight, so browsers
// synthesize it: that matches the existing call sites in fighter/soccer
// render.ts, and the chunky synthesized weight is the look this arcade
// already has. Changing it would silently restyle those screens.
export function displayFont(sizePx: number): string {
  return `bold ${sizePx}px ${DISPLAY_STACK}`;
}

export interface TextShadow {
  blur: number;
  color: string;
  offsetX?: number;
  offsetY?: number;
}

export interface OutlinedTextOptions {
  size: number;
  fill: string;
  outline?: string;
  outlineWidth?: number;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  shadow?: TextShadow;
  /** Multiplied into the caller's existing globalAlpha rather than replacing it. */
  alpha?: number;
  /** Escape hatch: a full canvas font shorthand, overriding `size` + the display face. */
  font?: string;
}

/**
 * Draws text with an outline behind it. The outline is stroked *before* the
 * fill deliberately: canvas centers a stroke on the glyph path, so half of it
 * would eat into the letterform — painting the fill on top afterwards hides
 * that inner half and leaves a clean outer contour.
 */
export function drawOutlinedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  opts: OutlinedTextOptions,
): void {
  ctx.save();
  ctx.font = opts.font ?? displayFont(opts.size);
  ctx.textAlign = opts.align ?? "center";
  ctx.textBaseline = opts.baseline ?? "alphabetic";
  if (opts.alpha !== undefined) ctx.globalAlpha *= opts.alpha;

  if (opts.shadow) {
    ctx.shadowBlur = opts.shadow.blur;
    ctx.shadowColor = opts.shadow.color;
    ctx.shadowOffsetX = opts.shadow.offsetX ?? 0;
    ctx.shadowOffsetY = opts.shadow.offsetY ?? 0;
  }

  const outlineWidth = opts.outlineWidth ?? 0;
  if (opts.outline && outlineWidth > 0) {
    // Round joins/caps stop the sharp corners of letters like "M" and "W"
    // from throwing long miter spikes at the widths we use here.
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = opts.outline;
    // Doubled because half of a centered stroke is hidden by the fill —
    // callers get the visible outer thickness they asked for.
    ctx.lineWidth = outlineWidth * 2;
    ctx.strokeText(text, x, y);
    // The shadow has already been laid down by the stroke; leaving it on for
    // the fill would double-darken it.
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";
  }

  ctx.fillStyle = opts.fill;
  ctx.fillText(text, x, y);
  ctx.restore();
}

export interface LabelOptions {
  size?: number;
  fill?: string;
  outline?: string;
  outlineWidth?: number;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  alpha?: number;
}

// Defaults tuned for HUD text that has to stay readable over anything a game
// might draw underneath it — a bright pitch, a pale road, an explosion. A
// near-black outline gives the glyphs their own contrast rather than relying
// on the background staying dark.
const LABEL_DEFAULTS = {
  size: 14,
  fill: "#f5f5ff",
  outline: "rgba(10,6,26,0.85)",
  outlineWidth: 2,
} as const;

export function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  opts: LabelOptions = {},
): void {
  drawOutlinedText(ctx, text, x, y, {
    size: opts.size ?? LABEL_DEFAULTS.size,
    fill: opts.fill ?? LABEL_DEFAULTS.fill,
    outline: opts.outline ?? LABEL_DEFAULTS.outline,
    outlineWidth: opts.outlineWidth ?? LABEL_DEFAULTS.outlineWidth,
    align: opts.align ?? "left",
    baseline: opts.baseline ?? "alphabetic",
    alpha: opts.alpha,
  });
}

// Fraction of a banner's lifetime spent slamming in. The rest is hold time
// plus the fade, so the word is legible far longer than it is moving.
const BANNER_SLAM_PORTION = 0.28;
// Where the fade-out begins. Chosen so a 2s banner holds fully opaque for
// ~1.4s, which is about how long a young reader needs for a short word.
const BANNER_FADE_START = 0.7;

export interface BannerTransform {
  scale: number;
  alpha: number;
}

/**
 * Slam-in easing for a full-screen banner ("GOAL!", "LAP 2!", "K.O.!").
 *
 * `progress` runs 0 -> 1 across the banner's lifetime. Scale uses the
 * standard back-out curve (Penner's easeOutBack, c1 = 1.70158), which
 * overshoots roughly 10% past its target before settling — that tiny bounce
 * is what makes the text read as *landing* rather than merely appearing.
 * Alpha holds at 1 and then ramps to 0 over the tail.
 *
 * Pure: no ctx, no time source, so it's trivially testable and callers can
 * reuse it to drive anything else keyed to the same banner (a flash, a
 * crowd-noise envelope).
 */
export function bannerTransform(progress: number): BannerTransform {
  const p = Math.min(1, Math.max(0, progress));

  const c1 = 1.70158;
  const c3 = c1 + 1;
  const t = Math.min(1, p / BANNER_SLAM_PORTION);
  const back = 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);

  const alpha = p < BANNER_FADE_START ? 1 : Math.max(0, (1 - p) / (1 - BANNER_FADE_START));

  return { scale: back, alpha };
}

export interface BannerOptions {
  size?: number;
  fill?: string;
  outline?: string;
  outlineWidth?: number;
  shadow?: TextShadow;
}

const BANNER_DEFAULTS = {
  size: 34,
  fill: "#ffd43b",
  outline: "#150c33",
  outlineWidth: 4,
} as const;

/**
 * Big celebratory text centered on (cx, cy) that slams in and fades out.
 *
 * When reduced motion is on we drop the scale animation entirely and let the
 * banner just fade — a zooming, overshooting block of text is exactly the
 * kind of large-area movement the setting exists to suppress, and the words
 * themselves carry all the information, so nothing is lost by holding still.
 */
export function drawBanner(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  progress: number,
  opts: BannerOptions = {},
): void {
  const { scale, alpha } = bannerTransform(progress);
  if (alpha <= 0) return;

  ctx.save();
  ctx.globalAlpha *= alpha;
  if (!motion.reduced) {
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);
  }
  drawOutlinedText(ctx, text, cx, cy, {
    size: opts.size ?? BANNER_DEFAULTS.size,
    fill: opts.fill ?? BANNER_DEFAULTS.fill,
    outline: opts.outline ?? BANNER_DEFAULTS.outline,
    outlineWidth: opts.outlineWidth ?? BANNER_DEFAULTS.outlineWidth,
    align: "center",
    baseline: "middle",
    shadow: opts.shadow,
  });
  ctx.restore();
}
