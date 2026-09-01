import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { controls } from "../../lib/input";
import { engine } from "../../lib/audio";
import * as mazeEngine from "./engine";
import type { MazeState } from "./engine";
import { draw, onGhostEaten, onPlayerCaught, onWaveClear, resetEffects } from "./render";
import type { GameComponentProps } from "../engineTypes";

// The only React/canvas/DOM-touching file for this game — owns the canvas
// element, reads the shared `controls` object once per frame, translates
// pointer events to canvas-relative coordinates, and wires engine.step()
// + render.draw() together inside the rAF loop.
export default function MunchMaze({ width, height, paused, onScoreUpdate, onGameOver }: GameComponentProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<MazeState | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    stateRef.current = mazeEngine.createState(width, height);
    resetEffects();
  }, [width, height]);

  const handlePointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const state = stateRef.current;
    if (!canvas || !state) return;
    const rect = canvas.getBoundingClientRect();
    mazeEngine.onPointer(state, { x: e.clientX - rect.left, y: e.clientY - rect.top, kind: "down" });
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
        // Snapshotted before step() mutates state, so the trigger calls below
        // can report *where* a cosmetic event happened even though step()
        // only reports *that* it happened (see MazeEvents in engine.ts).
        const prevPlayerR = state.player.r;
        const prevPlayerC = state.player.c;
        const prevGhosts = state.ghosts.map((g) => ({ r: g.r, c: g.c, startR: g.startR, startC: g.startC }));

        const events = mazeEngine.step(
          state,
          { moveUp: controls.moveUp, moveDown: controls.moveDown, moveLeft: controls.moveLeft, moveRight: controls.moveRight, primaryAction: controls.primaryAction, secondaryAction: controls.secondaryAction, pointer: controls.pointer },
          16.7,
          ts
        );
        if (events.score !== undefined) onScoreUpdate(events.score);
        if (events.ateDot) engine.playSfx("move");
        else if (events.atePower) engine.playSfx("powerup");
        else if (events.wonWave) engine.playSfx("clear");
        else if (events.ateGhost) engine.playSfx("shoot");
        else if (events.ateFruit) engine.playSfx("coin");
        else if (events.ateSpeedPellet) engine.playSfx("boost");
        if (events.hitGhost) engine.playSfx("hit");
        if (events.gameOver !== undefined) onGameOver(events.gameOver);

        if (events.ateGhost) {
          // Find the ghost that was sitting on the player's previous cell
          // (the collision point — an eat can only happen there) and has
          // since moved away (teleported back to its own start). Matching on
          // "was at the collision point" rather than "has left its own start
          // cell" correctly identifies a ghost eaten before it ever left
          // spawn, which the old heuristic missed and mis-attributed to the
          // player's own tile.
          const justRespawned = prevGhosts.find(
            (pg, i) => pg.r === prevPlayerR && pg.c === prevPlayerC && (state.ghosts[i].r !== pg.r || state.ghosts[i].c !== pg.c)
          );
          const startR = justRespawned?.startR ?? prevPlayerR;
          const startC = justRespawned?.startC ?? prevPlayerC;
          onGhostEaten(prevPlayerR, prevPlayerC, startR, startC);
        }
        if (events.hitGhost) onPlayerCaught(prevPlayerR, prevPlayerC);
        if (events.wonWave) onWaveClear(ts);
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
      aria-label="Munch Maze pac-man style game"
    />
  );
}
