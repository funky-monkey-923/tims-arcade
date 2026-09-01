// Local persistence for profiles and scores. No backend — everything lives in
// the browser's localStorage so the app works fully offline.

const STORAGE_KEY = "tims-arcade:v1";
const MAX_PROFILES = 6;

export type GameId = "pacman" | "snake" | "invaders" | "fighter" | "soccer" | "racing";
export type AccentColor = "coral" | "teal" | "sun" | "lime";

export interface GameMeta {
  id: GameId;
  title: string;
  subtitle: string;
  color: AccentColor;
}

export const GAMES: GameMeta[] = [
  { id: "pacman", title: "Munch Maze", subtitle: "Pac-Man style", color: "sun" },
  { id: "snake", title: "Wiggle Worm", subtitle: "Snake style", color: "lime" },
  { id: "invaders", title: "Star Defender", subtitle: "Space Invaders style", color: "coral" },
  { id: "fighter", title: "Rumble Ring", subtitle: "Fighting style", color: "coral" },
  { id: "soccer", title: "Kickoff Clash", subtitle: "2D soccer", color: "lime" },
  { id: "racing", title: "Turbo Dash", subtitle: "Racing style", color: "teal" },
];

export const AVATARS = ["🐵", "🐸", "🦊", "🐼", "🦄", "🐯", "🐙", "🐶", "🐱", "🦁", "🐨", "🐰"] as const;
export const PROFILE_COLORS: AccentColor[] = ["coral", "teal", "sun", "lime"];

export interface Profile {
  id: string;
  name: string;
  avatar: string;
  color: AccentColor;
  createdAt: string;
}

export interface ScoreEntry {
  value: number;
  date: string;
}

export interface OverallBestEntry extends ScoreEntry {
  profileId: string;
  profileName: string;
  avatar: string;
}

export interface ProfileScoreRecord {
  best: ScoreEntry | null;
  last: ScoreEntry | null;
  // Most-recent-last, capped at HISTORY_LIMIT (see recordScore) — just
  // enough to draw a short trend sparkline on the Leaderboard, not a full
  // audit log.
  history: ScoreEntry[];
}

const HISTORY_LIMIT = 10;

export interface GameScoreRecord {
  overallBest: OverallBestEntry | null;
  byProfile: Record<string, ProfileScoreRecord>;
}

// Per-profile stats that aren't tied to any one game — the raw ingredients
// the achievements catalog below checks against. Kept separate from
// `Profile` itself (which is just identity: name/avatar/color) so identity
// and stats can evolve independently.
export interface ProfileStats {
  totalPlays: number;
  lastPlayedDate: string | null; // YYYY-MM-DD, local calendar date
  currentStreak: number;
  longestStreak: number;
  // How many times, across every game, this profile has beaten its own
  // previous personal best. Distinct from `totalPlays` (most runs don't set
  // a new best) and from any one game's `best` (this is a cumulative count
  // across all 6 games).
  personalBestBreaks: number;
}

function defaultProfileStats(): ProfileStats {
  return { totalPlays: 0, lastPlayedDate: null, currentStreak: 0, longestStreak: 0, personalBestBreaks: 0 };
}

function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysBetween(a: string, b: string): number {
  // Both are YYYY-MM-DD; parsing as UTC midnight keeps this immune to
  // DST shifts messing with the day count.
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / msPerDay);
}

// App-wide settings, separate from any one profile's data (a household
// arcade cabinet's volume mix is a property of the room, not of who's
// playing). `musicVolume`/`sfxVolume` are 0-1 sliders; `musicMuted`/
// `sfxMuted` are independent quick-mute toggles so a kid can silence just
// the music (e.g. to hear a parent) or just the sound effects (e.g. late at
// night) without losing their preferred volume level for either.
// `reducedMotion` dials back particles/screen-shake/flash effects across
// every game; defaults to following the OS-level prefers-reduced-motion
// media query the first time settings are created (see defaultState below),
// but can be overridden either way from the settings panel.
export interface ArcadeSettings {
  musicVolume: number;
  sfxVolume: number;
  musicMuted: boolean;
  sfxMuted: boolean;
  reducedMotion: boolean;
}

const DEFAULT_AUDIO_SETTINGS: Pick<ArcadeSettings, "musicVolume" | "sfxVolume" | "musicMuted" | "sfxMuted"> = {
  // 1.0 = the same loudness the app always shipped with (audio.ts applies
  // its own internal music/sfx balance on top of this user-facing slider),
  // so a fresh install sounds identical to before this setting existed.
  musicVolume: 1,
  sfxVolume: 1,
  musicMuted: false,
  sfxMuted: false,
};

function prefersReducedMotion(): boolean {
  try {
    return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  } catch {
    return false;
  }
}

export interface ArcadeState {
  profiles: Profile[];
  activeProfileId: string | null;
  settings: ArcadeSettings;
  scores: Partial<Record<GameId, GameScoreRecord>>;
  profileStats: Partial<Record<string, ProfileStats>>;
}

// ---- Scoring model ---------------------------------------------------
// Four score tiers, from most to least ephemeral. Naming here matches the
// product vision's vocabulary so this comment can serve as the map between
// "what the user asked for" and "what the code calls it":
//   - last score    -> ScoreEntry stored as ProfileScoreRecord.last / GameStats.myLast
//                      (the most recent run, replaced every play, no matter how it scored)
//   - personal best -> ScoreEntry stored as ProfileScoreRecord.best / GameStats.myBest
//                      (a single profile's best-ever run of one game)
//   - arcade best   -> OverallBestEntry stored as GameScoreRecord.overallBest / GameStats.overallBest
//                      (the best run of one game across every local profile — "Top Player")
//   - overall score -> not stored, always derived (see getOverallScore below):
//                      one profile's personal-best summed across every game in GAMES.
//                      Rewards playing (and getting good at) the whole arcade, not just one game.
// A fifth tier, "online/global best", is out of scope for now — this app has
// no backend, so any cross-device leaderboard is a future, server-backed
// feature, not something this local scoring model needs to account for today.
export interface GameStats {
  overallBest: OverallBestEntry | null;
  myBest: ScoreEntry | null;
  myLast: ScoreEntry | null;
  /** Most-recent-last, capped at 10 — see ProfileScoreRecord.history. */
  myHistory: ScoreEntry[];
}

function defaultState(): ArcadeState {
  return {
    profiles: [],
    activeProfileId: null,
    settings: { ...DEFAULT_AUDIO_SETTINGS, reducedMotion: prefersReducedMotion() },
    scores: {},
    profileStats: {},
  };
}

export function loadState(): ArcadeState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as Partial<ArcadeState>;
    if (!isPlausibleState(parsed)) return defaultState();
    // Shallow-spreading `parsed.settings` over the defaults (rather than
    // just `...parsed`) means a settings blob saved before a new field
    // existed (e.g. `reducedMotion` didn't exist yet) still gets a sane
    // default for the missing field, instead of silently losing it to
    // `undefined`.
    const base = defaultState();
    return { ...base, ...parsed, settings: { ...base.settings, ...parsed.settings } };
  } catch {
    return defaultState();
  }
}

// Guards against malformed-but-valid JSON (hand-edited devtools, a future
// schema change, corruption) putting non-array/non-object values where the
// rest of the app assumes an array/object shape — e.g. `deleteProfile`'s
// `state.profiles.filter(...)` would throw if `profiles` were a string or
// number. Deliberately shallow: just enough to stop a crash, not a full
// schema validator.
function isPlausibleState(parsed: unknown): parsed is Partial<ArcadeState> {
  if (!parsed || typeof parsed !== "object") return false;
  const p = parsed as Partial<ArcadeState>;
  if (p.profiles !== undefined && !Array.isArray(p.profiles)) return false;
  if (p.scores !== undefined && (typeof p.scores !== "object" || p.scores === null || Array.isArray(p.scores))) return false;
  if (p.activeProfileId !== undefined && p.activeProfileId !== null && typeof p.activeProfileId !== "string") return false;
  if (p.settings !== undefined && (typeof p.settings !== "object" || p.settings === null || Array.isArray(p.settings))) return false;
  if (p.profileStats !== undefined && (typeof p.profileStats !== "object" || p.profileStats === null || Array.isArray(p.profileStats))) return false;
  return true;
}

export function saveState(state: ArcadeState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage unavailable (private mode, quota, etc.) — fail silently, app still works this session
  }
}

export function createProfile(state: ArcadeState, name: string, avatar?: string): ArcadeState {
  if (state.profiles.length >= MAX_PROFILES) return state;
  const usedColors = new Set(state.profiles.map((p) => p.color));
  const color = PROFILE_COLORS.find((c) => !usedColors.has(c)) ?? PROFILE_COLORS[state.profiles.length % PROFILE_COLORS.length];
  const profile: Profile = {
    id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim().slice(0, 16) || "Player",
    avatar: avatar || AVATARS[state.profiles.length % AVATARS.length],
    color,
    createdAt: new Date().toISOString(),
  };
  const next: ArcadeState = { ...state, profiles: [...state.profiles, profile], activeProfileId: profile.id };
  saveState(next);
  return next;
}

export function deleteProfile(state: ArcadeState, profileId: string): ArcadeState {
  const profiles = state.profiles.filter((p) => p.id !== profileId);
  const activeProfileId = state.activeProfileId === profileId ? null : state.activeProfileId;
  const scores = pruneProfileFromScores(state.scores, profileId, profiles);
  const profileStats = { ...state.profileStats };
  delete profileStats[profileId];
  const next: ArcadeState = { ...state, profiles, activeProfileId, scores, profileStats };
  saveState(next);
  return next;
}

// Deleting a profile shouldn't leave its scores behind forever: without
// this, a deleted profile's name/avatar keeps showing up as "Top Player" on
// the Leaderboard indefinitely, with no way to ever clear it. Removes the
// deleted profile's own record for every game, and — only if that profile
// happened to hold the overall best — recomputes the new overall best from
// whichever profiles remain (using `remainingProfiles` to look up the
// name/avatar to display, since ProfileScoreRecord itself doesn't carry
// them).
function pruneProfileFromScores(
  scores: Partial<Record<GameId, GameScoreRecord>>,
  profileId: string,
  remainingProfiles: Profile[]
): Partial<Record<GameId, GameScoreRecord>> {
  const profileById = new Map(remainingProfiles.map((p) => [p.id, p]));
  const next: Partial<Record<GameId, GameScoreRecord>> = {};
  for (const [gameId, game] of Object.entries(scores) as [GameId, GameScoreRecord][]) {
    if (!game.byProfile[profileId] && game.overallBest?.profileId !== profileId) {
      next[gameId] = game;
      continue;
    }
    const byProfile = { ...game.byProfile };
    delete byProfile[profileId];
    let overallBest = game.overallBest;
    if (overallBest?.profileId === profileId) {
      overallBest = Object.entries(byProfile).reduce<OverallBestEntry | null>((best, [pid, record]) => {
        if (!record.best) return best;
        if (best && record.best.value <= best.value) return best;
        const owner = profileById.get(pid);
        if (!owner) return best; // shouldn't happen, but don't credit a score to a profile we can't find
        return { value: record.best.value, date: record.best.date, profileId: pid, profileName: owner.name, avatar: owner.avatar };
      }, null);
    }
    next[gameId] = { overallBest, byProfile };
  }
  return next;
}

export function setActiveProfile(state: ArcadeState, profileId: string): ArcadeState {
  const next: ArcadeState = { ...state, activeProfileId: profileId };
  saveState(next);
  return next;
}

export function setSettings(state: ArcadeState, patch: Partial<ArcadeSettings>): ArcadeState {
  const next: ArcadeState = { ...state, settings: { ...state.settings, ...patch } };
  saveState(next);
  return next;
}

export function getProfile(state: ArcadeState, profileId: string | null): Profile | null {
  return state.profiles.find((p) => p.id === profileId) ?? null;
}

export function recordScore(state: ArcadeState, gameId: GameId, profileId: string, value: number): ArcadeState {
  const profile = getProfile(state, profileId);
  if (!profile) return state;
  // Reject anything that isn't a plausible score outright, rather than
  // letting NaN/Infinity/negative values get written and corrupt the
  // leaderboard permanently — a game-logic bug elsewhere shouldn't be able
  // to brick every player's "top score" display.
  if (!Number.isFinite(value) || value < 0) return state;
  const now = new Date().toISOString();
  const scores = { ...state.scores };
  const game: GameScoreRecord = scores[gameId] ? { ...scores[gameId]! } : { overallBest: null, byProfile: {} };
  game.byProfile = { ...game.byProfile };

  const prevForProfile = game.byProfile[profileId] ?? { best: null, last: null, history: [] };
  const isNewPersonalBest = !prevForProfile.best || value > prevForProfile.best.value;
  const best = isNewPersonalBest ? { value, date: now } : prevForProfile.best;
  const history = [...prevForProfile.history, { value, date: now }].slice(-HISTORY_LIMIT);
  game.byProfile[profileId] = { best, last: { value, date: now }, history };

  if (!game.overallBest || value > game.overallBest.value) {
    game.overallBest = { value, profileId, profileName: profile.name, avatar: profile.avatar, date: now };
  }

  scores[gameId] = game;

  // Roll the profile-wide play stats forward: a run today either extends
  // yesterday's streak, starts a fresh one (first play, or a gap of 2+
  // days), or is a same-day repeat (streak unchanged either way).
  const prevStats = state.profileStats[profileId] ?? defaultProfileStats();
  const today = todayLocal();
  let currentStreak = prevStats.currentStreak;
  if (prevStats.lastPlayedDate === null || daysBetween(prevStats.lastPlayedDate, today) >= 2) {
    currentStreak = 1;
  } else if (daysBetween(prevStats.lastPlayedDate, today) === 1) {
    currentStreak = prevStats.currentStreak + 1;
  } // daysBetween === 0 (same day): streak unchanged
  const profileStats: ArcadeState["profileStats"] = {
    ...state.profileStats,
    [profileId]: {
      totalPlays: prevStats.totalPlays + 1,
      lastPlayedDate: today,
      currentStreak,
      longestStreak: Math.max(prevStats.longestStreak, currentStreak),
      personalBestBreaks: prevStats.personalBestBreaks + (isNewPersonalBest ? 1 : 0),
    },
  };

  const next: ArcadeState = { ...state, scores, profileStats };
  saveState(next);
  return next;
}

export function getProfileStats(state: ArcadeState, profileId: string | null): ProfileStats {
  return (profileId && state.profileStats[profileId]) || defaultProfileStats();
}

export function getGameStats(state: ArcadeState, gameId: GameId, profileId: string | null): GameStats {
  const game = state.scores[gameId];
  const overallBest = game?.overallBest ?? null;
  const mine = profileId ? game?.byProfile?.[profileId] : undefined;
  return {
    overallBest,
    myBest: mine?.best ?? null,
    myLast: mine?.last ?? null,
    myHistory: mine?.history ?? [],
  };
}

// "Overall Score" = the sum of a profile's personal best across every game
// in the arcade (per the user's own definition). A game the profile has
// never played contributes 0, same as a game they've played but never
// scored above zero in — this rewards breadth (try every game) as well as
// depth (get good at each one), without punishing a profile for skipping a
// game they don't enjoy beyond just not gaining those points.
export function getOverallScore(state: ArcadeState, profileId: string | null): number {
  if (!profileId) return 0;
  return GAMES.reduce((sum, meta) => {
    const best = state.scores[meta.id]?.byProfile?.[profileId]?.best;
    return sum + (best?.value ?? 0);
  }, 0);
}

export interface OverallScoreEntry {
  profile: Profile;
  overallScore: number;
  gamesPlayed: number;
}

// A ranked-by-overall-score view across every local profile, for a
// "who's the arcade champion overall" summary — distinct from any single
// game's "arcade best", since it's the sum across all 6 games rather than
// the top score in just one.
export function getOverallScoreboard(state: ArcadeState): OverallScoreEntry[] {
  return state.profiles
    .map((profile) => {
      const gamesPlayed = GAMES.reduce(
        (count, meta) => count + (state.scores[meta.id]?.byProfile?.[profile.id]?.best ? 1 : 0),
        0
      );
      return { profile, overallScore: getOverallScore(state, profile.id), gamesPlayed };
    })
    .sort((a, b) => b.overallScore - a.overallScore);
}

// ---- Recent highlights --------------------------------------------------
// A lightweight "recent activity" feed for the menu's attract-mode ticker —
// built from data already stored (each profile's `last` play per game),
// not a separate event log, so it stays in sync automatically and doesn't
// grow storage. Distinguishes "just set a new best" from "just played"
// by checking whether `last` and `best` are the same run.
export interface HighlightEntry {
  profileName: string;
  avatar: string;
  gameTitle: string;
  value: number;
  date: string;
  isNewBest: boolean;
}

export function getRecentHighlights(state: ArcadeState, limit = 8): HighlightEntry[] {
  const profileById = new Map(state.profiles.map((p) => [p.id, p]));
  const entries: HighlightEntry[] = [];
  for (const meta of GAMES) {
    const game = state.scores[meta.id];
    if (!game) continue;
    for (const [profileId, record] of Object.entries(game.byProfile)) {
      const profile = profileById.get(profileId);
      if (!profile || !record.last) continue;
      const isNewBest = !!record.best && record.best.value === record.last.value && record.best.date === record.last.date;
      entries.push({
        profileName: profile.name,
        avatar: profile.avatar,
        gameTitle: meta.title,
        value: record.last.value,
        date: record.last.date,
        isNewBest,
      });
    }
  }
  return entries.sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, limit);
}

// ---- Achievements ------------------------------------------------------
// A small, fixed badge catalog — deliberately not data-driven/extensible
// (no admin UI, no remote config), since this is a local single-family
// arcade, not a live-ops game. Unlock state is never stored: it's always
// derived from `scores`/`profileStats` (see getUnlockedAchievementIds), the
// same "derive, don't duplicate" approach as getOverallScore — so there's
// no way for stored unlock flags to drift out of sync with the stats that
// actually earned them.
export type AchievementId = "rookie" | "world-tour" | "streak-3" | "streak-7" | "pb-x3" | "top-player" | "century";

export interface AchievementMeta {
  id: AchievementId;
  title: string;
  description: string;
  icon: string;
}

export const ACHIEVEMENTS: AchievementMeta[] = [
  { id: "rookie", title: "Arcade Rookie", description: "Play your first game", icon: "🎮" },
  { id: "world-tour", title: "World Tour", description: "Play every game in the arcade at least once", icon: "🗺️" },
  { id: "streak-3", title: "On a Roll", description: "Play 3 days in a row", icon: "🔥" },
  { id: "streak-7", title: "Week-Long Legend", description: "Play 7 days in a row", icon: "🌟" },
  { id: "pb-x3", title: "Personal Best Hunter", description: "Beat your own best score 3 times", icon: "📈" },
  { id: "top-player", title: "Top Player", description: "Hold the arcade-best score in any game", icon: "👑" },
  { id: "century", title: "Century Club", description: "Play 100 rounds total", icon: "💯" },
];

export function getUnlockedAchievementIds(state: ArcadeState, profileId: string | null): AchievementId[] {
  if (!profileId) return [];
  const stats = getProfileStats(state, profileId);
  const unlocked: AchievementId[] = [];
  if (stats.totalPlays >= 1) unlocked.push("rookie");
  if (GAMES.every((g) => state.scores[g.id]?.byProfile?.[profileId] != null)) unlocked.push("world-tour");
  if (stats.longestStreak >= 3) unlocked.push("streak-3");
  if (stats.longestStreak >= 7) unlocked.push("streak-7");
  if (stats.personalBestBreaks >= 3) unlocked.push("pb-x3");
  if (GAMES.some((g) => state.scores[g.id]?.overallBest?.profileId === profileId)) unlocked.push("top-player");
  if (stats.totalPlays >= 100) unlocked.push("century");
  return unlocked;
}

export { MAX_PROFILES };
