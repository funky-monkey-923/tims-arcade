import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  loadState,
  createProfile as createProfileFn,
  deleteProfile as deleteProfileFn,
  setActiveProfile as setActiveProfileFn,
  setSettings as setSettingsFn,
  recordScore as recordScoreFn,
  exportStateJson,
  importStateJson,
  getGameStats,
  getProfile,
  getOverallScore,
  getOverallScoreboard,
  getProfileStats,
  getUnlockedAchievementIds,
  getRecentHighlights,
  getMascotProgress,
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
  type ImportResult,
  type MascotProgress,
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
  /** Active profile's cross-game arcade rank (level/title/XP bar) — derived, not stored. Zeroed if no active profile. */
  mascotProgress: MascotProgress;
  /** Serializes everything (profiles, scores, settings) into a downloadable backup file's contents. */
  exportData: () => string;
  /**
   * Restores state from a previously-exported backup file's contents.
   * Replaces the whole app state on success — the caller should confirm
   * with the user first, since this can't be undone.
   */
  importData: (json: string) => ImportResult;
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
    // Uses the setState-updater form (like every other mutator here) rather
    // than reading the `state` closure directly — React threads multiple
    // synchronous setState-with-a-function calls through in order, each
    // seeing the previous one's result, even before any re-render happens.
    // That's what makes this safe against two same-tick calls (e.g. a game
    // engine bug double-firing onGameOver): the second call still sees the
    // first one's write, instead of both computing off the same stale
    // snapshot and one clobbering the other. The synchronous `GameStats`
    // return value (which GameShell needs same-tick, e.g. to know whether
    // this run just set a new high score) is captured via the closure
    // variable below, since the updater's return value only reaches React
    // itself, not this function's caller.
    (gameId: GameId, value: number): GameStats => {
      let result: GameStats | undefined;
      setState((current) => {
        if (!current.activeProfileId) {
          result = getGameStats(current, gameId, current.activeProfileId);
          return current;
        }
        const nextState = recordScoreFn(current, gameId, current.activeProfileId, value);
        result = getGameStats(nextState, gameId, current.activeProfileId);
        return nextState;
      });
      // Non-null: the updater above always assigns `result` before
      // returning, on every branch — TS just can't see that through the
      // setState callback boundary.
      return result!;
    },
    []
  );
  const statsFor = useCallback((gameId: GameId) => getGameStats(state, gameId, state.activeProfileId), [state]);
  const overallScore = useMemo(() => getOverallScore(state, state.activeProfileId), [state]);
  const overallScoreboard = useMemo(() => getOverallScoreboard(state), [state]);
  const profileStats = useMemo(() => getProfileStats(state, state.activeProfileId), [state]);
  const unlockedAchievementIds = useMemo(() => getUnlockedAchievementIds(state, state.activeProfileId), [state]);
  const recentHighlights = useMemo(() => getRecentHighlights(state), [state]);
  const mascotProgress = useMemo(() => getMascotProgress(state, state.activeProfileId), [state]);
  const exportData = useCallback(() => exportStateJson(state), [state]);
  const importData = useCallback((json: string): ImportResult => {
    const result = importStateJson(json);
    if (result.ok) setState(result.state);
    return result;
  }, []);

  const value: ArcadeContextValue = useMemo(
    () => ({
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
      mascotProgress,
      exportData,
      importData,
    }),
    [
      state.profiles,
      activeProfile,
      state.activeProfileId,
      state.settings,
      updateSettings,
      toggleMuted,
      createProfile,
      deleteProfile,
      selectProfile,
      recordScore,
      statsFor,
      overallScore,
      overallScoreboard,
      profileStats,
      unlockedAchievementIds,
      recentHighlights,
      mascotProgress,
      exportData,
      importData,
    ]
  );

  return <ArcadeCtx.Provider value={value}>{children}</ArcadeCtx.Provider>;
}

export function useArcade(): ArcadeContextValue {
  const ctx = useContext(ArcadeCtx);
  if (!ctx) throw new Error("useArcade must be used within ArcadeProvider");
  return ctx;
}
