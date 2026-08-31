import { useEffect, useRef } from "react";
import { controls } from "../../lib/input";
import { engine } from "../../lib/audio";

const GRAVITY = 0.9;
const JUMP_V = -14;
const MOVE_SPEED = 3.2;
const ROUND_MS = 45000;
const MAX_HEALTH = 100;

const MOVES = {
  punch: { windup: 60, active: 140, recover: 160, range: 0.16, damage: 7 },
  kick: { windup: 90, active: 160, recover: 260, range: 0.22, damage: 12 },
};

function makeFighter(x, color) {
  return {
    x,
    vx: 0,
    y: 0,
    vy: 0,
    facing: x < 0.5 ? 1 : -1,
    state: "idle", // idle | walk | jump | punch | kick | block | hit
    timer: 0,
    hasHit: false,
    health: MAX_HEALTH,
    color,
  };
}

export default function RumbleRing({ width, height, paused, onScoreUpdate, onGameOver }) {
  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  const rafRef = useRef(null);
  const lastTsRef = useRef(0);
  const cpuBrainRef = useRef(0);

  useEffect(() => {
    stateRef.current = {
      player: makeFighter(width * 0.25, "#2ee6d6"),
      cpu: makeFighter(width * 0.75, "#ff4d8d"),
      timeLeft: ROUND_MS,
      damageDealt: 0,
      over: false,
    };
  }, [width, height]);

  useEffect(() => {
    const ctx = canvasRef.current.getContext("2d");
    const ground = height * 0.82;

    function startMove(f, name) {
      f.state = name;
      f.timer = 0;
      f.hasHit = false;
      engine.playSfx("move");
    }

    function applyDamage(attacker, defender, dmg) {
      const blocked = defender.state === "block";
      const real = blocked ? Math.round(dmg * 0.25) : dmg;
      defender.health = Math.max(0, defender.health - real);
      defender.vx = attacker.facing * (blocked ? 1.5 : 4);
      if (!blocked) {
        defender.state = "hit";
        defender.timer = 0;
      }
      engine.playSfx(blocked ? "move" : "hit");
      return real;
    }

    function stepFighter(f, other, dt, ai) {
      f.timer += dt;

      if (f.state === "idle" || f.state === "walk") {
        f.facing = other.x > f.x ? 1 : -1;
        if (ai) {
          ai();
        } else {
          let moving = false;
          if (controls.left) {
            f.vx = -MOVE_SPEED;
            moving = true;
          } else if (controls.right) {
            f.vx = MOVE_SPEED;
            moving = true;
          } else {
            f.vx = 0;
          }
          f.state = moving ? "walk" : "idle";
          if (controls.up && f.y >= ground) {
            f.vy = JUMP_V;
            f.state = "jump";
            engine.playSfx("move");
          } else if (controls.down) {
            f.state = "block";
          } else if (controls.confirm) {
            startMove(f, "punch");
          } else if (controls.cancel) {
            startMove(f, "kick");
          }
        }
      } else if (f.state === "block") {
        f.vx = 0;
        if (!(!ai && controls.down)) f.state = "idle";
      } else if (f.state === "jump") {
        if (f.y >= ground && f.vy >= 0) {
          f.state = "idle";
          f.vx = 0;
        }
      } else if (f.state === "punch" || f.state === "kick") {
        const info = MOVES[f.state];
        if (!f.hasHit && f.timer >= info.windup && f.timer <= info.windup + info.active) {
          const dist = Math.abs(other.x - f.x);
          if (dist < width * info.range && Math.sign(other.x - f.x) === f.facing) {
            f.hasHit = true;
            const dmg = applyDamage(f, other, info.damage);
            if (f === stateRef.current.player) stateRef.current.damageDealt += dmg;
          }
        }
        if (f.timer >= info.windup + info.active + info.recover) {
          f.state = "idle";
          f.vx = 0;
        }
      } else if (f.state === "hit") {
        if (f.timer >= 260) f.state = "idle";
      }

      // physics
      f.vy += GRAVITY;
      f.y += f.vy;
      if (f.y > ground) {
        f.y = ground;
        f.vy = 0;
      }
      f.x += f.vx;
      f.vx *= 0.85;
      const margin = width * 0.06;
      f.x = Math.max(margin, Math.min(width - margin, f.x));
    }

    function cpuAI(dt) {
      const st = stateRef.current;
      cpuBrainRef.current += dt;
      const cpu = st.cpu;
      const p = st.player;
      if (cpu.state !== "idle" && cpu.state !== "walk") return;
      const dist = Math.abs(p.x - cpu.x);
      cpu.facing = p.x > cpu.x ? 1 : -1;
      if (cpuBrainRef.current < 260) {
        // slow, easy reaction time: only re-decide roughly 4x/sec
        return;
      }
      cpuBrainRef.current = 0;
      if (dist > width * 0.2) {
        cpu.vx = cpu.facing * MOVE_SPEED * 0.8;
        cpu.state = "walk";
      } else if (dist < width * 0.1) {
        const roll = Math.random();
        if (roll < 0.35) startMove(cpu, "punch");
        else if (roll < 0.55) startMove(cpu, "kick");
        else if (roll < 0.7) {
          cpu.vx = -cpu.facing * MOVE_SPEED * 0.6;
          cpu.state = "walk";
        } else {
          cpu.vx = 0;
          cpu.state = "idle";
        }
      } else {
        cpu.vx = cpu.facing * MOVE_SPEED * 0.5;
        cpu.state = "walk";
      }
    }

    function drawFighter(f) {
      const w = width * 0.07;
      const h = height * 0.24;
      const bx = f.x - w / 2;
      const by = f.y - h;
      ctx.fillStyle = f.state === "hit" ? "#ffffff" : f.color;
      ctx.beginPath();
      ctx.roundRect(bx, by, w, h, 8);
      ctx.fill();
      // glove/limb during attack
      if (f.state === "punch" || f.state === "kick") {
        const reach = f.facing * width * MOVES[f.state].range;
        ctx.fillStyle = "#ffd43b";
        ctx.beginPath();
        ctx.arc(f.x + reach, by + h * 0.35, w * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
      if (f.state === "block") {
        ctx.strokeStyle = "#ffd43b";
        ctx.lineWidth = 3;
        ctx.strokeRect(bx - 2, by - 2, w + 4, h + 4);
      }
      // face marker showing facing direction
      ctx.fillStyle = "#150c33";
      ctx.beginPath();
      ctx.arc(f.x + f.facing * w * 0.22, by + h * 0.18, w * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }

    function drawHealthBars(st) {
      const pad = 14;
      const barW = width / 2 - pad * 2;
      const barH = 16;
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fillRect(pad, pad, barW, barH);
      ctx.fillRect(width - pad - barW, pad, barW, barH);
      ctx.fillStyle = "#8bff56";
      ctx.fillRect(pad, pad, barW * (st.player.health / MAX_HEALTH), barH);
      ctx.fillStyle = "#ff4d8d";
      const cpuW = barW * (st.cpu.health / MAX_HEALTH);
      ctx.fillRect(width - pad - cpuW, pad, cpuW, barH);
      ctx.font = "bold 12px sans-serif";
      ctx.fillStyle = "#f5f5ff";
      ctx.textAlign = "left";
      ctx.fillText("YOU", pad, pad + barH + 14);
      ctx.textAlign = "right";
      ctx.fillText("RIVAL", width - pad, pad + barH + 14);
      ctx.textAlign = "center";
      ctx.fillText(`${Math.ceil(st.timeLeft / 1000)}`, width / 2, pad + barH);
    }

    function endMatch(st, playerWon) {
      st.over = true;
      const bonus = playerWon ? 300 : 0;
      const score = st.damageDealt + bonus;
      engine.playSfx(playerWon ? "clear" : "gameover");
      onScoreUpdate(score);
      onGameOver(score);
    }

    function tick(ts) {
      rafRef.current = requestAnimationFrame(tick);
      const st = stateRef.current;
      if (!st || st.over) return;
      const dt = lastTsRef.current ? Math.min(48, ts - lastTsRef.current) : 16;
      lastTsRef.current = ts;

      if (!paused) {
        stepFighter(st.player, st.cpu, dt, null);
        stepFighter(st.cpu, st.player, dt, () => cpuAI(dt));
        onScoreUpdate(st.damageDealt);

        if (st.cpu.health <= 0) {
          endMatch(st, true);
        } else if (st.player.health <= 0) {
          endMatch(st, false);
        } else {
          st.timeLeft -= dt;
          if (st.timeLeft <= 0) {
            endMatch(st, st.player.health >= st.cpu.health);
          }
        }
      }

      ctx.clearRect(0, 0, width, height);
      const grd = ctx.createLinearGradient(0, 0, 0, height);
      grd.addColorStop(0, "#2e1a6b");
      grd.addColorStop(1, "#150c33");
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#3d2585";
      ctx.fillRect(0, ground, width, height - ground);
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.beginPath();
      ctx.moveTo(0, ground);
      ctx.lineTo(width, ground);
      ctx.stroke();

      drawFighter(st.cpu);
      drawFighter(st.player);
      drawHealthBars(st);
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
      aria-label="Rumble Ring fighting game"
    />
  );
}
