import { Component, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { useArcade } from "../context/ArcadeContext";
import { engine } from "../lib/audio";
import { subscribeMenuInput } from "../lib/input";
import TouchControls from "../components/TouchControls";
import type { GameId, GameStats } from "../lib/storage";
import type { GameComponentProps } from "./engineTypes";

type Phase = "ready" | "playing" | "paused" | "gameover";

interface GameErrorBoundaryProps {
  children: ReactNode;
  onCrash: () => void;
}
interface GameErrorBoundaryState {
  crashed: boolean;
}

// Every game is a hand-rolled canvas engine — if one throws (a bug in a
// single game shouldn't be able to happen, but this is cheap insurance),
// this stops it from white-screening the whole arcade for a kid. Falls back
// to a friendly "this game had a hiccup" card with a way back to the menu.
class GameErrorBoundary extends Component<GameErrorBoundaryProps, GameErrorBoundaryState> {
  state: GameErrorBoundaryState = { crashed: false };

  static getDerivedStateFromError(): GameErrorBoundaryState {
    return { crashed: true };
  }

  componentDidCatch(error: unknown): void {
    console.error("Game crashed:", error);
    this.props.onCrash();
  }

  render() {
    if (this.state.crashed) {
      return (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-night/90 p-6 text-center">
          <p className="font-display font-extrabold text-2xl text-coral">Oops, this game hiccuped!</p>
          <p className="text-cloud/70 max-w-xs">No worries — your scores are safe. Head back and try again.</p>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("arcade:exit-game"))}
            className="rounded-full bg-coral px-8 py-3 font-display font-extrabold text-ink hover:bg-coral-2 transition-colors mt-2"
          >
            ← Back to Arcade
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

interface TouchOptions {
  showDpad?: boolean;
  showPrimary?: boolean;
  showSecondary?: boolean;
}

interface GameShellProps {
  gameId: GameId;
  title: string;
  subtitle: string;
  instructions: string;
  GameComponent: ComponentType<GameComponentProps>;
  touchOptions?: TouchOptions;
}

// Common chrome around every game: responsive canvas stage, pause overlay,
// game-over overlay with score + leaderboard stats, and wiring into the
// audio engine + score storage. Individual games just render their own
// canvas/logic and call the callbacks passed to them via GameComponentProps.
export default function GameShell({
  gameId,
  title,
  subtitle,
  instructions,
  GameComponent,
  touchOptions = { showDpad: true, showPrimary: false },
}: GameShellProps) {
  const { recordScore, activeProfile } = useArcade();
  const [phase, setPhase] = useState<Phase>("ready");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState<GameStats | null>(null);
  const stageRef = useRef<HTMLElement | null>(null);
  const [stageSize, setStageSize] = useState({ w: 480, h: 480 });
  // Mirrors `phase` for the ResizeObserver callback below, so the observer
  // (subscribed once) can read the latest phase without needing to be torn
  // down and resubscribed on every phase change.
  const phaseRef = useRef<Phase>(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    engine.startMusic("action");
    return () => engine.stopMusic();
  }, []);

  // Games only ever see the width/height they were created with in
  // createState(width, height) — engineTypes.ts doesn't define a contract for
  // handling a live resize mid-run, so letting the stage change size while
  // "playing"/"paused" risks visual corruption or lost state in any game
  // that doesn't defensively handle it. Freeze the stage at whatever size it
  // was when the round started; only "ready" and "gameover" can resize it
  // (e.g. rotating a tablet between rounds is safe, rotating mid-race isn't).
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver((entries) => {
      if (phaseRef.current === "playing" || phaseRef.current === "paused") return;
      const { width, height } = entries[0].contentRect;
      const size = Math.max(200, Math.floor(Math.min(width, height)));
      setStageSize({ w: size, h: size });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(
    () =>
      subscribeMenuInput((action) => {
        if (action === "PAUSE") {
          setPhase((p) => (p === "playing" ? "paused" : p === "paused" ? "playing" : p));
        }
      }),
    []
  );

  // Music shouldn't keep playing while gameplay is frozen — pause it going
  // into "paused" and pick back up on resume, mirroring what a kid expects
  // when they hit pause.
  useEffect(() => {
    if (phase === "paused") engine.stopMusic();
    else if (phase === "playing") engine.startMusic("action");
  }, [phase]);

  const handleGameOver = (finalScore: number) => {
    setScore(finalScore);
    setPhase("gameover");
    engine.stopMusic();
    // recordScore computes + persists the next state AND returns fresh
    // GameStats in one synchronous call — deliberately not a separate
    // recordScore() + statsFor() pair, since statsFor() would still read the
    // pre-write snapshot (React state updates aren't visible until the next
    // render). See ArcadeContext.tsx's recordScore for the full explanation.
    const stats = recordScore(gameId, finalScore);
    setBest(stats);
    const isNewTop = !!activeProfile && stats.overallBest?.profileId === activeProfile.id && stats.overallBest.value === finalScore;
    if (isNewTop) {
      engine.playSfx("highscore");
      engine.playAnnouncer("highscore");
    } else {
      engine.playSfx("gameover");
      engine.playAnnouncer("gameover");
    }
  };

  const handleScoreUpdate = (s: number) => setScore(s);

  const start = () => {
    engine.unlock();
    engine.playSfx("start");
    engine.playAnnouncer("ready");
    setScore(0);
    setPhase("playing"); // the phase effect above starts "action" music on this transition
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("arcade:exit-game"))}
          className="font-display font-bold text-sm sm:text-base rounded-full bg-violet/80 border-2 border-violet-2 px-4 py-2 hover:bg-violet-2 transition-colors"
        >
          ← Arcade
        </button>
        <h1 className="font-display font-extrabold text-lg sm:text-2xl">{title}</h1>
        <div className="font-pixel text-sm sm:text-base bg-violet/80 border-2 border-violet-2 rounded-full px-4 py-2">
          {score.toString().padStart(4, "0")}
        </div>
      </header>

      <main ref={stageRef} className="flex-1 flex items-center justify-center px-4 pb-28 min-h-0">
        <div
          className="relative rounded-2xl border-4 border-violet-2 bg-night-2 overflow-hidden"
          style={{ width: stageSize.w, height: stageSize.h }}
        >
          {phase === "playing" || phase === "paused" ? (
            <GameErrorBoundary onCrash={() => engine.stopMusic()}>
              <GameComponent
                width={stageSize.w}
                height={stageSize.h}
                paused={phase === "paused"}
                onScoreUpdate={handleScoreUpdate}
                onGameOver={handleGameOver}
              />
            </GameErrorBoundary>
          ) : null}

          {phase === "ready" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-night/70 p-6 text-center">
              <p className="font-display font-extrabold text-2xl text-sun">{subtitle}</p>
              <p className="text-cloud/70 max-w-xs">{instructions}</p>
              <button
                type="button"
                onClick={start}
                className="rounded-full bg-coral px-8 py-3 font-display font-extrabold text-ink hover:bg-coral-2 transition-colors mt-2"
              >
                ▶ Start
              </button>
            </div>
          )}

          {phase === "paused" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-night/80">
              <p className="font-display font-extrabold text-3xl text-teal">Paused</p>
              <button
                type="button"
                onClick={() => setPhase("playing")}
                className="rounded-full bg-teal px-8 py-3 font-display font-extrabold text-ink hover:brightness-110"
              >
                ▶ Resume
              </button>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent("arcade:exit-game"))}
                className="rounded-full border-2 border-violet-2 px-8 py-2 font-display font-bold hover:bg-violet-2"
              >
                Quit
              </button>
            </div>
          )}

          {phase === "gameover" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-night/85 p-6 text-center">
              <p className="font-display font-extrabold text-3xl text-coral">Game Over!</p>
              <p className="font-pixel text-xl text-sun mt-2">{score.toString().padStart(4, "0")}</p>
              {best && (
                <div className="flex gap-4 mt-3 text-sm">
                  <span className="text-cloud/70">
                    My best: <b className="text-cloud">{best.myBest?.value ?? "—"}</b>
                  </span>
                  <span className="text-cloud/70">
                    Top: <b className="text-cloud">{best.overallBest?.value ?? "—"}</b>
                  </span>
                </div>
              )}
              {activeProfile && best?.overallBest?.profileId === activeProfile.id && score === best.overallBest.value && (
                <p className="font-display font-bold text-lime mt-1 animate-bulb-pulse">🎉 New top score!</p>
              )}
              <div className="flex gap-3 mt-4">
                <button
                  type="button"
                  onClick={start}
                  className="rounded-full bg-coral px-6 py-3 font-display font-extrabold text-ink hover:bg-coral-2"
                >
                  ↻ Play Again
                </button>
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent("arcade:exit-game"))}
                  className="rounded-full border-2 border-violet-2 px-6 py-3 font-display font-bold hover:bg-violet-2"
                >
                  Arcade
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {phase === "playing" && <TouchControls {...touchOptions} />}
    </div>
  );
}
