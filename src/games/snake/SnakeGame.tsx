import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { controls } from "../../lib/input";
import { engine } from "../../lib/audio";
import * as snakeEngine from "./engine";
import type { SnakeState } from "./engine";
import { draw } from "./render";
import type { GameComponentProps } from "../engineTypes";

// The only React/canvas/DOM-touching file for this game — owns the canvas
// element, reads the shared `controls` object once per frame, translates
// pointer events to canvas-relative coordinates, and wires engine.step()
// + render.draw() together inside the rAF loop.
export default function SnakeGame({ width, height, paused, onScoreUpdate, onGameOver }: GameComponentProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<SnakeState | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    stateRef.current = snakeEngine.createState(width);
  }, [width]);

  const handlePointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const state = stateRef.current;
    if (!canvas || !state) return;
    const rect = canvas.getBoundingClientRect();
    snakeEngine.onPointer(state, { x: e.clientX - rect.left, y: e.clientY - rect.top, kind: "down" });
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return undefined;

    function tick(ts: number) {
      rafRef.current = requestAnimationFrame(tick);
      const state = stateRef.current;
      if (!state) return;

      if (!paused) {
        const events = snakeEngine.step(
          state,
          { moveUp: controls.moveUp, moveDown: controls.moveDown, moveLeft: controls.moveLeft, moveRight: controls.moveRight, primaryAction: controls.primaryAction, secondaryAction: controls.secondaryAction, pointer: controls.pointer },
          16.7,
          ts
        );
        if (events.score !== undefined) {
          onScoreUpdate(events.score);
          engine.playSfx("coin");
        }
        if (events.gameOver !== undefined) {
          engine.playSfx("hit");
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
  }, [width, height, paused, onScoreUpdate, onGameOver]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      onPointerDown={handlePointerDown}
      className="block touch-none"
      role="img"
      aria-label="Wiggle Worm snake game"
    />
  );
}
