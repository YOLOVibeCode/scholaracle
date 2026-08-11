/**
 * useAsyncData Hook (ISP)
 * 
 * Small, focused interface for async data loading with error handling and retry.
 * Follows Interface Segregation Principle - does one thing well.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { ApiClientError } from '@/lib/api/client';

/** Structured error info preserved from ApiClientError (status/code/requestId). */
export interface IAsyncError {
  readonly message: string;
  readonly status?: number;
  readonly code?: string;
  readonly requestId?: string;
}

export interface IUseAsyncDataResult<T> {
  readonly data: T | null;
  readonly isLoading: boolean;
  readonly error: string | null;
  /** Structured error details — lets pages branch on 403 vs 500, show requestId, etc. */
  readonly errorInfo: IAsyncError | null;
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
  const [errorInfo, setErrorInfo] = useState<IAsyncError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchFnRef = useRef(fetchFn);
  fetchFnRef.current = fetchFn;

  const loadData = useCallback(async () => {
    // If there is a pending retry timer from a previous failure, cancel it.
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    setIsLoading(true);
    setError(null);
    setErrorInfo(null);

    try {
      const result = await fetchFnRef.current();
      setData(result);
      setError(null);
      setErrorInfo(null);
      setAttempt(0);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMessage);
      setErrorInfo(
        err instanceof ApiClientError
          ? { message: err.message, status: err.status, code: err.code, requestId: err.requestId }
          : { message: errorMessage }
      );
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
  }, [attempt, retryCount, retryDelay]);

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
    setErrorInfo(null);
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  const refresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  return {
    data,
    isLoading,
    error,
    errorInfo,
    retry,
    refresh,
  };
}

