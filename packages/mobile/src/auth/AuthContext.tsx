/**
 * AuthContext — provides auth state and login/logout to the whole app.
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { apiClient } from '../api/client';

interface IAuthState {
  readonly isLoggedIn: boolean;
  readonly isLoading: boolean;
  readonly error: string | null;
}

interface IAuthActions {
  login(email: string, password: string): Promise<void>;
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
    error: null,
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
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setState((s) => ({ ...s, isLoading: true, error: null }));
    try {
      await apiClient.login(email, password);
      setState((s) => ({ ...s, isLoggedIn: true, isLoading: false }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      setState((s) => ({ ...s, isLoading: false, error: msg }));
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    await apiClient.logout();
    setState((s) => ({ ...s, isLoggedIn: false }));
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
