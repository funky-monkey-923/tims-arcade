import { useEffect, useRef, useState } from "react";
import { controls } from "../../lib/input";
import { engine } from "../../lib/audio";
import * as fighterEngine from "./engine";
import { CHARACTERS, type Difficulty, type MatchState } from "./engine";
import { draw, onBlock, onHitLanded, onKo, onComboLanded, resetEffects } from "./render";
import type { GameComponentProps } from "../engineTypes";

const DIFFICULTY_OPTIONS: { id: Difficulty; label: string; blurb: string }[] = [
  { id: "easy", label: "Easy", blurb: "Learning the ropes" },
  { id: "medium", label: "Medium", blurb: "A fair fight" },
  { id: "hard", label: "Hard", blurb: "Bring your A-game" },
];

// How long to hold on the "Round N — Fight!" / match-result banner before
// resuming (or, at matchEnd, before onGameOver is fired) — see the tick()
// loop below. Matches the ~1.5s called for in the design brief.
const ROUND_BANNER_MS = 1500;

// Session-only "ladder" memory: pre-selects (doesn't lock) the difficulty
// option next time the setup screen appears, based on whatever the player
// last played. Deliberately a module-level variable, not storage.ts state —
// resets on a full page reload, which is fine, this is just a convenience
// default, not a persisted setting.
let lastDifficulty: Difficulty = "medium";

interface Setup {
  charId: string;
  difficulty: Difficulty;
}

// The only React/canvas/DOM-touching file for this game — owns the canvas
// element and wires engine.step() + render.draw() together inside the
// rAF loop. Also owns a small pre-fight setup screen (character + difficulty
// pick) that GameShell's generic "ready" overlay doesn't know anything
// about — see the `setup` state below. Rumble Ring has no pointer/mouse
// interaction, so there's no onPointer wiring here (unlike Snake).
export default function RumbleRing({ width, height, paused, onScoreUpdate, onGameOver }: GameComponentProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<MatchState | null>(null);
  const rafRef = useRef<number>(0);
  const lastTsRef = useRef<number>(0);
  // Set once the round-end banner starts showing; cleared once the next
  // round actually starts (or the match ends). Lets the tick loop know to
  // stop calling step() but keep calling draw() during the pause.
  const roundEndAtRef = useRef<number | null>(null);

  const [setup, setSetup] = useState<Setup | null>(null);
  const [pendingChar, setPendingChar] = useState<string>(CHARACTERS[0].id);
  const [pendingDifficulty, setPendingDifficulty] = useState<Difficulty>(lastDifficulty);

  useEffect(() => {
    if (!setup) return;
    stateRef.current = fighterEngine.createState(width, height, setup.charId, setup.difficulty);
    roundEndAtRef.current = null;
    // render.ts's particles/shake/banner timing are module-scope, not part of
    // MatchState — GameShell fully unmounts/remounts between playthroughs,
    // but a fresh setup here can still follow a previous match within the
    // same mount (e.g. picking a new character), so clear explicitly rather
    // than relying on unmount alone.
    resetEffects();
  }, [width, height, setup]);

  // Stadium-style crowd ambience runs for the lifetime of this component —
  // present even on the character-select screen, not just during a round —
  // and is stopped on unmount so it never bleeds into the arcade menu.
  useEffect(() => {
    engine.startCrowd();
    return () => engine.stopCrowd();
  }, []);

  useEffect(() => {
    if (!setup) return undefined;
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
        if (state.phase === "fighting") {
          const events = fighterEngine.step(
            state,
            { moveUp: controls.moveUp, moveDown: controls.moveDown, moveLeft: controls.moveLeft, moveRight: controls.moveRight, primaryAction: controls.primaryAction, secondaryAction: controls.secondaryAction, pointer: controls.pointer },
            dt,
            ts
          );

          if (events.playerJumped || events.cpuJumped) engine.playSfx("jump");
          if (events.playerAttackStarted === "super" || events.cpuAttackStarted === "super") {
            engine.playSfx("powerup");
          } else if (events.playerAttackStarted === "throw" || events.cpuAttackStarted === "throw") {
            // A grab-and-heave reads better as an ascending swell than the
            // generic "move" blip both punch/kick windup and blocked hits
            // used to share — see the file-level SFX notes below.
            engine.playSfx("boost");
          } else if (events.playerAttackStarted || events.cpuAttackStarted) {
            // Punch/kick windup: a quick whoosh, distinct from both the
            // throw's heavier swell above and the "hit"/"net" impact sounds
            // below.
            engine.playSfx("skid");
          }
          if (events.hitLanded) {
            engine.playSfx("hit");
            // Position is approximate — the midpoint between the two
            // fighters at roughly torso height — since these hooks are
            // purely decorative (particles/shake), not gameplay.
            const hx = (state.player.x + state.cpu.x) / 2;
            const hy = state.ground - height * 0.12;
            const heavy = state.player.state === "super" || state.cpu.state === "super";
            onHitLanded(hx, hy, heavy);
            engine.cheer(heavy ? 1 : 0.55, heavy ? 1600 : 700);
            // A landed 2-hit combo gets an extra bright "ding" (reusing the
            // existing coin SFX rather than adding a new sample) plus a
            // bigger spark burst — see onComboLanded in render.ts.
            if (events.comboLanded) {
              engine.playSfx("coin");
              onComboLanded(hx, hy);
            }
          } else if (events.hitBlocked) {
            // A softer, lighter parry sound — clearly distinguishable from
            // "hit" landing unblocked, unlike the old shared "move" blip.
            engine.playSfx("net");
            const hx = (state.player.x + state.cpu.x) / 2;
            const hy = state.ground - height * 0.12;
            onBlock(hx, hy);
          }

          // Tension rises as the round clock runs low or either fighter's
          // health gets critical — a rising crowd murmur under the fight
          // music, settling back once neither condition holds.
          const timeTension = state.timeLeft < 10000 ? 1 - state.timeLeft / 10000 : 0;
          const lowestHealth = Math.min(state.player.health, state.cpu.health);
          const healthTension = lowestHealth <= 30 ? 1 - lowestHealth / 30 : 0;
          engine.setCrowdLevel(0.15 + Math.max(timeTension, healthTension) * 0.6);

          if (events.score !== undefined) {
            onScoreUpdate(events.score);
          }

          // Draw this frame (showing the round-end/match-end banner from
          // render.ts, if the round/match just ended) before handling the
          // round-transition bookkeeping or handing off to GameShell.
          draw(ctx!, state, ts, width, height);

          // events.gameOver undefined here means the round ended but the
          // match didn't (matchEnd always sets gameOver) — i.e. phase is
          // now "roundEnd". Checked via the event rather than re-reading
          // state.phase because TS narrows state.phase to "fighting" from
          // the `if` above and can't see that step() just mutated it.
          if (events.roundOver && events.gameOver === undefined && roundEndAtRef.current === null) {
            roundEndAtRef.current = ts;
            const isKo = state.player.health <= 0 || state.cpu.health <= 0;
            if (isKo) {
              const loser = state.player.health <= 0 ? state.player : state.cpu;
              onKo(loser.x, state.ground - height * 0.14);
              engine.playSfx("fanfare");
              engine.cheer(1, 1800);
            }
            engine.playSfx("clear");
          }
          if (events.gameOver !== undefined) {
            lastDifficulty = state.difficulty;
            const isKo = state.player.health <= 0 || state.cpu.health <= 0;
            if (isKo) {
              const loser = state.player.health <= 0 ? state.player : state.cpu;
              onKo(loser.x, state.ground - height * 0.14);
            }
            engine.playSfx(events.won ? "clear" : "gameover");
            onGameOver(events.gameOver);
          }
          return;
        }

        if (state.phase === "roundEnd") {
          if (roundEndAtRef.current !== null && ts - roundEndAtRef.current >= ROUND_BANNER_MS) {
            fighterEngine.startNextRound(state);
            roundEndAtRef.current = null;
            engine.playSfx("start");
          }
          draw(ctx!, state, ts, width, height);
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
  }, [width, height, paused, onScoreUpdate, onGameOver, setup]);

  return (
    <div className="relative" style={{ width, height }}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="block touch-none"
        role="img"
        aria-label="Rumble Ring fighting game"
      />
      {!setup && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-night/70 p-5 text-center overflow-y-auto">
          <p className="font-display font-extrabold text-2xl text-sun">Choose your fighter</p>
          <div className="flex flex-wrap justify-center gap-3">
            {CHARACTERS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setPendingChar(c.id)}
                className={`flex flex-col items-center gap-1 rounded-cabinet border-4 px-4 py-3 font-display font-extrabold transition-colors ${
                  pendingChar === c.id ? "border-coral bg-violet-2" : "border-violet-2 bg-violet/80 hover:bg-violet-2"
                }`}
              >
                <span className="inline-block h-3 w-3 rounded-full" style={{ background: c.color }} aria-hidden="true" />
                <span>{c.name}</span>
                <span className="max-w-[9rem] text-xs font-bold text-cloud/70">{c.blurb}</span>
              </button>
            ))}
          </div>

          <p className="font-display font-extrabold text-lg text-teal mt-2">Pick difficulty</p>
          <div className="flex gap-3">
            {DIFFICULTY_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setPendingDifficulty(opt.id)}
                className={`flex flex-col items-center rounded-cabinet border-4 px-4 py-2 font-display font-extrabold transition-colors ${
                  pendingDifficulty === opt.id ? "border-coral bg-violet-2" : "border-violet-2 bg-violet/80 hover:bg-violet-2"
                }`}
              >
                <span>{opt.label}</span>
                <span className="text-xs font-bold text-cloud/70">{opt.blurb}</span>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setSetup({ charId: pendingChar, difficulty: pendingDifficulty })}
            className="rounded-full bg-coral px-8 py-3 font-display font-extrabold text-ink hover:bg-coral-2 transition-colors mt-2"
          >
            Fight!
          </button>
        </div>
      )}
    </div>
  );
}
