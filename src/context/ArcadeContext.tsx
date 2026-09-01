import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  loadState,
  createProfile as createProfileFn,
  deleteProfile as deleteProfileFn,
  setActiveProfile as setActiveProfileFn,
  setMuted as setMutedFn,
  recordScore as recordScoreFn,
  getGameStats,
  getProfile,
  GAMES,
  MAX_PROFILES,
  type GameId,
  type GameMeta,
  type GameStats,
  type Profile,
} from "../lib/storage";
import { engine } from "../lib/audio";

interface ArcadeContextValue {
  profiles: Profile[];
  activeProfile: Profile | null;
  activeProfileId: string | null;
  muted: boolean;
  games: GameMeta[];
  maxProfiles: number;
  createProfile: (name: string, avatar?: string) => void;
  deleteProfile: (id: string) => void;
  selectProfile: (id: string) => void;
  toggleMuted: () => void;
  recordScore: (gameId: GameId, value: number) => void;
  statsFor: (gameId: GameId) => GameStats;
}

const ArcadeCtx = createContext<ArcadeContextValue | null>(null);

export function ArcadeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(() => loadState());

  useEffect(() => {
    engine.setMuted(state.muted);
  }, [state.muted]);

  const activeProfile = useMemo(() => getProfile(state, state.activeProfileId), [state]);

  const createProfile = useCallback((name: string, avatar?: string) => setState((s) => createProfileFn(s, name, avatar)), []);
  const deleteProfile = useCallback((id: string) => setState((s) => deleteProfileFn(s, id)), []);
  const selectProfile = useCallback((id: string) => setState((s) => setActiveProfileFn(s, id)), []);
  const toggleMuted = useCallback(() => setState((s) => setMutedFn(s, !s.muted)), []);
  const recordScore = useCallback(
    (gameId: GameId, value: number) => setState((s) => (s.activeProfileId ? recordScoreFn(s, gameId, s.activeProfileId, value) : s)),
    []
  );
  const statsFor = useCallback((gameId: GameId) => getGameStats(state, gameId, state.activeProfileId), [state]);

  const value: ArcadeContextValue = {
    profiles: state.profiles,
    activeProfile,
    activeProfileId: state.activeProfileId,
    muted: state.muted,
    games: GAMES,
    maxProfiles: MAX_PROFILES,
    createProfile,
    deleteProfile,
    selectProfile,
    toggleMuted,
    recordScore,
    statsFor,
  };

  return <ArcadeCtx.Provider value={value}>{children}</ArcadeCtx.Provider>;
}

export function useArcade(): ArcadeContextValue {
  const ctx = useContext(ArcadeCtx);
  if (!ctx) throw new Error("useArcade must be used within ArcadeProvider");
  return ctx;
}
