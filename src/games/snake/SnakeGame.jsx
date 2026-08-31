import { useEffect, useRef } from "react";
import { controls } from "../../lib/input";
import { engine } from "../../lib/audio";

const GRID = 14; // easy mode: fairly large cells, forgiving hitbox
const TICK_MS = 170; // slow, kid-friendly pace

function randCell(exclude) {
  let cell;
  do {
    cell = { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) };
  } while (exclude.some((s) => s.x === cell.x && s.y === cell.y));
  return cell;
}

export default function SnakeGame({ width, height, paused, onScoreUpdate, onGameOver }) {
  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  const rafRef = useRef(null);
  const lastTickRef = useRef(0);

  useEffect(() => {
    const mid = Math.floor(GRID / 2);
    const snake = [
      { x: mid - 1, y: mid },
      { x: mid - 2, y: mid },
      { x: mid - 3, y: mid },
    ];
    stateRef.current = {
      snake,
      dir: { x: 1, y: 0 },
      nextDir: { x: 1, y: 0 },
      food: randCell(snake),
      score: 0,
      dead: false,
    };
  }, [width]);

  // mouse: click a quadrant of the canvas relative to the snake head to steer
  const handlePointerDown = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const st = stateRef.current;
    if (!st) return;
    const cell = width / GRID;
    const head = st.snake[0];
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const dx = clickX - (head.x + 0.5) * cell;
    const dy = clickY - (head.y + 0.5) * cell;
    if (Math.abs(dx) > Math.abs(dy)) {
      setDir(dx > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 });
    } else {
      setDir(dy > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 });
    }
  };

  function setDir(next) {
    const st = stateRef.current;
    if (!st) return;
    if (next.x === -st.dir.x && next.y === -st.dir.y) return; // no instant reverse
    st.nextDir = next;
  }

  useEffect(() => {
    const ctx = canvasRef.current.getContext("2d");
    const cell = width / GRID;

    function tick(ts) {
      rafRef.current = requestAnimationFrame(tick);
      const st = stateRef.current;
      if (!st || st.dead) return;

      // read held keyboard/gamepad/touch direction each frame
      if (!paused) {
        if (controls.up) setDir({ x: 0, y: -1 });
        else if (controls.down) setDir({ x: 0, y: 1 });
        else if (controls.left) setDir({ x: -1, y: 0 });
        else if (controls.right) setDir({ x: 1, y: 0 });
      }

      if (!paused && ts - lastTickRef.current >= TICK_MS) {
        lastTickRef.current = ts;
        st.dir = st.nextDir;
        const head = { x: st.snake[0].x + st.dir.x, y: st.snake[0].y + st.dir.y };

        const hitWall = head.x < 0 || head.y < 0 || head.x >= GRID || head.y >= GRID;
        const hitSelf = st.snake.some((s) => s.x === head.x && s.y === head.y);
        if (hitWall || hitSelf) {
          st.dead = true;
          engine.playSfx("hit");
          onGameOver(st.score);
          return;
        }

        st.snake.unshift(head);
        if (head.x === st.food.x && head.y === st.food.y) {
          st.score += 10;
          onScoreUpdate(st.score);
          engine.playSfx("coin");
          st.food = randCell(st.snake);
        } else {
          st.snake.pop();
        }
      }

      // draw
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#150c33";
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      for (let i = 1; i < GRID; i++) {
        ctx.beginPath();
        ctx.moveTo(i * cell, 0);
        ctx.lineTo(i * cell, height);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * cell);
        ctx.lineTo(width, i * cell);
        ctx.stroke();
      }

      // food (pulsing coin)
      const pulse = 0.85 + 0.15 * Math.sin(ts / 150);
      ctx.fillStyle = "#ffd43b";
      ctx.beginPath();
      ctx.arc(
        (st.food.x + 0.5) * cell,
        (st.food.y + 0.5) * cell,
        (cell / 2.4) * pulse,
        0,
        Math.PI * 2
      );
      ctx.fill();

      // snake
      st.snake.forEach((seg, i) => {
        ctx.fillStyle = i === 0 ? "#8bff56" : "#5fce38";
        const pad = 1.5;
        ctx.beginPath();
        ctx.roundRect(seg.x * cell + pad, seg.y * cell + pad, cell - pad * 2, cell - pad * 2, 6);
        ctx.fill();
      });
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
      aria-label="Wiggle Worm snake game"
    />
  );
}
