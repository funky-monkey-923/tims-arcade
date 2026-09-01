import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { controls } from "../../lib/input";
import { engine } from "../../lib/audio";
import * as invadersEngine from "./engine";
import type { StarDefenderState } from "./engine";
import { draw } from "./render";
import type { GameComponentProps } from "../engineTypes";

// The only React/canvas/DOM-touching file for this game — owns the canvas
// element, reads the shared `controls` object once per frame, translates
// pointer events to canvas-relative coordinates, and wires engine.step()
// + render.draw() together inside the rAF loop.
export default function StarDefender({ width, height, paused, onScoreUpdate, onGameOver }: GameComponentProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<StarDefenderState | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    stateRef.current = invadersEngine.createState(width, height);
  }, [width, height]);

  const handlePointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const state = stateRef.current;
    if (!canvas || !state) return;
    const rect = canvas.getBoundingClientRect();
    invadersEngine.onPointer(state, { x: e.clientX - rect.left, y: e.clientY - rect.top, kind: "move" });
  };

  useEffect(() => {
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
        if (events.gameOver !== undefined) onGameOver(events.gameOver);
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
      onPointerMove={handlePointerMove}
      className="block touch-none"
      role="img"
      aria-label="Star Defender space shooter game"
    />
  );
}
