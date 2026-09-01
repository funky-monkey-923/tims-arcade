import { describe, expect, it } from "vitest";
import { createState, step, isWall, ROWS, COLS, type MazeState } from "./engine";
import type { EngineInput } from "../engineTypes";

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

// TICK_MS is 160 for the player and starts even lower for ghosts, but ghosts
// are stripped out of these tests entirely (see below) so only the player
// tick matters — anything comfortably past 160ms is safe.
const PAST_TICK = 1000;

describe("pacman engine: createState", () => {
  it("starts alive, at wave 1, with 3 lives and no score", () => {
    const state = createState(400, 400);
    expect(state.dead).toBe(false);
    expect(state.wave).toBe(1);
    expect(state.lives).toBe(3);
    expect(state.score).toBe(0);
  });

  it("only ever spawns 2 ghosts on wave 1 (chaser + a docile late-activator)", () => {
    const state = createState(400, 400);
    expect(state.ghosts).toHaveLength(2);
    expect(state.ghosts.map((g) => g.personality)).toEqual(["chaser", "lateActivator"]);
  });

  it("places the player on an open (non-wall) cell", () => {
    const state = createState(400, 400);
    expect(isWall(state.maze, state.player.r, state.player.c)).toBe(false);
  });
});

describe("isWall", () => {
  it("treats every out-of-bounds cell as a wall", () => {
    const state = createState(400, 400);
    expect(isWall(state.maze, -1, 0)).toBe(true);
    expect(isWall(state.maze, 0, -1)).toBe(true);
    expect(isWall(state.maze, ROWS, 0)).toBe(true);
    expect(isWall(state.maze, 0, COLS)).toBe(true);
  });
});

describe("pacman engine: step", () => {
  // Ghosts introduce randomness (chase-vs-wander rolls) that would make
  // these tests flaky — stripping them out entirely isolates exactly the
  // player-movement/scoring logic these tests care about, the same way the
  // snake tests manually place food to isolate movement from RNG.
  function withoutGhosts(state: MazeState): MazeState {
    state.ghosts = [];
    return state;
  }

  it("moving into a dot cell eats it, scores 10, and removes it from the board", () => {
    const state = withoutGhosts(createState(400, 400));
    // The player always starts on an even row (see PLAYER_START); every
    // maze variant's pillar rule requires an even row *and* an even column,
    // so moving vertically (row parity flips to odd) is guaranteed to land
    // on an open cell regardless of which maze variant is active — moving
    // horizontally isn't equally safe, since the column parity alone can't
    // rule out a pillar.
    const p = state.player;
    const targetR = p.r + 1;
    const targetC = p.c;
    expect(isWall(state.maze, targetR, targetC)).toBe(false);
    const key = `${targetR},${targetC}`;
    expect(state.dots.has(key)).toBe(true);

    const events = step(state, noInput({ moveDown: true }), 16, PAST_TICK);
    expect(state.player.r).toBe(targetR);
    expect(state.player.c).toBe(targetC);
    expect(state.score).toBe(10);
    expect(events.score).toBe(10);
    expect(events.ateDot).toBe(true);
    expect(state.dots.has(key)).toBe(false);
    expect(state.dotsEatenThisWave).toBe(1);
  });

  it("moving into a power cell eats it, scores 50, and starts the scared window", () => {
    const state = withoutGhosts(createState(400, 400));
    // Power cells are fixed near the four corners (see POWER_CELLS) — walk
    // the player there directly rather than deriving it, since the exact
    // corner coordinates are an internal implementation detail.
    state.player.r = 1;
    state.player.c = 1;
    state.player.dir = { x: 0, y: 0 };
    state.player.nextDir = { x: 0, y: 0 };
    expect(state.power.has("1,1")).toBe(true);

    // Step once with no movement input first isn't useful since nextDir is
    // zero; instead place the player one cell away and move onto it.
    state.player.r = 1;
    state.player.c = 2;
    const events = step(state, noInput({ moveLeft: true }), 16, PAST_TICK);
    expect(state.player.r).toBe(1);
    expect(state.player.c).toBe(1);
    expect(state.score).toBe(50);
    expect(events.atePower).toBe(true);
    expect(state.scaredUntil).toBeGreaterThan(PAST_TICK);
    expect(state.power.has("1,1")).toBe(false);
  });

  it("does not move before the player tick interval has elapsed", () => {
    const state = withoutGhosts(createState(400, 400));
    const before = { r: state.player.r, c: state.player.c };
    step(state, noInput({ moveRight: true }), 16, 5); // far earlier than TICK_MS (160ms)
    expect(state.player.r).toBe(before.r);
    expect(state.player.c).toBe(before.c);
  });

  it("clearing every dot and power pellet advances to the next wave and awards a bonus", () => {
    const state = withoutGhosts(createState(400, 400));
    state.dots.clear();
    state.power.clear();
    // One more dot placed directly where the player is about to move into
    // (moving vertically to stay clear of pillar-parity issues — see the
    // dot-eating test above), so this step is the one that empties the
    // board and triggers the wave transition in the same tick.
    const key = `${state.player.r + 1},${state.player.c}`;
    state.dots.add(key);
    const scoreBefore = state.score;
    const events = step(state, noInput({ moveDown: true }), 16, PAST_TICK);
    expect(events.wonWave).toBe(true);
    expect(state.wave).toBe(2);
    // +10 for the last dot, +100 wave-clear bonus.
    expect(state.score).toBe(scoreBefore + 110);
    // A fresh round should have been dealt for wave 2.
    expect(state.dots.size).toBeGreaterThan(0);
  });
});
