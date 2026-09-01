import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { controls } from "../../lib/input";
import { engine } from "../../lib/audio";
import * as snakeEngine from "./engine";
import type { SnakeState } from "./engine";
import { draw, onEat, onDeath, onWaveChange, resetEffects } from "./render";
import type { GameComponentProps } from "../engineTypes";

// The only React/canvas/DOM-touching file for this game — owns the canvas
// element, reads the shared `controls` object once per frame, translates
// pointer events to canvas-relative coordinates, and wires engine.step()
// + render.draw() together inside the rAF loop.
export default function SnakeGame({ width, height, paused, onScoreUpdate, onGameOver }: GameComponentProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<SnakeState | null>(null);
  const rafRef = useRef<number>(0);
  // Tracks whether a pointer is currently held down on the canvas, so drag
  // ("move") samples only turn the snake while actively dragging rather than
  // on every incidental pointer move over the element.
  const isDraggingRef = useRef(false);
  // Tracks the last wave seen so a wave-change banner/sfx fires exactly once
  // per transition, not once per frame it happens to still be the new wave.
  const prevWaveRef = useRef(1);

  useEffect(() => {
    stateRef.current = snakeEngine.createState(width);
    prevWaveRef.current = 1;
    // GameShell fully unmounts/remounts this component between playthroughs,
    // but render.ts's particles/shake/banner state lives at module scope and
    // would otherwise leak from the previous run into this fresh one.
    resetEffects();
  }, [width]);

  const handlePointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const state = stateRef.current;
    if (!canvas || !state) return;
    isDraggingRef.current = true;
    const rect = canvas.getBoundingClientRect();
    snakeEngine.onPointer(state, { x: e.clientX - rect.left, y: e.clientY - rect.top, kind: "down" });
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!isDraggingRef.current) return;
    const canvas = canvasRef.current;
    const state = stateRef.current;
    if (!canvas || !state) return;
    const rect = canvas.getBoundingClientRect();
    snakeEngine.onPointer(state, { x: e.clientX - rect.left, y: e.clientY - rect.top, kind: "move" });
  };

  const endDrag = () => {
    isDraggingRef.current = false;
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
        // Captured before step() mutates state: if this tick eats food,
        // state.food is respawned in-place, so the kind/position of what was
        // actually eaten has to be read beforehand.
        const cell = width / snakeEngine.GRID;
        const eatenKind = state.food.kind;
        const eatenX = (state.food.x + 0.5) * cell;
        const eatenY = (state.food.y + 0.5) * cell;

        const events = snakeEngine.step(
          state,
          { moveUp: controls.moveUp, moveDown: controls.moveDown, moveLeft: controls.moveLeft, moveRight: controls.moveRight, primaryAction: controls.primaryAction, secondaryAction: controls.secondaryAction, pointer: controls.pointer },
          16.7,
          ts
        );
        if (events.score !== undefined) {
          onScoreUpdate(events.score);
          onEat(eatenX, eatenY, eatenKind, ts);
          if (eatenKind === "golden") engine.playSfx("powerup");
          else if (eatenKind === "shrink") engine.playSfx("back");
          else engine.playSfx("coin");
        }
        if (state.wave !== prevWaveRef.current) {
          prevWaveRef.current = state.wave;
          onWaveChange(state.wave, ts);
          engine.playSfx("clear");
        }
        if (events.gameOver !== undefined) {
          const headX = (state.snake[0].x + 0.5) * cell;
          const headY = (state.snake[0].y + 0.5) * cell;
          onDeath(headX, headY, ts);
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
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={endDrag}
      className="block touch-none"
      role="img"
      aria-label="Wiggle Worm snake game"
    />
  );
}
