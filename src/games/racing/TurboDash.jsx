import { useEffect, useRef } from "react";
import { controls } from "../../lib/input";
import { engine } from "../../lib/audio";

const LANES = 3;
const BASE_SPEED = 3.2;
const MAX_SPEED = 8.5;
const ACCEL = 0.0006; // per ms, easy/gradual ramp-up
const NITRO_MS = 1300;
const NITRO_COOLDOWN = 4500;

function laneX(width, lane) {
  const laneW = width / LANES;
  return laneW * lane + laneW / 2;
}

function spawnObstacle(width, height) {
  return {
    lane: Math.floor(Math.random() * LANES),
    y: -height * 0.15,
    passed: false,
  };
}

export default function TurboDash({ width, height, paused, onScoreUpdate, onGameOver }) {
  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  const rafRef = useRef(null);
  const lastNitroRef = useRef(-99999);
  const lastSpawnRef = useRef(0);

  useEffect(() => {
    stateRef.current = {
      lane: 1,
      x: laneX(width, 1),
      speed: BASE_SPEED,
      distance: 0,
      obstacles: [spawnObstacle(width, height)],
      roadOffset: 0,
      nitroUntil: 0,
      dead: false,
    };
  }, [width, height]);

  useEffect(() => {
    let prevLeft = false;
    let prevRight = false;
    const ctx = canvasRef.current.getContext("2d");
    const carW = width / LANES - 24;
    const carH = height * 0.11;

    function tick(ts) {
      rafRef.current = requestAnimationFrame(tick);
      const st = stateRef.current;
      if (!st || st.dead) return;

      if (!paused) {
        // discrete lane change on the rising edge of left/right (so holding
        // the key doesn't skip multiple lanes)
        if (controls.left && !prevLeft) st.lane = Math.max(0, st.lane - 1);
        if (controls.right && !prevRight) st.lane = Math.min(LANES - 1, st.lane + 1);
        prevLeft = controls.left;
        prevRight = controls.right;
        st.x += (laneX(width, st.lane) - st.x) * 0.25;

        const nitroActive = ts < st.nitroUntil;
        if (controls.confirm && ts - lastNitroRef.current > NITRO_COOLDOWN) {
          lastNitroRef.current = ts;
          st.nitroUntil = ts + NITRO_MS;
          engine.playSfx("powerup");
        }

        st.speed = Math.min(MAX_SPEED, st.speed + ACCEL * 16.7) * (nitroActive ? 1.6 : 1);
        st.distance += st.speed;
        st.roadOffset = (st.roadOffset + st.speed) % (height * 0.2);
        onScoreUpdate(Math.floor(st.distance / 8));

        if (ts - lastSpawnRef.current > Math.max(420, 900 - st.speed * 60)) {
          lastSpawnRef.current = ts;
          st.obstacles.push(spawnObstacle(width, height));
        }

        const carY = height * 0.78;
        st.obstacles.forEach((o) => {
          o.y += st.speed;
        });
        for (let i = st.obstacles.length - 1; i >= 0; i--) {
          const o = st.obstacles[i];
          if (o.y > height + carH) {
            st.obstacles.splice(i, 1);
            continue;
          }
          const sameLane = o.lane === st.lane;
          const overlap = Math.abs(o.y - carY) < carH * 0.75;
          if (sameLane && overlap) {
            if (nitroActive) {
              st.obstacles.splice(i, 1);
              st.distance += 200;
              engine.playSfx("coin");
            } else {
              st.dead = true;
              engine.playSfx("hit");
              const score = Math.floor(st.distance / 8);
              onGameOver(score);
              return;
            }
          }
        }
      }

      // ---- draw ----
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "#2b2b38";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#150c33";
      ctx.fillRect(0, 0, width * 0.02, height);
      ctx.fillRect(width * 0.98, 0, width * 0.02, height);

      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 3;
      ctx.setLineDash([height * 0.09, height * 0.08]);
      for (let l = 1; l < LANES; l++) {
        ctx.beginPath();
        ctx.lineDashOffset = -stateRef.current.roadOffset;
        ctx.moveTo((width / LANES) * l, 0);
        ctx.lineTo((width / LANES) * l, height);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      const st2 = stateRef.current;
      st2.obstacles.forEach((o) => {
        const ox = laneX(width, o.lane);
        ctx.fillStyle = "#ff4d8d";
        ctx.beginPath();
        ctx.roundRect(ox - carW / 2, o.y - carH / 2, carW, carH, 8);
        ctx.fill();
      });

      const nitroActive = ts < st2.nitroUntil;
      ctx.fillStyle = nitroActive ? "#ffd43b" : "#2ee6d6";
      ctx.beginPath();
      ctx.roundRect(st2.x - carW / 2, height * 0.78 - carH / 2, carW, carH, 8);
      ctx.fill();
      if (nitroActive) {
        ctx.fillStyle = "rgba(255,212,59,0.5)";
        ctx.fillRect(st2.x - carW / 2, height * 0.78 + carH / 2, carW, height * 0.08);
      }

      ctx.font = "bold 14px sans-serif";
      ctx.fillStyle = "#f5f5ff";
      ctx.textAlign = "left";
      ctx.fillText(`${Math.round(st2.speed * 20)} mph`, 10, 20);
      if (ts - lastNitroRef.current < NITRO_COOLDOWN && !nitroActive) {
        ctx.textAlign = "right";
        ctx.fillText("nitro charging…", width - 10, 20);
      } else if (!nitroActive) {
        ctx.textAlign = "right";
        ctx.fillText("nitro ready!", width - 10, 20);
      }
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
      aria-label="Turbo Dash racing game"
    />
  );
}
