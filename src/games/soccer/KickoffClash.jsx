import { useEffect, useRef } from "react";
import { controls } from "../../lib/input";
import { engine } from "../../lib/audio";

const MATCH_MS = 60000;
const PLAYER_SPEED = 3.4;
const CPU_SPEED = 2.6; // slightly slower than the player: easy mode
const BALL_FRICTION = 0.985;
const KICK_COOLDOWN = 380;

function resetBall(width, height) {
  return { x: width / 2, y: height / 2, vx: 0, vy: 0 };
}

export default function KickoffClash({ width, height, paused, onScoreUpdate, onGameOver }) {
  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  const rafRef = useRef(null);
  const lastKickRef = useRef(0);

  useEffect(() => {
    stateRef.current = {
      player: { x: width * 0.3, y: height / 2, r: Math.max(12, width * 0.035) },
      cpu: { x: width * 0.7, y: height / 2, r: Math.max(12, width * 0.035) },
      ball: { ...resetBall(width, height), r: Math.max(7, width * 0.02) },
      playerGoals: 0,
      cpuGoals: 0,
      timeLeft: MATCH_MS,
      over: false,
    };
  }, [width, height]);

  useEffect(() => {
    const ctx = canvasRef.current.getContext("2d");
    const goalHalf = height * 0.16;
    const goalTop = height / 2 - goalHalf;
    const goalBottom = height / 2 + goalHalf;

    function shoot(entity, ball, towardRightGoal, power = 9) {
      const targetX = towardRightGoal ? width : 0;
      const targetY = height / 2 + (Math.random() - 0.5) * goalHalf;
      const dx = targetX - ball.x;
      const dy = targetY - ball.y;
      const len = Math.hypot(dx, dy) || 1;
      ball.vx = (dx / len) * power;
      ball.vy = (dy / len) * power;
      engine.playSfx("move");
    }

    function finalWhistle(st) {
      st.over = true;
      const won = st.playerGoals > st.cpuGoals;
      const score = st.playerGoals * 100 + (won ? 200 : 0);
      engine.playSfx(won ? "clear" : "gameover");
      onScoreUpdate(score);
      onGameOver(score);
    }

    function tick(ts) {
      rafRef.current = requestAnimationFrame(tick);
      const st = stateRef.current;
      if (!st || st.over) return;

      if (!paused) {
        const { player, cpu, ball } = st;

        // player movement
        let dx = 0;
        let dy = 0;
        if (controls.left) dx -= 1;
        if (controls.right) dx += 1;
        if (controls.up) dy -= 1;
        if (controls.down) dy += 1;
        if (dx || dy) {
          const len = Math.hypot(dx, dy) || 1;
          player.x += (dx / len) * PLAYER_SPEED;
          player.y += (dy / len) * PLAYER_SPEED;
        }
        player.x = Math.max(player.r, Math.min(width - player.r, player.x));
        player.y = Math.max(player.r, Math.min(height - player.r, player.y));

        // shoot on confirm, when close enough to the ball
        const distToBall = Math.hypot(ball.x - player.x, ball.y - player.y);
        if (controls.confirm && ts - lastKickRef.current > KICK_COOLDOWN && distToBall < player.r + ball.r + 10) {
          lastKickRef.current = ts;
          shoot(player, ball, true, 10);
        } else if (distToBall < player.r + ball.r) {
          // gentle dribble push so just running into the ball moves it
          const nx = (ball.x - player.x) / (distToBall || 1);
          const ny = (ball.y - player.y) / (distToBall || 1);
          ball.vx += nx * 1.6;
          ball.vy += ny * 1.6;
        }

        // cpu defender AI: chase the ball, clear it toward the player's goal when close
        const cdx = ball.x - cpu.x;
        const cdy = ball.y - cpu.y;
        const cdist = Math.hypot(cdx, cdy) || 1;
        if (cdist > 4) {
          cpu.x += (cdx / cdist) * CPU_SPEED;
          cpu.y += (cdy / cdist) * CPU_SPEED;
        }
        cpu.x = Math.max(cpu.r, Math.min(width - cpu.r, cpu.x));
        cpu.y = Math.max(cpu.r, Math.min(height - cpu.r, cpu.y));
        if (cdist < cpu.r + ball.r + 6 && ts - lastKickRef.current > 500 && Math.random() < 0.05) {
          shoot(cpu, ball, false, 7.5);
        }

        // ball physics
        ball.x += ball.vx;
        ball.y += ball.vy;
        ball.vx *= BALL_FRICTION;
        ball.vy *= BALL_FRICTION;

        if (ball.y < ball.r) {
          ball.y = ball.r;
          ball.vy *= -0.7;
        } else if (ball.y > height - ball.r) {
          ball.y = height - ball.r;
          ball.vy *= -0.7;
        }

        const inGoalMouth = ball.y > goalTop && ball.y < goalBottom;
        if (ball.x < ball.r) {
          if (inGoalMouth) {
            st.cpuGoals += 1;
            engine.playSfx("hit");
            Object.assign(ball, resetBall(width, height));
          } else {
            ball.x = ball.r;
            ball.vx *= -0.7;
          }
        } else if (ball.x > width - ball.r) {
          if (inGoalMouth) {
            st.playerGoals += 1;
            engine.playSfx("coin");
            onScoreUpdate(st.playerGoals * 100);
            Object.assign(ball, resetBall(width, height));
          } else {
            ball.x = width - ball.r;
            ball.vx *= -0.7;
          }
        }

        st.timeLeft -= 16.7;
        if (st.timeLeft <= 0) {
          finalWhistle(st);
        }
      }

      // ---- draw ----
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#163a1f";
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 2;
      ctx.strokeRect(6, 6, width - 12, height - 12);
      ctx.beginPath();
      ctx.moveTo(width / 2, 6);
      ctx.lineTo(width / 2, height - 6);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, height * 0.12, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = "#f5f5ff";
      ctx.lineWidth = 4;
      ctx.strokeRect(-4, goalTop, 14, goalBottom - goalTop);
      ctx.strokeRect(width - 10, goalTop, 14, goalBottom - goalTop);

      ctx.fillStyle = "#2ee6d6";
      ctx.beginPath();
      ctx.arc(st.player.x, st.player.y, st.player.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ff4d8d";
      ctx.beginPath();
      ctx.arc(st.cpu.x, st.cpu.y, st.cpu.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(st.ball.x, st.ball.y, st.ball.r, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = "bold 16px sans-serif";
      ctx.fillStyle = "#f5f5ff";
      ctx.textAlign = "center";
      ctx.fillText(`${st.playerGoals} - ${st.cpuGoals}`, width / 2, 26);
      ctx.font = "12px sans-serif";
      ctx.fillText(`${Math.max(0, Math.ceil(st.timeLeft / 1000))}s`, width / 2, 44);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, paused]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="block touch-none"
      role="img"
      aria-label="Kickoff Clash 2D soccer game"
    />
  );
}
