/**
 * AuthContext — provides auth state and login/logout to the whole app.
 *
 * Flag semantics (deliberately separate — see App.tsx):
 * - isLoading: ONLY the cold-start session restore. App.tsx swaps the whole
 *   tree for a splash while it is true, so no interactive flow may set it.
 * - isAuthenticating: an in-flight login() from the login form. LoginScreen
 *   stays mounted and renders its own spinner from this.
 * - error: the single login-error channel; LoginScreen renders it directly.
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { apiClient } from '../api/client';
import { fullSignOut } from './signOut';

interface IAuthState {
  readonly isLoggedIn: boolean;
  readonly isLoading: boolean;
  readonly isAuthenticating: boolean;
  readonly error: string | null;
  /** Increments on each successful login — key screens on it to refetch after account switches. */
  readonly accountEpoch: number;
}

interface IAuthActions {
  login(email: string, password: string): Promise<void>;
  register(email: string, password: string, name: string): Promise<void>;
  logout(): Promise<void>;
}

type AuthContextValue = IAuthState & IAuthActions;

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  children,
}: {
  readonly children: React.ReactNode;
}): React.ReactElement {
  const [state, setState] = useState<IAuthState>({
    isLoggedIn: false,
    isLoading: true,
    isAuthenticating: false,
    error: null,
    accountEpoch: 0,
  });

  useEffect(() => {
    apiClient
      .isLoggedIn()
      .then((loggedIn) => {
        setState((s) => ({ ...s, isLoggedIn: loggedIn, isLoading: false }));
      })
      .catch(() => {
        setState((s) => ({ ...s, isLoading: false }));
      });

    // When the SERVER rejects a refresh, the session is dead — drop to the
    // login screen. Epoch guard: a straggler request from a previous session
    // (e.g. push registration held open across a re-login) must not purge
    // the tokens the new session just wrote.
    apiClient.onSessionExpired = (epoch: number): void => {
      if (epoch !== apiClient.sessionEpoch) return;
      void apiClient
        .logout()
        .catch(() => undefined)
        .then(() => {
          setState((s) => ({ ...s, isLoggedIn: false }));
        });
    };
    return () => {
      apiClient.onSessionExpired = undefined;
    };
  }, []);

  const register = useCallback(async (email: string, password: string, name: string) => {
    setState((s) => ({ ...s, isAuthenticating: true, error: null }));
    try {
      await apiClient.register(email, password, name);
      setState((s) => ({
        ...s,
        isLoggedIn: true,
        isAuthenticating: false,
        error: null,
        accountEpoch: s.accountEpoch + 1,
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Registration failed';
      setState((s) => ({ ...s, isAuthenticating: false, error: msg }));
      throw err;
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setState((s) => ({ ...s, isAuthenticating: true, error: null }));
    try {
      await apiClient.login(email, password);
      setState((s) => ({
        ...s,
        isLoggedIn: true,
        isAuthenticating: false,
        error: null,
        accountEpoch: s.accountEpoch + 1,
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      setState((s) => ({ ...s, isAuthenticating: false, error: msg }));
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      // Full device purge: portal credentials, sources, ledger, push + auth tokens.
      await fullSignOut();
    } finally {
      setState((s) => ({ ...s, isLoggedIn: false }));
    }
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
