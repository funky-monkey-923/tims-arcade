import { useEffect, useRef } from "react";
import { controls } from "../../lib/input";
import { engine } from "../../lib/audio";

const ROWS = 13;
const COLS = 15;
const TICK_MS = 160; // player move speed — easy/forgiving pace
const GHOST_TICK_MS = 220; // ghosts are slower than the player
const SCARED_MS = 6500;

function buildMaze() {
  // Border wall + sparse single-cell interior pillars. Because pillars never
  // touch each other, every open cell stays reachable — no maze-generation
  // algorithm needed, just a rule that can't produce a dead lock.
  const wall = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const border = r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1;
      const pillar = r % 2 === 0 && r !== 0 && r !== ROWS - 1 && c % 2 === 0 && c !== 0 && c !== COLS - 1;
      wall[r][c] = border || pillar;
    }
  }
  return wall;
}

function isWall(maze, r, c) {
  if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return true;
  return maze[r][c];
}

const POWER_CELLS = [
  [1, 1],
  [1, COLS - 2],
  [ROWS - 2, 1],
  [ROWS - 2, COLS - 2],
];
const GHOST_STARTS = [
  { r: 2, c: 7, color: "#ff4d8d" },
  { r: ROWS - 3, c: 7, color: "#2ee6d6" },
];
const PLAYER_START = { r: Math.floor(ROWS / 2), c: Math.floor(COLS / 2) };

function freshRound() {
  const maze = buildMaze();
  const dots = new Set();
  const power = new Set();
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!maze[r][c]) dots.add(`${r},${c}`);
    }
  }
  POWER_CELLS.forEach(([r, c]) => {
    dots.delete(`${r},${c}`);
    power.add(`${r},${c}`);
  });
  return {
    maze,
    dots,
    power,
    player: { r: PLAYER_START.r, c: PLAYER_START.c, dir: { x: 0, y: 0 }, nextDir: { x: 0, y: 0 } },
    ghosts: GHOST_STARTS.map((g) => ({ ...g, dir: { x: 0, y: -1 } })),
  };
}

function neighbors(maze, r, c) {
  return [
    { dir: { x: 0, y: -1 }, r: r - 1, c },
    { dir: { x: 0, y: 1 }, r: r + 1, c },
    { dir: { x: -1, y: 0 }, r, c: c - 1 },
    { dir: { x: 1, y: 0 }, r, c: c + 1 },
  ].filter((n) => !isWall(maze, n.r, n.c));
}

export default function MunchMaze({ width, height, paused, onScoreUpdate, onGameOver }) {
  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  const rafRef = useRef(null);
  const lastPlayerTick = useRef(0);
  const lastGhostTick = useRef(0);
  const scaredUntil = useRef(0);

  useEffect(() => {
    stateRef.current = { ...freshRound(), score: 0, lives: 3, wave: 1, dead: false };
  }, [width, height]);

  const handlePointerDown = (e) => {
    const canvas = canvasRef.current;
    const st = stateRef.current;
    if (!canvas || !st) return;
    const rect = canvas.getBoundingClientRect();
    const cell = Math.min(width / COLS, height / ROWS);
    const offX = (width - cell * COLS) / 2;
    const offY = (height - cell * ROWS) / 2;
    const px = (st.player.c + 0.5) * cell + offX;
    const py = (st.player.r + 0.5) * cell + offY;
    const dx = e.clientX - rect.left - px;
    const dy = e.clientY - rect.top - py;
    st.player.nextDir = Math.abs(dx) > Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) };
  };

  useEffect(() => {
    const ctx = canvasRef.current.getContext("2d");
    const cell = Math.min(width / COLS, height / ROWS);
    const offX = (width - cell * COLS) / 2;
    const offY = (height - cell * ROWS) / 2;

    function readInputDir() {
      if (controls.up) return { x: 0, y: -1 };
      if (controls.down) return { x: 0, y: 1 };
      if (controls.left) return { x: -1, y: 0 };
      if (controls.right) return { x: 1, y: 0 };
      return null;
    }

    function drawGhost(x, y, size, color, scared) {
      const r = size / 2;
      ctx.fillStyle = scared ? "#4444ff" : color;
      ctx.beginPath();
      ctx.arc(x, y, r, Math.PI, 0);
      ctx.lineTo(x + r, y + r);
      for (let i = 0; i < 3; i++) {
        ctx.lineTo(x + r - ((i + 0.5) * (2 * r)) / 3, y + (i % 2 === 0 ? r * 0.6 : r));
      }
      ctx.lineTo(x - r, y + r);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(x - r * 0.35, y - r * 0.1, r * 0.22, 0, Math.PI * 2);
      ctx.arc(x + r * 0.35, y - r * 0.1, r * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }

    function tick(ts) {
      rafRef.current = requestAnimationFrame(tick);
      const st = stateRef.current;
      if (!st || st.dead) return;
      const scared = ts < scaredUntil.current;

      if (!paused) {
        const inputDir = readInputDir();
        if (inputDir) st.player.nextDir = inputDir;

        if (ts - lastPlayerTick.current >= TICK_MS) {
          lastPlayerTick.current = ts;
          const p = st.player;
          if (!isWall(st.maze, p.r + p.nextDir.y, p.c + p.nextDir.x)) p.dir = p.nextDir;
          const nr = p.r + p.dir.y;
          const nc = p.c + p.dir.x;
          if (!isWall(st.maze, nr, nc)) {
            p.r = nr;
            p.c = nc;
            const key = `${p.r},${p.c}`;
            if (st.dots.has(key)) {
              st.dots.delete(key);
              st.score += 10;
              onScoreUpdate(st.score);
              engine.playSfx("move");
            } else if (st.power.has(key)) {
              st.power.delete(key);
              st.score += 50;
              onScoreUpdate(st.score);
              engine.playSfx("powerup");
              scaredUntil.current = ts + SCARED_MS;
            }
            if (st.dots.size === 0 && st.power.size === 0) {
              st.wave += 1;
              st.score += 100;
              onScoreUpdate(st.score);
              engine.playSfx("clear");
              const round = freshRound();
              st.maze = round.maze;
              st.dots = round.dots;
              st.power = round.power;
              st.player = round.player;
              st.ghosts = round.ghosts;
            }
          }
        }

        if (ts - lastGhostTick.current >= GHOST_TICK_MS) {
          lastGhostTick.current = ts;
          st.ghosts.forEach((g) => {
            const opts = neighbors(st.maze, g.r, g.c).filter(
              (n) => !(n.dir.x === -g.dir.x && n.dir.y === -g.dir.y)
            );
            const candidates = opts.length ? opts : neighbors(st.maze, g.r, g.c);
            if (candidates.length) {
              let pick;
              const wantsChase = Math.random() < (scared ? 0.15 : 0.35);
              if (wantsChase) {
                candidates.sort((a, b) => {
                  const da = Math.abs(a.r - st.player.r) + Math.abs(a.c - st.player.c);
                  const db = Math.abs(b.r - st.player.r) + Math.abs(b.c - st.player.c);
                  return scared ? db - da : da - db;
                });
                pick = candidates[0];
              } else {
                pick = candidates[Math.floor(Math.random() * candidates.length)];
              }
              g.dir = pick.dir;
              g.r = pick.r;
              g.c = pick.c;
            }
          });
        }

        // collision check
        for (const g of st.ghosts) {
          if (g.r === st.player.r && g.c === st.player.c) {
            if (scared) {
              g.r = GHOST_STARTS.find((gs) => gs.color === g.color).r;
              g.c = GHOST_STARTS.find((gs) => gs.color === g.color).c;
              st.score += 100;
              onScoreUpdate(st.score);
              engine.playSfx("coin");
            } else {
              st.lives -= 1;
              engine.playSfx("hit");
              st.player.r = PLAYER_START.r;
              st.player.c = PLAYER_START.c;
              st.player.dir = { x: 0, y: 0 };
              st.player.nextDir = { x: 0, y: 0 };
              if (st.lives <= 0) {
                st.dead = true;
                onGameOver(st.score);
                return;
              }
            }
          }
        }
      }

      // ---- draw ----
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#150c33";
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = "#3d2585";
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (st.maze[r][c]) {
            ctx.fillRect(offX + c * cell + 1, offY + r * cell + 1, cell - 2, cell - 2);
          }
        }
      }

      ctx.fillStyle = "#ffd43b";
      st.dots.forEach((key) => {
        const [r, c] = key.split(",").map(Number);
        ctx.beginPath();
        ctx.arc(offX + (c + 0.5) * cell, offY + (r + 0.5) * cell, cell * 0.09, 0, Math.PI * 2);
        ctx.fill();
      });
      const pulse = 0.7 + 0.3 * Math.sin(ts / 120);
      st.power.forEach((key) => {
        const [r, c] = key.split(",").map(Number);
        ctx.beginPath();
        ctx.arc(offX + (c + 0.5) * cell, offY + (r + 0.5) * cell, cell * 0.28 * pulse, 0, Math.PI * 2);
        ctx.fill();
      });

      st.ghosts.forEach((g) => {
        drawGhost(offX + (g.c + 0.5) * cell, offY + (g.r + 0.5) * cell, cell * 0.85, g.color, scared);
      });

      const p = st.player;
      const px = offX + (p.c + 0.5) * cell;
      const py = offY + (p.r + 0.5) * cell;
      const angle = Math.atan2(p.dir.y, p.dir.x) || 0;
      const mouth = 0.15 + 0.15 * Math.abs(Math.sin(ts / 100));
      ctx.fillStyle = "#ffd43b";
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.arc(px, py, cell * 0.42, angle + mouth * Math.PI, angle + (2 - mouth) * Math.PI);
      ctx.closePath();
      ctx.fill();

      ctx.font = "14px sans-serif";
      ctx.textAlign = "left";
      ctx.fillStyle = "#f5f5ff";
      ctx.fillText("❤️".repeat(Math.max(0, st.lives)), 8, 18);
      ctx.textAlign = "right";
      ctx.fillText(`Wave ${st.wave}`, width - 8, 18);
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
      onPointerDown={handlePointerDown}
      className="block touch-none"
      role="img"
      aria-label="Munch Maze pac-man style game"
    />
  );
}
