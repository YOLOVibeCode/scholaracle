/**
 * useAsyncData Hook (ISP)
 * 
 * Small, focused interface for async data loading with error handling and retry.
 * Follows Interface Segregation Principle - does one thing well.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export interface IUseAsyncDataResult<T> {
  readonly data: T | null;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly retry: () => void;
  readonly refresh: () => void;
}

export interface IUseAsyncDataOptions {
  readonly retryCount?: number;
  readonly retryDelay?: number;
  readonly autoRefresh?: boolean;
  readonly refreshInterval?: number;
}

/**
 * Hook for loading async data with error handling and retry.
 * 
 * @param fetchFn - Function that returns a promise with the data
 * @param options - Configuration options
 * @returns Async data state and control functions
 */
export function useAsyncData<T>(
  fetchFn: () => Promise<T>,
  options: IUseAsyncDataOptions = {}
): IUseAsyncDataResult<T> {
  const { retryCount = 0, retryDelay = 1000, autoRefresh = false, refreshInterval = 30000 } = options;

  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadData = useCallback(async () => {
    // If there is a pending retry timer from a previous failure, cancel it.
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await fetchFn();
      setData(result);
      setError(null);
      setAttempt(0);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMessage);
      setData(null);

      // Retry logic - only auto-retry if we haven't exceeded retry count
      if (attempt < retryCount) {
        retryTimeoutRef.current = setTimeout(() => {
          setAttempt((prev) => prev + 1);
        }, retryDelay);
      }
    } finally {
      setIsLoading(false);
    }
  }, [fetchFn, attempt, retryCount, retryDelay]);

  useEffect(() => {
    void loadData();
  }, [loadData, refreshTrigger, attempt]);

  // Cleanup any pending retry timers on unmount.
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
  }, []);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh || isLoading) return;

    const interval = setInterval(() => {
      setRefreshTrigger((prev) => prev + 1);
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, isLoading]);

  const retry = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    setAttempt(0);
    setError(null);
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  const refresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  return {
    data,
    isLoading,
    error,
    retry,
    refresh,
  };
}

