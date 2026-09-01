import { useEffect, useRef } from "react";
import { controls } from "../../lib/input";
import { engine } from "../../lib/audio";
import * as fighterEngine from "./engine";
import type { MatchState } from "./engine";
import { draw } from "./render";
import type { GameComponentProps } from "../engineTypes";

// The only React/canvas/DOM-touching file for this game — owns the canvas
// element and wires engine.step() + render.draw() together inside the
// rAF loop. Rumble Ring has no pointer/mouse interaction, so there's no
// onPointer wiring here (unlike Snake).
export default function RumbleRing({ width, height, paused, onScoreUpdate, onGameOver }: GameComponentProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<MatchState | null>(null);
  const rafRef = useRef<number>(0);
  const lastTsRef = useRef<number>(0);

  useEffect(() => {
    stateRef.current = fighterEngine.createState(width, height);
  }, [width, height]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return undefined;

    function tick(ts: number) {
      rafRef.current = requestAnimationFrame(tick);
      const state = stateRef.current;
      if (!state) return;

      const dt = lastTsRef.current ? ts - lastTsRef.current : 16;
      lastTsRef.current = ts;

      if (!paused) {
        const events = fighterEngine.step(
          state,
          { moveUp: controls.moveUp, moveDown: controls.moveDown, moveLeft: controls.moveLeft, moveRight: controls.moveRight, primaryAction: controls.primaryAction, secondaryAction: controls.secondaryAction, pointer: controls.pointer },
          dt,
          ts
        );

        if (events.playerJumped || events.cpuJumped) engine.playSfx("jump");
        if (events.playerAttackStarted || events.cpuAttackStarted) engine.playSfx("move");
        if (events.hitLanded) engine.playSfx("hit");
        else if (events.hitBlocked) engine.playSfx("move");

        if (events.score !== undefined) {
          onScoreUpdate(events.score);
        }
        if (events.gameOver !== undefined) {
          engine.playSfx(events.won ? "clear" : "gameover");
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
      aria-label="Rumble Ring fighting game"
    />
  );
}
