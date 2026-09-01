import { useEffect, useRef } from "react";
import { controls } from "../../lib/input";
import { engine } from "../../lib/audio";
import * as soccerEngine from "./engine";
import type { SoccerState } from "./engine";
import { draw } from "./render";
import type { GameComponentProps } from "../engineTypes";

// The only React/canvas/DOM-touching file for this game — owns the canvas
// element, reads the shared `controls` object once per frame, and wires
// engine.step() + render.draw() together inside the rAF loop. No pointer
// interaction: movement/shooting is entirely up/down/left/right + confirm.
export default function KickoffClash({ width, height, paused, onScoreUpdate, onGameOver }: GameComponentProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<SoccerState | null>(null);
  const rafRef = useRef<number>(0);
  const lastTsRef = useRef<number>(0);

  useEffect(() => {
    stateRef.current = soccerEngine.createState(width, height);
  }, [width, height]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return undefined;

    function tick(ts: number) {
      rafRef.current = requestAnimationFrame(tick);
      const state = stateRef.current;
      if (!state) return;

      const dt = lastTsRef.current ? ts - lastTsRef.current : 16.7;
      lastTsRef.current = ts;

      if (!paused) {
        const events = soccerEngine.step(
          state,
          { moveUp: controls.moveUp, moveDown: controls.moveDown, moveLeft: controls.moveLeft, moveRight: controls.moveRight, primaryAction: controls.primaryAction, secondaryAction: controls.secondaryAction, pointer: controls.pointer },
          dt,
          ts
        );
        if (events.shotFired) {
          engine.playSfx("move");
        }
        if (events.playerGoal) {
          engine.playSfx("coin");
        }
        if (events.cpuGoal) {
          engine.playSfx("hit");
        }
        if (events.score !== undefined) {
          onScoreUpdate(events.score);
        }
        if (events.finalWhistle) {
          engine.playSfx(events.won ? "clear" : "gameover");
        }
        if (events.gameOver !== undefined) {
          onGameOver(events.gameOver);
        }
      }

      draw(ctx!, state, width, height);
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
      aria-label="Kickoff Clash 2D soccer game"
    />
  );
}
