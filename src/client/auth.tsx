import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError, getMe, signOut as apiSignOut } from "./api";
import type { Me } from "../shared/types";

type AuthState = {
  me: Me | null;
  ready: boolean;
  error: string | null;
  refresh: () => Promise<Me | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await getMe();
      setMe(next);
      setError(null);
      return next;
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        setMe(null);
        setError(null);
        return null;
      }
      setError(caught instanceof Error ? caught.message : "LeaveFlowSE is not responding.");
      return null;
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    await apiSignOut();
    setMe(null);
  }, []);

  const value = useMemo(() => ({ me, ready, error, refresh, signOut }), [me, ready, error, refresh, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider is missing.");
  return value;
}
