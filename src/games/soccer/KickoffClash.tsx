import { useEffect, useRef, useState } from "react";
import { controls } from "../../lib/input";
import { engine } from "../../lib/audio";
import * as soccerEngine from "./engine";
import type { Difficulty, SoccerState } from "./engine";
import { draw, onGoal, onKick, onWhistle, resetEffects, setCountdown } from "./render";
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

// The kickoff countdown sequence: label shown, sfx, announcer line, and how
// long (ms) it holds before advancing to the next stage. Purely
// presentational — see render.ts's setCountdown()/onWhistle() — the engine
// never sees this; the rAF loop below just skips calling step() while it's
// running.
const COUNTDOWN_STEPS: { label: string; announce: "three" | "two" | "one" | "go"; holdMs: number }[] = [
  { label: "3", announce: "three", holdMs: 700 },
  { label: "2", announce: "two", holdMs: 700 },
  { label: "1", announce: "one", holdMs: 700 },
  { label: "GO!", announce: "go", holdMs: 700 },
];

// Seconds-remaining threshold for the "hurry up" announcer line near the end
// of a half — fires once per half, not every frame it's true.
const HURRY_UP_THRESHOLD_MS = 8000;

// The only React/canvas/DOM-touching file for this game — owns the canvas
// element, reads the shared `controls` object once per frame, and wires
// engine.step() + render.draw() together inside the rAF loop. Also owns a
// small pre-match difficulty setup screen (GameShell's generic "ready"
// overlay doesn't know about difficulty tiers) and the presentational
// kickoff countdown that runs right after it — same idiom as
// RumbleRing.tsx's fighter-select screen.
export default function KickoffClash({ width, height, paused, onScoreUpdate, onGameOver }: GameComponentProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<SoccerState | null>(null);
  const rafRef = useRef<number>(0);
  const lastTsRef = useRef<number>(0);
  const countdownGateRef = useRef(false); // true while the pre-kickoff countdown is running — gates step()
  const hurryUpPlayedRef = useRef(false);
  const prevShootoutStageRef = useRef<"aiming" | "resolving" | null>(null);

  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [pendingDifficulty, setPendingDifficulty] = useState<Difficulty>(lastDifficulty);

  useEffect(() => {
    if (!difficulty) return;
    resetEffects();
    stateRef.current = soccerEngine.createState(width, height, difficulty);
  }, [width, height, difficulty]);

  // Runs the presentational "3…2…1…GO!" sequence once a difficulty has been
  // picked, gating countdownGateRef so the rAF loop below skips step() calls
  // until it finishes, then blows the kickoff whistle.
  useEffect(() => {
    if (!difficulty) return undefined;
    countdownGateRef.current = true;
    hurryUpPlayedRef.current = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let elapsed = 0;
    for (const stepInfo of COUNTDOWN_STEPS) {
      timers.push(
        setTimeout(() => {
          setCountdown(stepInfo.label, performance.now());
          engine.playSfx("countdown");
          engine.playAnnouncer(stepInfo.announce);
        }, elapsed)
      );
      elapsed += stepInfo.holdMs;
    }
    timers.push(
      setTimeout(() => {
        setCountdown(null, performance.now());
        onWhistle(performance.now());
        engine.playSfx("whistle");
        countdownGateRef.current = false;
      }, elapsed)
    );
    return () => timers.forEach(clearTimeout);
  }, [difficulty]);

  useEffect(() => {
    if (!difficulty) return undefined;
    engine.startCrowd();
    return () => engine.stopCrowd();
  }, [difficulty]);

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

      if (!paused && !countdownGateRef.current) {
        // Detect a shootout attempt committing (aiming -> resolving) so a
        // penalty kick gets the same "kick" sfx + turf-dust cue as open play,
        // even though the engine doesn't emit a shotFired event during the
        // shootout phase.
        const events = soccerEngine.step(
          state,
          { moveUp: controls.moveUp, moveDown: controls.moveDown, moveLeft: controls.moveLeft, moveRight: controls.moveRight, primaryAction: controls.primaryAction, secondaryAction: controls.secondaryAction, pointer: controls.pointer },
          dt,
          ts
        );

        if (state.shootout && prevShootoutStageRef.current === "aiming" && state.shootout.stage === "resolving") {
          onKick(state.shootout.ballX, state.shootout.ballY, ts);
          engine.playSfx("kick");
        }
        prevShootoutStageRef.current = state.shootout?.stage ?? null;


        if (events.shotFired) {
          onKick(state.player.x, state.player.y, ts);
          engine.playSfx("kick");
        }
        if (events.skillMove) {
          engine.playSfx("powerup");
        }
        if (events.playerGoal) {
          onGoal(true, ts);
          engine.playSfx("goalHorn");
          engine.playSfx("net");
          engine.cheer(1, 1600);
        }
        if (events.cpuGoal) {
          onGoal(false, ts);
          engine.playSfx("net");
        }
        if (events.halftimeStarted) {
          onWhistle(ts);
          engine.playSfx("whistle");
        }
        if (events.secondHalfStarted) {
          onWhistle(ts);
          engine.playSfx("whistle");
          engine.playAnnouncer("finalRound");
          hurryUpPlayedRef.current = false;
        }
        if (events.shootoutStarted) {
          onWhistle(ts);
          engine.playSfx("whistle");
          engine.setCrowdLevel(0.55);
        }
        if (events.shootoutAttemptResolved === "goal") {
          engine.playSfx("net");
          engine.cheer(0.6, 900);
        } else if (events.shootoutAttemptResolved === "save" || events.shootoutAttemptResolved === "miss") {
          engine.playSfx("hit");
        }
        if (events.shootoutAttemptResolved && state.shootout?.suddenDeath) {
          engine.setCrowdLevel(0.85);
        }

        // Late-half urgency line — once per half, only during regulation play.
        if (
          state.phase === "playing" &&
          !hurryUpPlayedRef.current &&
          state.timeLeft <= HURRY_UP_THRESHOLD_MS &&
          state.timeLeft > 0
        ) {
          hurryUpPlayedRef.current = true;
          engine.playAnnouncer("hurryUp");
        }

        if (events.score !== undefined) {
          onScoreUpdate(events.score);
        }
        if (events.finalWhistle) {
          onWhistle(ts);
          engine.playSfx("whistle");
          if (events.won) {
            engine.playSfx("fanfare");
            engine.playAnnouncer("youWin");
          } else if (state.playerGoals === state.cpuGoals) {
            engine.playAnnouncer("tie");
          } else {
            engine.playSfx("gameover");
            engine.playAnnouncer("timeOver");
          }
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
