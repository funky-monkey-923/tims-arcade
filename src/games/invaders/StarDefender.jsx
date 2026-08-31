import { useEffect, useRef } from "react";
import { controls } from "../../lib/input";
import { engine } from "../../lib/audio";

const ROWS = 4;
const COLS = 7;
const PLAYER_SPEED = 4.4; // px per frame, easy mode: forgiving speed
const BULLET_SPEED = 7;
const ENEMY_BULLET_SPEED = 2.6;
const FIRE_COOLDOWN = 320; // ms — easy mode, no button-mash required
const ENEMY_FIRE_CHANCE = 0.0016; // per alive bottom-row enemy, per frame

function makeWave(width, height) {
  const marginX = width * 0.1;
  const gridW = width - marginX * 2;
  const cell = gridW / COLS;
  const enemies = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      enemies.push({
        row: r,
        col: c,
        x: marginX + c * cell + cell / 2,
        y: height * 0.12 + r * (cell * 0.85),
        alive: true,
      });
    }
  }
  return { enemies, cell, dir: 1, offsetX: 0, dropAccum: 0 };
}

export default function StarDefender({ width, height, paused, onScoreUpdate, onGameOver }) {
  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  const rafRef = useRef(null);
  const lastFireRef = useRef(0);
  const pointerTargetRef = useRef(null);
  const pointerSeenRef = useRef(0);

  useEffect(() => {
    const player = { x: width / 2, y: height - 28, w: Math.max(28, width * 0.08), h: 16 };
    stateRef.current = {
      player,
      bullets: [], // {x,y,vy,from}
      wave: makeWave(width, height),
      waveNumber: 1,
      lives: 3,
      score: 0,
      dead: false,
    };
  }, [width, height]);

  const handlePointerMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    pointerTargetRef.current = e.clientX - rect.left;
    pointerSeenRef.current = performance.now();
  };

  useEffect(() => {
    const ctx = canvasRef.current.getContext("2d");

    function loseLife(st) {
      st.lives -= 1;
      engine.playSfx("hit");
      if (st.lives <= 0) {
        st.dead = true;
        onGameOver(st.score);
      }
    }

    function tick(ts) {
      rafRef.current = requestAnimationFrame(tick);
      const st = stateRef.current;
      if (!st || st.dead) return;

      if (!paused) {
        const { player, wave, bullets } = st;

        // movement: mouse/touch drag over the canvas takes priority; otherwise
        // held keyboard/gamepad/on-screen d-pad left/right
        const usingPointer = performance.now() - pointerSeenRef.current < 600 && pointerTargetRef.current != null;
        if (usingPointer) {
          player.x += (pointerTargetRef.current - player.x) * 0.18;
        } else {
          if (controls.left) player.x -= PLAYER_SPEED;
          if (controls.right) player.x += PLAYER_SPEED;
        }
        player.x = Math.max(player.w / 2, Math.min(width - player.w / 2, player.x));

        if (controls.confirm && ts - lastFireRef.current > FIRE_COOLDOWN) {
          lastFireRef.current = ts;
          bullets.push({ x: player.x, y: player.y - player.h, vy: -BULLET_SPEED, from: "player" });
          engine.playSfx("move");
        }

        // enemy formation movement
        const aliveEnemies = wave.enemies.filter((e) => e.alive);
        if (aliveEnemies.length > 0) {
          const speed = 0.35 + (wave.waveNumber - 1) * 0.08 + (ROWS * COLS - aliveEnemies.length) * 0.01;
          wave.offsetX += wave.dir * speed;
          const minX = Math.min(...aliveEnemies.map((e) => e.x)) + wave.offsetX;
          const maxX = Math.max(...aliveEnemies.map((e) => e.x)) + wave.offsetX;
          if (maxX > width - wave.cell / 2 || minX < wave.cell / 2) {
            wave.dir *= -1;
            wave.offsetX += wave.dir * speed * 2;
            aliveEnemies.forEach((e) => {
              e.y += wave.cell * 0.35;
            });
            if (aliveEnemies.some((e) => e.y > player.y - 30)) {
              st.dead = true;
              onGameOver(st.score);
              return;
            }
          }

          // occasional enemy fire from the lowest alive enemy in a random column
          if (Math.random() < ENEMY_FIRE_CHANCE * aliveEnemies.length) {
            const shooter = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
            bullets.push({ x: shooter.x + wave.offsetX, y: shooter.y, vy: ENEMY_BULLET_SPEED, from: "enemy" });
          }
        } else {
          // wave cleared! bonus + fresh, slightly tougher wave
          st.score += 50;
          onScoreUpdate(st.score);
          engine.playSfx("clear");
          st.waveNumber += 1;
          st.wave = makeWave(width, height);
        }

        // bullets
        for (let i = bullets.length - 1; i >= 0; i--) {
          const b = bullets[i];
          b.y += b.vy;
          if (b.y < -10 || b.y > height + 10) {
            bullets.splice(i, 1);
            continue;
          }
          if (b.from === "player") {
            for (const e of wave.enemies) {
              if (!e.alive) continue;
              const ex = e.x + wave.offsetX;
              if (Math.abs(b.x - ex) < wave.cell * 0.4 && Math.abs(b.y - e.y) < wave.cell * 0.4) {
                e.alive = false;
                bullets.splice(i, 1);
                st.score += 10;
                onScoreUpdate(st.score);
                engine.playSfx("coin");
                break;
              }
            }
          } else if (b.from === "enemy") {
            if (Math.abs(b.x - player.x) < player.w / 2 + 4 && Math.abs(b.y - player.y) < player.h) {
              bullets.splice(i, 1);
              loseLife(st);
            }
          }
        }
      }

      // ---- draw ----
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#150c33";
      ctx.fillRect(0, 0, width, height);

      const { player, wave, bullets } = st;

      // enemies
      wave.enemies.forEach((e) => {
        if (!e.alive) return;
        const ex = e.x + wave.offsetX;
        ctx.font = `${Math.floor(wave.cell * 0.8)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("👾", ex, e.y);
      });

      // bullets
      bullets.forEach((b) => {
        ctx.fillStyle = b.from === "player" ? "#2ee6d6" : "#ff4d8d";
        ctx.fillRect(b.x - 2, b.y - 6, 4, 12);
      });

      // player ship
      ctx.fillStyle = "#8bff56";
      ctx.beginPath();
      ctx.moveTo(player.x, player.y - player.h);
      ctx.lineTo(player.x - player.w / 2, player.y + player.h / 2);
      ctx.lineTo(player.x + player.w / 2, player.y + player.h / 2);
      ctx.closePath();
      ctx.fill();

      // lives / wave HUD
      ctx.font = "14px sans-serif";
      ctx.textAlign = "left";
      ctx.fillStyle = "#f5f5ff";
      ctx.fillText("❤️".repeat(Math.max(0, st.lives)), 8, 18);
      ctx.textAlign = "right";
      ctx.fillText(`Wave ${st.waveNumber}`, width - 8, 18);
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
      onPointerMove={handlePointerMove}
      className="block touch-none"
      role="img"
      aria-label="Star Defender space shooter game"
    />
  );
}
