import { useEffect, useRef, useState } from "react";
import { controls } from "../../lib/input";
import { engine as audioEngine } from "../../lib/audio";
import * as racingEngine from "./engine";
import { MAX_SPEED, getPlayerPosition, type Difficulty, type RacingState } from "./engine";
import { draw, drawStartLights, onCrash, onNitro, resetEffects, type StartLightPhase } from "./render";
import type { GameComponentProps } from "../engineTypes";

const DIFFICULTY_OPTIONS: { id: Difficulty; label: string; blurb: string }[] = [
  { id: "easy", label: "Easy", blurb: "Cruisin'" },
  { id: "medium", label: "Medium", blurb: "Balanced" },
  { id: "hard", label: "Hard", blurb: "Full send" },
];

// Race phases, in order: pick a difficulty -> a presentational start-light
// countdown (no engine.step() calls yet, purely useState + timers) -> the
// actual race. Kept separate from GameShell's own "ready"/"playing" phase
// machine, which has no concept of a pre-race grid sequence.
type RacePhase = "picking" | "countdown" | "racing";

// Timing for the start-light sequence, in ms from the moment the countdown
// begins. Each entry pairs a light-rig state with the sfx/announcer cue for
// that instant — see the effect below that walks through this list.
const COUNTDOWN_STEPS: { atMs: number; lights: StartLightPhase; sfx?: "countdown" | "boost"; announce?: "set" | "three" | "two" | "one" | "go" }[] = [
  { atMs: 0, lights: { litCount: 0, go: false }, announce: "set" },
  { atMs: 700, lights: { litCount: 1, go: false }, sfx: "countdown", announce: "three" },
  { atMs: 1400, lights: { litCount: 2, go: false }, sfx: "countdown", announce: "two" },
  { atMs: 2100, lights: { litCount: 3, go: false }, sfx: "countdown", announce: "one" },
  { atMs: 2800, lights: { litCount: 3, go: true }, sfx: "boost", announce: "go" },
];
const COUNTDOWN_TOTAL_MS = 3300;

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
  const [phase, setPhase] = useState<RacePhase>("picking");
  // Read every frame by the rAF loop's draw call while phase === "countdown";
  // updated by the timer effect below. A ref (not state) since it changes on
  // a fixed schedule that has nothing to do with React's render cycle.
  const startLightsRef = useRef<StartLightPhase>({ litCount: 0, go: false });

  useEffect(() => {
    if (!difficulty) return;
    stateRef.current = racingEngine.createState(width, height, difficulty);
    resetEffects();
  }, [width, height, difficulty]);

  // Drives the pre-race start-light sequence once a difficulty is picked.
  // Purely presentational — no engine.step() call happens until phase flips
  // to "racing", so this can't affect gameplay fairness/timing.
  useEffect(() => {
    if (phase !== "countdown") return undefined;
    startLightsRef.current = { litCount: 0, go: false };
    const timers = COUNTDOWN_STEPS.map((step) =>
      setTimeout(() => {
        startLightsRef.current = step.lights;
        if (step.sfx) audioEngine.playSfx(step.sfx);
        if (step.announce) audioEngine.playAnnouncer(step.announce);
      }, step.atMs)
    );
    const finish = setTimeout(() => setPhase("racing"), COUNTDOWN_TOTAL_MS);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(finish);
    };
  }, [phase]);

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

      // Countdown phase: hold on the grid, showing the light rig, without
      // ever calling engine.step() — the race genuinely hasn't started yet.
      if (phase === "countdown") {
        draw(ctx!, state, ts, width, height);
        drawStartLights(ctx!, width, height, startLightsRef.current);
        return;
      }

      const dt = lastTsRef.current ? ts - lastTsRef.current : 16.7;
      lastTsRef.current = ts;

      if (!paused) {
        const events = racingEngine.step(
          state,
          { moveUp: controls.moveUp, moveDown: controls.moveDown, moveLeft: controls.moveLeft, moveRight: controls.moveRight, primaryAction: controls.primaryAction, secondaryAction: controls.secondaryAction, pointer: controls.pointer },
          dt,
          ts
        );
        // Player car's fixed screen position — mirrors engine.ts's own
        // inline `carY = height * 0.78` (used there for collision, here just
        // to anchor the crash/nitro particle bursts at the car itself).
        const carScreenY = height * 0.78;
        if (events.laneChange) audioEngine.playSfx("skid");
        if (events.nitroActivated) {
          audioEngine.playSfx("boost");
          onNitro(state.x, carScreenY);
        }
        if (events.obstacleSmashed) audioEngine.playSfx("coin");
        if (events.lapComplete) audioEngine.playSfx("clear");
        audioEngine.setEngineRate(0.7 + (state.speed / MAX_SPEED) * 0.9);
        if (events.score !== undefined) onScoreUpdate(events.score);
        if (events.crashed) {
          audioEngine.playSfx("crash");
          onCrash(state.x, carScreenY);
        }
        if (events.raceFinished) {
          audioEngine.playSfx("fanfare");
          // "youWin" for a 1st-place finish; other podium/finishing spots
          // still get the fanfare stinger but no extra voice line — there's
          // no "tie" in a lap race with a strict finishing order, so that
          // announcer name (offered for shared moments in other games) has
          // no natural use here. GameShell's own recordScore-driven
          // highscore/gameover sfx+announcer still fire on top of this via
          // onGameOver below, exactly as for every other game.
          if (getPlayerPosition(state) === 1) audioEngine.playAnnouncer("youWin");
        }
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
  }, [width, height, paused, onScoreUpdate, onGameOver, difficulty, phase]);

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
      {phase === "picking" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-night/70 p-6 text-center">
          <p className="font-display font-extrabold text-2xl text-sun">Pick your difficulty</p>
          <p className="text-cloud/70 max-w-xs">Race 3 laps against Red Comet, Blue Blaze, and Gold Rush!</p>
          <div className="flex gap-3">
            {DIFFICULTY_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setDifficulty(opt.id);
                  setPhase("countdown");
                }}
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
