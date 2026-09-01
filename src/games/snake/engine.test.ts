import { describe, expect, it } from "vitest";
import { createState, step, GRID, type SnakeState } from "./engine";
import type { EngineInput } from "../engineTypes";

// Minimal EngineInput with everything false, so tests only need to override
// the direction flags they actually care about — mirrors how the real game
// components build this object from the input singleton each frame.
function noInput(overrides: Partial<EngineInput> = {}): EngineInput {
  return {
    moveUp: false,
    moveDown: false,
    moveLeft: false,
    moveRight: false,
    primaryAction: false,
    secondaryAction: false,
    pointer: { x: 0, y: 0, active: false },
    ...overrides,
  };
}

// tickIntervalFor(0) === TICK_MS_BASE (170ms) — comfortably past that avoids
// any ambiguity about whether a tick "should" have fired yet.
const PAST_TICK = 1000;

describe("snake engine: createState", () => {
  it("starts alive, at wave 1, with a 3-segment snake moving right", () => {
    const state = createState(400);
    expect(state.dead).toBe(false);
    expect(state.wave).toBe(1);
    expect(state.score).toBe(0);
    expect(state.snake).toHaveLength(3);
    expect(state.dir).toEqual({ x: 1, y: 0 });
    // Wave 1 uses the empty layout by design, so a brand-new player is never
    // ambushed by obstacles on their very first move.
    expect(state.walls).toEqual([]);
  });

  it("places initial food somewhere on the board and off the snake", () => {
    const state = createState(400);
    expect(state.food.x).toBeGreaterThanOrEqual(0);
    expect(state.food.x).toBeLessThan(GRID);
    const onSnake = state.snake.some((s) => s.x === state.food.x && s.y === state.food.y);
    expect(onSnake).toBe(false);
  });
});

describe("snake engine: step", () => {
  it("moves forward one cell and keeps the same length when no food is eaten", () => {
    const state = createState(400);
    const headBefore = { ...state.snake[0] };
    const lengthBefore = state.snake.length;
    // Push food somewhere unreachable this tick so this test is only about movement.
    state.food = { x: GRID - 1, y: GRID - 1, kind: "normal" };
    step(state, noInput(), 16, PAST_TICK);
    expect(state.snake).toHaveLength(lengthBefore);
    expect(state.snake[0]).toEqual({ x: headBefore.x + 1, y: headBefore.y });
    expect(state.dead).toBe(false);
  });

  it("dies on hitting the boundary", () => {
    const state = createState(400);
    // Walk the head right up against the right edge, then step once more.
    state.snake = [{ x: GRID - 1, y: 5 }];
    state.dir = { x: 1, y: 0 };
    state.nextDir = { x: 1, y: 0 };
    state.food = { x: 0, y: 0, kind: "normal" }; // out of the way
    const events = step(state, noInput(), 16, PAST_TICK);
    expect(state.dead).toBe(true);
    expect(events.gameOver).toBe(state.score);
  });

  it("dies on hitting its own body", () => {
    const state = createState(400);
    // A loop where heading right from the head at (5,5) lands on (6,5),
    // which is body segment index 1 — not the tail (the tail vacates this
    // same tick and is correctly *not* a collision, per the engine's own
    // rules), so this is a genuine self-hit.
    state.snake = [
      { x: 5, y: 5 },
      { x: 6, y: 5 },
      { x: 6, y: 6 },
      { x: 5, y: 6 },
      { x: 4, y: 6 },
      { x: 4, y: 5 },
    ];
    state.dir = { x: 1, y: 0 };
    state.nextDir = { x: 1, y: 0 };
    state.food = { x: 0, y: 0, kind: "normal" };
    const events = step(state, noInput(), 16, PAST_TICK);
    expect(state.dead).toBe(true);
    expect(events.gameOver).toBeDefined();
  });

  it("eating normal food grows the snake, scores 10, and reports the new score", () => {
    const state = createState(400);
    const head = state.snake[0];
    const nextCell = { x: head.x + 1, y: head.y };
    state.food = { x: nextCell.x, y: nextCell.y, kind: "normal" };
    const lengthBefore = state.snake.length;
    const events = step(state, noInput(), 16, PAST_TICK);
    expect(state.score).toBe(10);
    expect(events.score).toBe(10);
    expect(state.snake).toHaveLength(lengthBefore + 1);
    expect(state.foodEatenCount).toBe(1);
    // A fresh food should have been spawned off the snake's new body.
    const onSnake = state.snake.some((s) => s.x === state.food.x && s.y === state.food.y);
    expect(onSnake).toBe(false);
  });

  it("eating shrink food shrinks the snake back down (never below the minimum length)", () => {
    const state = createState(400);
    // Give it a bit of extra length so shrinking is observable.
    state.snake = [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 3, y: 5 },
      { x: 2, y: 5 },
      { x: 1, y: 5 },
    ];
    state.dir = { x: 1, y: 0 };
    state.nextDir = { x: 1, y: 0 };
    state.food = { x: 6, y: 5, kind: "shrink" };
    const lengthBefore = state.snake.length;
    const events = step(state, noInput(), 16, PAST_TICK);
    expect(state.score).toBe(5);
    expect(events.score).toBe(5);
    expect(state.snake.length).toBeLessThan(lengthBefore);
  });

  it("advances to wave 2 after eating FOOD_PER_WAVE (5) foods", () => {
    let state: SnakeState = createState(400);
    for (let i = 0; i < 5; i++) {
      const head = state.snake[0];
      // Keep heading the same direction and place food directly ahead each
      // time, so every step both moves and eats — five eats, one wave bump.
      state.food = { x: head.x + state.dir.x, y: head.y + state.dir.y, kind: "normal" };
      step(state, noInput(), 16, PAST_TICK * (i + 1));
      expect(state.dead).toBe(false);
    }
    expect(state.foodEatenCount).toBe(5);
    expect(state.wave).toBe(2);
  });

  it("does not advance a tick before the tick interval has elapsed", () => {
    const state = createState(400);
    const headBefore = { ...state.snake[0] };
    step(state, noInput(), 16, 5); // far earlier than TICK_MS_BASE (170ms)
    expect(state.snake[0]).toEqual(headBefore);
  });

  it("ignores an attempted instant reverse", () => {
    const state = createState(400);
    // Facing right; holding "left" should not flip nextDir to face backward.
    step(state, noInput({ moveLeft: true }), 16, 5);
    expect(state.nextDir).toEqual({ x: 1, y: 0 });
  });
});
