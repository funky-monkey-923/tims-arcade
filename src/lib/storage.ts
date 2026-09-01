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
}

export interface GameScoreRecord {
  overallBest: OverallBestEntry | null;
  byProfile: Record<string, ProfileScoreRecord>;
}

export interface ArcadeState {
  profiles: Profile[];
  activeProfileId: string | null;
  muted: boolean;
  scores: Partial<Record<GameId, GameScoreRecord>>;
}

export interface GameStats {
  overallBest: OverallBestEntry | null;
  myBest: ScoreEntry | null;
  myLast: ScoreEntry | null;
}

function defaultState(): ArcadeState {
  return {
    profiles: [],
    activeProfileId: null,
    muted: false,
    scores: {},
  };
}

export function loadState(): ArcadeState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as Partial<ArcadeState>;
    return { ...defaultState(), ...parsed };
  } catch {
    return defaultState();
  }
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
  const next: ArcadeState = { ...state, profiles, activeProfileId };
  saveState(next);
  return next;
}

export function setActiveProfile(state: ArcadeState, profileId: string): ArcadeState {
  const next: ArcadeState = { ...state, activeProfileId: profileId };
  saveState(next);
  return next;
}

export function setMuted(state: ArcadeState, muted: boolean): ArcadeState {
  const next: ArcadeState = { ...state, muted };
  saveState(next);
  return next;
}

export function getProfile(state: ArcadeState, profileId: string | null): Profile | null {
  return state.profiles.find((p) => p.id === profileId) ?? null;
}

export function recordScore(state: ArcadeState, gameId: GameId, profileId: string, value: number): ArcadeState {
  const profile = getProfile(state, profileId);
  if (!profile) return state;
  const now = new Date().toISOString();
  const scores = { ...state.scores };
  const game: GameScoreRecord = scores[gameId] ? { ...scores[gameId]! } : { overallBest: null, byProfile: {} };
  game.byProfile = { ...game.byProfile };

  const prevForProfile = game.byProfile[profileId] ?? { best: null, last: null };
  const best = prevForProfile.best && prevForProfile.best.value >= value ? prevForProfile.best : { value, date: now };
  game.byProfile[profileId] = { best, last: { value, date: now } };

  if (!game.overallBest || value > game.overallBest.value) {
    game.overallBest = { value, profileId, profileName: profile.name, avatar: profile.avatar, date: now };
  }

  scores[gameId] = game;
  const next: ArcadeState = { ...state, scores };
  saveState(next);
  return next;
}

export function getGameStats(state: ArcadeState, gameId: GameId, profileId: string | null): GameStats {
  const game = state.scores[gameId];
  const overallBest = game?.overallBest ?? null;
  const mine = profileId ? game?.byProfile?.[profileId] : undefined;
  return {
    overallBest,
    myBest: mine?.best ?? null,
    myLast: mine?.last ?? null,
  };
}

export { MAX_PROFILES };
