import { useEffect, useRef } from "react";
import { controls } from "../../lib/input";
import { engine as audioEngine } from "../../lib/audio";
import * as racingEngine from "./engine";
import { MAX_SPEED, type RacingState } from "./engine";
import { draw } from "./render";
import type { GameComponentProps } from "../engineTypes";

// The only React/canvas/DOM-touching file for this game — owns the canvas
// element, reads the shared `controls` object once per frame, and wires
// engine.step() + render.draw() together inside the rAF loop. No pointer
// interaction for this game.
export default function TurboDash({ width, height, paused, onScoreUpdate, onGameOver }: GameComponentProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<RacingState | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    stateRef.current = racingEngine.createState(width, height);
  }, [width, height]);

  // Looping engine hum: started on mount, stopped on unmount, independent
  // of the rAF-loop effect below (mirrors the original component).
  useEffect(() => {
    audioEngine.playEngineLoop();
    return () => audioEngine.stopEngineLoop();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return undefined;

    function tick(ts: number) {
      rafRef.current = requestAnimationFrame(tick);
      const state = stateRef.current;
      if (!state || state.dead) return;

      if (!paused) {
        const events = racingEngine.step(
          state,
          { up: controls.up, down: controls.down, left: controls.left, right: controls.right, confirm: controls.confirm, cancel: controls.cancel, pointer: controls.pointer },
          16.7,
          ts
        );
        if (events.laneChange) audioEngine.playSfx("skid");
        if (events.nitroActivated) audioEngine.playSfx("powerup");
        if (events.obstacleSmashed) audioEngine.playSfx("coin");
        audioEngine.setEngineRate(0.7 + (state.speed / MAX_SPEED) * 0.9);
        if (events.score !== undefined) onScoreUpdate(events.score);
        if (events.crashed) audioEngine.playSfx("hit");
        if (events.gameOver !== undefined) {
          onGameOver(events.gameOver);
          return;
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
  }, [width, height, paused, onScoreUpdate, onGameOver]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="block touch-none"
      role="img"
      aria-label="Turbo Dash racing game"
    />
  );
}
