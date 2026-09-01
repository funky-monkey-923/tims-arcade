import { useEffect, useRef, useState, type ComponentType } from "react";
import { useArcade } from "../context/ArcadeContext";
import { engine } from "../lib/audio";
import { subscribeMenuInput } from "../lib/input";
import TouchControls from "../components/TouchControls";
import type { GameId, GameStats } from "../lib/storage";
import type { GameComponentProps } from "./engineTypes";

type Phase = "ready" | "playing" | "paused" | "gameover";

interface TouchOptions {
  showDpad?: boolean;
  showConfirm?: boolean;
  showCancel?: boolean;
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
  touchOptions = { showDpad: true, showConfirm: false },
}: GameShellProps) {
  const { recordScore, statsFor, activeProfile } = useArcade();
  const [phase, setPhase] = useState<Phase>("ready");
  const [score, setScore] = useState(0);
  const [best, setBest] = useState<GameStats | null>(null);
  const stageRef = useRef<HTMLElement | null>(null);
  const [stageSize, setStageSize] = useState({ w: 480, h: 480 });

  useEffect(() => {
    engine.startMusic("action");
    return () => engine.stopMusic();
  }, []);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver((entries) => {
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
        if (action === "pause") {
          setPhase((p) => (p === "playing" ? "paused" : p === "paused" ? "playing" : p));
        }
      }),
    []
  );

  const handleGameOver = (finalScore: number) => {
    setScore(finalScore);
    setPhase("gameover");
    engine.stopMusic();
    recordScore(gameId, finalScore);
    const stats = statsFor(gameId);
    setBest(stats);
    const isNewTop = !!activeProfile && stats.overallBest?.profileId === activeProfile.id && finalScore === stats.overallBest.value;
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
    engine.startMusic("action");
    setScore(0);
    setPhase("playing");
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
            <GameComponent
              width={stageSize.w}
              height={stageSize.h}
              paused={phase === "paused"}
              onScoreUpdate={handleScoreUpdate}
              onGameOver={handleGameOver}
            />
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
