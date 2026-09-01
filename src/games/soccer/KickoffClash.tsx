import { useEffect, useRef, useState } from "react";
import { controls } from "../../lib/input";
import { engine } from "../../lib/audio";
import * as soccerEngine from "./engine";
import type { Difficulty, SoccerState } from "./engine";
import { draw } from "./render";
import type { GameComponentProps } from "../engineTypes";

const DIFFICULTY_OPTIONS: { id: Difficulty; label: string; blurb: string }[] = [
  { id: "easy", label: "Easy", blurb: "Slower defenders, weaker shots" },
  { id: "medium", label: "Medium", blurb: "A fair match" },
  { id: "hard", label: "Hard", blurb: "Sharp defenders, hard shots" },
];

// Session-only "remember last difficulty" — pre-selects (doesn't lock) the
// difficulty option next time the setup screen appears. Deliberately a
// module-level variable, not storage.ts state — resets on a full page
// reload, which is fine, this is just a convenience default.
let lastDifficulty: Difficulty = "medium";

// The only React/canvas/DOM-touching file for this game — owns the canvas
// element, reads the shared `controls` object once per frame, and wires
// engine.step() + render.draw() together inside the rAF loop. Also owns a
// small pre-match difficulty setup screen (GameShell's generic "ready"
// overlay doesn't know about difficulty tiers) — see the `difficulty` state
// below, same idiom as RumbleRing.tsx's fighter-select screen.
export default function KickoffClash({ width, height, paused, onScoreUpdate, onGameOver }: GameComponentProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<SoccerState | null>(null);
  const rafRef = useRef<number>(0);
  const lastTsRef = useRef<number>(0);

  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [pendingDifficulty, setPendingDifficulty] = useState<Difficulty>(lastDifficulty);

  useEffect(() => {
    if (!difficulty) return;
    stateRef.current = soccerEngine.createState(width, height, difficulty);
  }, [width, height, difficulty]);

  useEffect(() => {
    if (!difficulty) return undefined;
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
        if (events.skillMove) {
          engine.playSfx("powerup");
        }
        if (events.playerGoal) {
          engine.playSfx("coin");
        }
        if (events.cpuGoal) {
          engine.playSfx("hit");
        }
        if (events.halftimeStarted) {
          engine.playSfx("clear");
        }
        if (events.secondHalfStarted) {
          engine.playSfx("start");
        }
        if (events.shootoutStarted) {
          engine.playSfx("powerup");
        }
        if (events.shootoutAttemptResolved === "goal") {
          engine.playSfx("coin");
        } else if (events.shootoutAttemptResolved === "save" || events.shootoutAttemptResolved === "miss") {
          engine.playSfx("hit");
        }
        if (events.score !== undefined) {
          onScoreUpdate(events.score);
        }
        if (events.finalWhistle) {
          engine.playSfx(events.won ? "clear" : "gameover");
        }
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
        className="block touch-none"
        role="img"
        aria-label="Kickoff Clash 2D soccer game"
      />
      {!difficulty && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-night/70 p-5 text-center overflow-y-auto">
          <p className="font-display font-extrabold text-2xl text-sun">Pick difficulty</p>
          <p className="text-cloud/70 max-w-xs text-sm">
            2v2 — you and a teammate vs two CPU defenders. Two halves, then penalties if it's tied.
          </p>
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
            Kickoff!
          </button>
        </div>
      )}
    </div>
  );
}
