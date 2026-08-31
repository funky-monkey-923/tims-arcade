import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
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
} from "../lib/storage";
import { engine } from "../lib/audio";

const ArcadeCtx = createContext(null);

export function ArcadeProvider({ children }) {
  const [state, setState] = useState(() => loadState());

  useEffect(() => {
    engine.setMuted(state.muted);
  }, [state.muted]);

  const activeProfile = useMemo(() => getProfile(state, state.activeProfileId), [state]);

  const createProfile = useCallback((name, avatar) => setState((s) => createProfileFn(s, name, avatar)), []);
  const deleteProfile = useCallback((id) => setState((s) => deleteProfileFn(s, id)), []);
  const selectProfile = useCallback((id) => setState((s) => setActiveProfileFn(s, id)), []);
  const toggleMuted = useCallback(() => setState((s) => setMutedFn(s, !s.muted)), []);
  const recordScore = useCallback(
    (gameId, value) =>
      setState((s) => (s.activeProfileId ? recordScoreFn(s, gameId, s.activeProfileId, value) : s)),
    []
  );
  const statsFor = useCallback((gameId) => getGameStats(state, gameId, state.activeProfileId), [state]);

  const value = {
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

export function useArcade() {
  const ctx = useContext(ArcadeCtx);
  if (!ctx) throw new Error("useArcade must be used within ArcadeProvider");
  return ctx;
}
