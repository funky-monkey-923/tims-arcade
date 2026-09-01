import { useEffect, useRef, useState } from "react";
import { controls } from "../../lib/input";
import { engine as audioEngine } from "../../lib/audio";
import * as racingEngine from "./engine";
import { MAX_SPEED, type Difficulty, type RacingState } from "./engine";
import { draw } from "./render";
import type { GameComponentProps } from "../engineTypes";

const DIFFICULTY_OPTIONS: { id: Difficulty; label: string; blurb: string }[] = [
  { id: "easy", label: "Easy", blurb: "Cruisin'" },
  { id: "medium", label: "Medium", blurb: "Balanced" },
  { id: "hard", label: "Hard", blurb: "Full send" },
];

// The only React/canvas/DOM-touching file for this game — owns the canvas
// element, reads the shared `controls` object once per frame, and wires
// engine.step() + render.draw() together inside the rAF loop. No pointer
// interaction for this game.
export default function TurboDash({ width, height, paused, onScoreUpdate, onGameOver }: GameComponentProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<RacingState | null>(null);
  const rafRef = useRef<number>(0);
  const lastTsRef = useRef<number>(0);
  // Pre-race setup screen: while this is null, createState() hasn't run
  // yet and the rAF loop stays idle — see the effect below.
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);

  useEffect(() => {
    if (!difficulty) return;
    stateRef.current = racingEngine.createState(width, height, difficulty);
  }, [width, height, difficulty]);

  // Looping engine hum: started on mount, stopped on unmount, independent
  // of the rAF-loop effect below (mirrors the original component).
  useEffect(() => {
    audioEngine.playEngineLoop();
    return () => audioEngine.stopEngineLoop();
  }, []);

  useEffect(() => {
    if (!difficulty) return undefined;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return undefined;

    function tick(ts: number) {
      rafRef.current = requestAnimationFrame(tick);
      const state = stateRef.current;
      if (!state || state.dead) return;

      const dt = lastTsRef.current ? ts - lastTsRef.current : 16.7;
      lastTsRef.current = ts;

      if (!paused) {
        const events = racingEngine.step(
          state,
          { moveUp: controls.moveUp, moveDown: controls.moveDown, moveLeft: controls.moveLeft, moveRight: controls.moveRight, primaryAction: controls.primaryAction, secondaryAction: controls.secondaryAction, pointer: controls.pointer },
          dt,
          ts
        );
        if (events.laneChange) audioEngine.playSfx("skid");
        if (events.nitroActivated) audioEngine.playSfx("powerup");
        if (events.obstacleSmashed) audioEngine.playSfx("coin");
        if (events.lapComplete) audioEngine.playSfx("clear");
        audioEngine.setEngineRate(0.7 + (state.speed / MAX_SPEED) * 0.9);
        if (events.score !== undefined) onScoreUpdate(events.score);
        if (events.crashed) audioEngine.playSfx("hit");
        // Draw this final frame (showing the "Finished"/"DNF" banner from
        // render.ts) before handing off to GameShell's own game-over
        // overlay, rather than cutting straight to it.
        draw(ctx!, state, ts, width, height);
        if (events.gameOver !== undefined) {
          onGameOver(events.gameOver);
        }
        return;
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
        className="block touch-none"
        role="img"
        aria-label="Turbo Dash racing game"
      />
      {!difficulty && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-night/70 p-6 text-center">
          <p className="font-display font-extrabold text-2xl text-sun">Pick your difficulty</p>
          <p className="text-cloud/70 max-w-xs">Race 3 laps against Red Comet, Blue Blaze, and Gold Rush!</p>
          <div className="flex gap-3">
            {DIFFICULTY_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setDifficulty(opt.id)}
                className="flex flex-col items-center rounded-cabinet border-4 border-violet-2 bg-violet/80 px-5 py-3 font-display font-extrabold hover:bg-violet-2 transition-colors"
              >
                <span>{opt.label}</span>
                <span className="text-xs font-bold text-cloud/70">{opt.blurb}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
