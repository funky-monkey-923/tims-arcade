import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { controls } from "../../lib/input";
import { engine } from "../../lib/audio";
import * as invadersEngine from "./engine";
import type { StarDefenderState, Difficulty } from "./engine";
import { draw } from "./render";
import type { GameComponentProps } from "../engineTypes";

const DIFFICULTY_OPTIONS: { id: Difficulty; label: string; blurb: string }[] = [
  { id: "easy", label: "Easy", blurb: "Slower waves, calmer fire" },
  { id: "medium", label: "Medium", blurb: "A fair fight" },
  { id: "hard", label: "Hard", blurb: "Fast, aggressive, tough boss" },
];

// Session-only "remember last pick" convenience default — mirrors
// fighter/RumbleRing.tsx's lastDifficulty. Deliberately a module-level
// variable, not storage.ts state: resets on a full page reload, which is
// fine since this is just a default, not a persisted setting.
let lastDifficulty: Difficulty = "medium";

// The only React/canvas/DOM-touching file for this game — owns the canvas
// element, reads the shared `controls` object once per frame, translates
// pointer events to canvas-relative coordinates, and wires engine.step()
// + render.draw() together inside the rAF loop. Also owns a small pre-run
// difficulty setup screen (same pattern as fighter/RumbleRing.tsx) that
// GameShell's generic "ready" overlay doesn't know anything about.
export default function StarDefender({ width, height, paused, onScoreUpdate, onGameOver }: GameComponentProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<StarDefenderState | null>(null);
  const rafRef = useRef<number>(0);

  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [pendingDifficulty, setPendingDifficulty] = useState<Difficulty>(lastDifficulty);

  useEffect(() => {
    if (!difficulty) return;
    stateRef.current = invadersEngine.createState(width, height, difficulty);
  }, [width, height, difficulty]);

  const handlePointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const state = stateRef.current;
    if (!canvas || !state) return;
    const rect = canvas.getBoundingClientRect();
    invadersEngine.onPointer(state, { x: e.clientX - rect.left, y: e.clientY - rect.top, kind: "move" });
  };

  useEffect(() => {
    if (!difficulty) return undefined;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return undefined;

    function tick(ts: number) {
      rafRef.current = requestAnimationFrame(tick);
      const state = stateRef.current;
      if (!state || state.dead) return;

      if (!paused) {
        const events = invadersEngine.step(
          state,
          { moveUp: controls.moveUp, moveDown: controls.moveDown, moveLeft: controls.moveLeft, moveRight: controls.moveRight, primaryAction: controls.primaryAction, secondaryAction: controls.secondaryAction, pointer: controls.pointer },
          16.7,
          ts
        );
        if (events.score !== undefined) onScoreUpdate(events.score);
        if (events.shot) engine.playSfx("shoot");
        if (events.enemyDestroyed) engine.playSfx("coin");
        if (events.waveClear) engine.playSfx("clear");
        if (events.hit) engine.playSfx("hit");
        if (events.powerupCollected) engine.playSfx("powerup");
        if (events.shieldBlocked) engine.playSfx("powerup");
        if (events.ufoHit) engine.playSfx("coin");
        if (events.bossDefeated) engine.playSfx("highscore");
        if (events.gameOver !== undefined) {
          lastDifficulty = state.difficulty;
          onGameOver(events.gameOver);
        }
      }

      draw(ctx!, state, ts, width, height);
      // Non-null assertion: `tick` is only ever scheduled after the `if
      // (!ctx) return` above, so ctx can't be null/undefined here — but
      // TS's control-flow narrowing doesn't cross this nested-function
      // boundary, so it can't verify that itself.
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [width, height, paused, onScoreUpdate, onGameOver, difficulty]);

  return (
    <div className="relative" style={{ width, height }}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onPointerMove={handlePointerMove}
        className="block touch-none"
        role="img"
        aria-label="Star Defender space shooter game"
      />
      {!difficulty && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-night/70 p-5 text-center overflow-y-auto">
          <p className="font-display font-extrabold text-2xl text-sun">Pick your difficulty</p>
          <div className="flex flex-wrap justify-center gap-3">
            {DIFFICULTY_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setPendingDifficulty(opt.id)}
                className={`flex flex-col items-center rounded-cabinet border-4 px-4 py-3 font-display font-extrabold transition-colors ${
                  pendingDifficulty === opt.id ? "border-coral bg-violet-2" : "border-violet-2 bg-violet/80 hover:bg-violet-2"
                }`}
              >
                <span>{opt.label}</span>
                <span className="max-w-[9rem] text-xs font-bold text-cloud/70">{opt.blurb}</span>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setDifficulty(pendingDifficulty)}
            className="rounded-full bg-coral px-8 py-3 font-display font-extrabold text-ink hover:bg-coral-2 transition-colors mt-2"
          >
            ▶ Launch
          </button>
        </div>
      )}
    </div>
  );
}
