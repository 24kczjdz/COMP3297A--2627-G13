import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError, GetMe, SignOut as ApiSignOut } from "./api";
import type { Me } from "../shared/types";

type AuthState = {
  me: Me | null;
  ready: boolean;
  error: string | null;
  refresh: () => Promise<Me | null>;
  sign_out: () => Promise<void>;
};

const kAuthContext = createContext<AuthState | null>(null);

/**
 * Summary: Provide the current account and session actions to descendants.
 * Parameters: children contains the React subtree and may be empty.
 * Return Value: The authentication context provider.
 * Side Effects & Constraints: Loads the session on mount and owns account, readiness, and error
 * state.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, SetMe] = useState<Me | null>(null);
  const [ready, SetReady] = useState(false);
  const [error, SetError] = useState<string | null>(null);

  /**
   * Summary: Reload the current profile and quota into authentication state.
   * Parameters: None.
   * Return Value: Resolves with the profile or null after sign-out/failure; failures become visible
   * state.
   * Side Effects & Constraints: Sends GET /api/me; updates account/error/readiness and clears an
   * expired session view.
   */
  const Refresh = useCallback(async () => {
    try {
      const next = await GetMe();
      SetMe(next);
      SetError(null);
      return next;
    } catch (caught) {
      if (caught instanceof ApiError && caught.status_ === 401) {
        SetMe(null);
        SetError(null);
        return null;
      }
      SetError(caught instanceof Error ? caught.message : "LeaveFlowSE is not responding.");
      return null;
    } finally {
      SetReady(true);
    }
  }, []);

  useEffect(() => {
    void Refresh();
  }, [Refresh]);

  /**
   * Summary: End the server session and clear the account context.
   * Parameters: None.
   * Return Value: Resolves after sign-out; request errors propagate to the caller.
   * Side Effects & Constraints: Deletes the session through the API and clears account state on
   * success.
   */
  const SignOut = useCallback(async () => {
    await ApiSignOut();
    SetMe(null);
  }, []);

  const value = useMemo(() => ({ me, ready, error, refresh: Refresh, sign_out: SignOut }), [me, ready, error, Refresh, SignOut]);
  return <kAuthContext.Provider value={value}>{children}</kAuthContext.Provider>;
}

/**
 * Summary: Read the enclosing authentication context.
 * Parameters: None.
 * Return Value: The current authentication state; throws if AuthProvider is missing.
 * Side Effects & Constraints: React hook; call unconditionally inside a component or another hook.
 */
export function useAuth(): AuthState {
  const value = useContext(kAuthContext);
  if (!value) throw new Error("AuthProvider is missing.");
  return value;
}
