import { beforeEach, describe, expect, it } from "vitest";
import {
  createProfile,
  recordScore,
  getOverallScore,
  getOverallScoreboard,
  getGameStats,
  getUnlockedAchievementIds,
  getMascotProgress,
  shouldShowBackupNudge,
  markBackupExported,
  dismissBackupNudge,
  importStateJson,
  MAX_PROFILES,
  GAMES,
  type ArcadeState,
} from "./storage";

// storage.ts talks to the real browser localStorage on every mutator (via
// saveState) so persistence "just works" in the app — but that means these
// tests need *some* localStorage to exist. A tiny in-memory polyfill is all
// that's actually required (these tests never assert on persistence itself,
// only on the ArcadeState values the mutators return), so this avoids
// pulling in a full DOM environment (jsdom/happy-dom) just for one global.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: Storage }).localStorage = new MemoryStorage() as unknown as Storage;
});

// A blank slate, built through the same importStateJson() validation/merge
// path a real restored backup goes through, rather than reaching for a
// private defaultState() — every field is deliberately empty/minimal so
// each test only sees the state it explicitly builds up itself.
function freshState(): ArcadeState {
  const result = importStateJson(
    JSON.stringify({ profiles: [], activeProfileId: null, scores: {}, profileStats: {}, settings: {}, backupNudge: {} })
  );
  if (!result.ok) throw new Error(`freshState() setup failed: ${result.reason}`);
  return result.state;
}

describe("createProfile", () => {
  it("adds a profile and makes it active", () => {
    const state = createProfile(freshState(), "Tim");
    expect(state.profiles).toHaveLength(1);
    expect(state.profiles[0].name).toBe("Tim");
    expect(state.activeProfileId).toBe(state.profiles[0].id);
  });

  it("trims and caps names, and falls back to 'Player' for a blank name", () => {
    const state = createProfile(freshState(), "   ");
    expect(state.profiles[0].name).toBe("Player");
    const long = createProfile(freshState(), "A".repeat(40));
    expect(long.profiles[0].name).toHaveLength(16);
  });

  it("refuses to add a profile past MAX_PROFILES", () => {
    let state = freshState();
    for (let i = 0; i < MAX_PROFILES; i++) {
      state = createProfile(state, `Player ${i}`);
    }
    expect(state.profiles).toHaveLength(MAX_PROFILES);
    const attempted = createProfile(state, "One Too Many");
    expect(attempted.profiles).toHaveLength(MAX_PROFILES);
  });
});

describe("recordScore", () => {
  it("rejects an unknown profile id and returns state unchanged", () => {
    const state = freshState();
    const next = recordScore(state, "snake", "nonexistent", 100);
    expect(next).toBe(state);
  });

  it("rejects implausible values (negative, NaN, Infinity) without mutating state", () => {
    let state = createProfile(freshState(), "Tim");
    const profileId = state.activeProfileId!;
    state = recordScore(state, "snake", profileId, -5);
    expect(getGameStats(state, "snake", profileId).myLast).toBeNull();
    state = recordScore(state, "snake", profileId, NaN);
    expect(getGameStats(state, "snake", profileId).myLast).toBeNull();
    state = recordScore(state, "snake", profileId, Infinity);
    expect(getGameStats(state, "snake", profileId).myLast).toBeNull();
  });

  it("tracks my-last, my-best, and arcade-best correctly across multiple runs", () => {
    let state = createProfile(freshState(), "Tim");
    const profileId = state.activeProfileId!;
    state = recordScore(state, "snake", profileId, 50);
    state = recordScore(state, "snake", profileId, 30); // lower — my-last updates, my-best doesn't
    let stats = getGameStats(state, "snake", profileId);
    expect(stats.myLast?.value).toBe(30);
    expect(stats.myBest?.value).toBe(50);
    expect(stats.overallBest?.value).toBe(50);

    state = recordScore(state, "snake", profileId, 90); // new personal best
    stats = getGameStats(state, "snake", profileId);
    expect(stats.myBest?.value).toBe(90);
    expect(stats.overallBest?.value).toBe(90);
  });

  it("only counts personalBestBreaks on runs that actually beat the previous best", () => {
    let state = createProfile(freshState(), "Tim");
    const profileId = state.activeProfileId!;
    state = recordScore(state, "snake", profileId, 10); // first run always counts as a "best"
    state = recordScore(state, "snake", profileId, 5); // doesn't beat it
    state = recordScore(state, "snake", profileId, 20); // beats it
    expect(state.profileStats[profileId]?.personalBestBreaks).toBe(2);
  });

  it("increments totalPlays and sets lastPlayedGame on every run", () => {
    let state = createProfile(freshState(), "Tim");
    const profileId = state.activeProfileId!;
    state = recordScore(state, "snake", profileId, 10);
    state = recordScore(state, "pacman", profileId, 20);
    expect(state.profileStats[profileId]?.totalPlays).toBe(2);
    expect(state.profileStats[profileId]?.lastPlayedGame).toBe("pacman");
  });
});

describe("getOverallScore / getOverallScoreboard", () => {
  it("sums a profile's personal best across every game, treating unplayed games as 0", () => {
    let state = createProfile(freshState(), "Tim");
    const profileId = state.activeProfileId!;
    state = recordScore(state, "snake", profileId, 100);
    state = recordScore(state, "pacman", profileId, 50);
    // Every other game in GAMES is untouched — should contribute 0 each.
    expect(getOverallScore(state, profileId)).toBe(150);
  });

  it("ranks the scoreboard highest overall score first", () => {
    let state = createProfile(freshState(), "Alice");
    const alice = state.activeProfileId!;
    state = createProfile(state, "Bob");
    const bob = state.activeProfileId!;
    state = recordScore(state, "snake", alice, 40);
    state = recordScore(state, "snake", bob, 200);
    const board = getOverallScoreboard(state);
    expect(board[0].profile.name).toBe("Bob");
    expect(board[1].profile.name).toBe("Alice");
  });
});

describe("achievements", () => {
  it("unlocks 'rookie' after one play and nothing else prematurely", () => {
    let state = createProfile(freshState(), "Tim");
    const profileId = state.activeProfileId!;
    state = recordScore(state, "snake", profileId, 10);
    const unlocked = getUnlockedAchievementIds(state, profileId);
    expect(unlocked).toContain("rookie");
    expect(unlocked).not.toContain("world-tour");
    expect(unlocked).not.toContain("century");
  });

  it("unlocks 'world-tour' only once every game in GAMES has been played", () => {
    let state = createProfile(freshState(), "Tim");
    const profileId = state.activeProfileId!;
    for (const meta of GAMES.slice(0, -1)) {
      state = recordScore(state, meta.id, profileId, 10);
    }
    expect(getUnlockedAchievementIds(state, profileId)).not.toContain("world-tour");
    state = recordScore(state, GAMES[GAMES.length - 1].id, profileId, 10);
    expect(getUnlockedAchievementIds(state, profileId)).toContain("world-tour");
  });

  it("unlocks 'century' at exactly 100 total plays, not before", () => {
    let state = createProfile(freshState(), "Tim");
    const profileId = state.activeProfileId!;
    for (let i = 0; i < 99; i++) state = recordScore(state, "snake", profileId, 10);
    expect(getUnlockedAchievementIds(state, profileId)).not.toContain("century");
    state = recordScore(state, "snake", profileId, 10);
    expect(getUnlockedAchievementIds(state, profileId)).toContain("century");
  });
});

describe("getMascotProgress", () => {
  it("starts a brand-new profile at level 1, tier 0, 'New Arcader'", () => {
    const state = createProfile(freshState(), "Tim");
    const progress = getMascotProgress(state, state.activeProfileId);
    expect(progress.level).toBe(1);
    expect(progress.tierIndex).toBe(0);
    expect(progress.title).toBe("New Arcader");
    expect(progress.xp).toBe(0);
  });

  it("returns the zeroed default for no active profile", () => {
    const progress = getMascotProgress(freshState(), null);
    expect(progress.level).toBe(1);
    expect(progress.xp).toBe(0);
  });

  it("levels up as XP-earning stats accumulate", () => {
    let state = createProfile(freshState(), "Tim");
    const profileId = state.activeProfileId!;
    // Play every game once (breadth XP) plus a bunch of plays (10 XP each) —
    // comfortably enough to clear level 1.
    for (const meta of GAMES) state = recordScore(state, meta.id, profileId, 10);
    for (let i = 0; i < 10; i++) state = recordScore(state, "snake", profileId, 10);
    const progress = getMascotProgress(state, profileId);
    expect(progress.level).toBeGreaterThan(1);
    expect(progress.progress).toBeGreaterThanOrEqual(0);
    expect(progress.progress).toBeLessThanOrEqual(1);
  });
});

describe("backup nudge", () => {
  it("stays hidden below the play threshold, and once dismissed or exported", () => {
    let state = createProfile(freshState(), "Tim");
    const profileId = state.activeProfileId!;
    for (let i = 0; i < 14; i++) state = recordScore(state, "snake", profileId, 10);
    expect(shouldShowBackupNudge(state)).toBe(false);

    state = recordScore(state, "snake", profileId, 10); // 15th play crosses the threshold
    expect(shouldShowBackupNudge(state)).toBe(true);

    const dismissed = dismissBackupNudge(state);
    expect(shouldShowBackupNudge(dismissed)).toBe(false);

    const exported = markBackupExported(state);
    expect(shouldShowBackupNudge(exported)).toBe(false);
  });
});
