import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  loadState,
  createProfile as createProfileFn,
  deleteProfile as deleteProfileFn,
  setActiveProfile as setActiveProfileFn,
  setSettings as setSettingsFn,
  recordScore as recordScoreFn,
  getGameStats,
  getProfile,
  getOverallScore,
  getOverallScoreboard,
  getProfileStats,
  getUnlockedAchievementIds,
  getRecentHighlights,
  ACHIEVEMENTS,
  GAMES,
  MAX_PROFILES,
  type GameId,
  type GameMeta,
  type GameStats,
  type Profile,
  type OverallScoreEntry,
  type ArcadeSettings,
  type ProfileStats,
  type AchievementId,
  type AchievementMeta,
  type HighlightEntry,
} from "../lib/storage";
import { engine } from "../lib/audio";

interface ArcadeContextValue {
  profiles: Profile[];
  activeProfile: Profile | null;
  activeProfileId: string | null;
  settings: ArcadeSettings;
  updateSettings: (patch: Partial<ArcadeSettings>) => void;
  /** Quick "mute everything"/"unmute everything" toggle for a single button (e.g. TopBar). */
  toggleMuted: () => void;
  games: GameMeta[];
  maxProfiles: number;
  createProfile: (name: string, avatar?: string) => void;
  deleteProfile: (id: string) => void;
  selectProfile: (id: string) => void;
  recordScore: (gameId: GameId, value: number) => GameStats;
  statsFor: (gameId: GameId) => GameStats;
  /** Active profile's Overall Score: the sum of their personal best across every game. */
  overallScore: number;
  /** Every local profile's Overall Score, ranked highest first. */
  overallScoreboard: OverallScoreEntry[];
  /** Active profile's play stats (streaks, total plays, etc). Zeroed if no active profile. */
  profileStats: ProfileStats;
  /** The full achievement catalog (locked + unlocked) — pair with unlockedAchievementIds. */
  achievements: AchievementMeta[];
  /** IDs of achievements the active profile has unlocked. */
  unlockedAchievementIds: AchievementId[];
  /** Recent activity across every profile, newest first — for the menu's attract-mode ticker. */
  recentHighlights: HighlightEntry[];
}

const ArcadeCtx = createContext<ArcadeContextValue | null>(null);

export function ArcadeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(() => loadState());

  useEffect(() => {
    engine.setMusicVolume(state.settings.musicVolume);
    engine.setSfxVolume(state.settings.sfxVolume);
    engine.setMusicMuted(state.settings.musicMuted);
    engine.setSfxMuted(state.settings.sfxMuted);
  }, [state.settings]);

  const activeProfile = useMemo(() => getProfile(state, state.activeProfileId), [state]);

  const createProfile = useCallback((name: string, avatar?: string) => setState((s) => createProfileFn(s, name, avatar)), []);
  const deleteProfile = useCallback((id: string) => setState((s) => deleteProfileFn(s, id)), []);
  const selectProfile = useCallback((id: string) => setState((s) => setActiveProfileFn(s, id)), []);
  const updateSettings = useCallback((patch: Partial<ArcadeSettings>) => setState((s) => setSettingsFn(s, patch)), []);
  const toggleMuted = useCallback(() => {
    setState((s) => {
      const bothMuted = s.settings.musicMuted && s.settings.sfxMuted;
      return setSettingsFn(s, { musicMuted: !bothMuted, sfxMuted: !bothMuted });
    });
  }, []);
  const recordScore = useCallback(
    // Computes the next state directly (rather than via the setState-updater
    // form) so it can synchronously return the freshly-computed GameStats to
    // the caller. GameShell needs this same-tick, e.g. to decide whether this
    // run just set a new high score — reading `state` via a separate
    // `statsFor()` call right after `recordScore()` would still see the
    // pre-write snapshot, since React state updates aren't applied until the
    // next render.
    (gameId: GameId, value: number): GameStats => {
      if (!state.activeProfileId) return getGameStats(state, gameId, state.activeProfileId);
      const nextState = recordScoreFn(state, gameId, state.activeProfileId, value);
      setState(nextState);
      return getGameStats(nextState, gameId, state.activeProfileId);
    },
    [state]
  );
  const statsFor = useCallback((gameId: GameId) => getGameStats(state, gameId, state.activeProfileId), [state]);
  const overallScore = useMemo(() => getOverallScore(state, state.activeProfileId), [state]);
  const overallScoreboard = useMemo(() => getOverallScoreboard(state), [state]);
  const profileStats = useMemo(() => getProfileStats(state, state.activeProfileId), [state]);
  const unlockedAchievementIds = useMemo(() => getUnlockedAchievementIds(state, state.activeProfileId), [state]);
  const recentHighlights = useMemo(() => getRecentHighlights(state), [state]);

  const value: ArcadeContextValue = {
    profiles: state.profiles,
    activeProfile,
    activeProfileId: state.activeProfileId,
    settings: state.settings,
    updateSettings,
    toggleMuted,
    games: GAMES,
    maxProfiles: MAX_PROFILES,
    createProfile,
    deleteProfile,
    selectProfile,
    recordScore,
    statsFor,
    overallScore,
    overallScoreboard,
    profileStats,
    achievements: ACHIEVEMENTS,
    unlockedAchievementIds,
    recentHighlights,
  };

  return <ArcadeCtx.Provider value={value}>{children}</ArcadeCtx.Provider>;
}

export function useArcade(): ArcadeContextValue {
  const ctx = useContext(ArcadeCtx);
  if (!ctx) throw new Error("useArcade must be used within ArcadeProvider");
  return ctx;
}
