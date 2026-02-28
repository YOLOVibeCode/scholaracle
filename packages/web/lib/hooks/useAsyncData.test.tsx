/**
 * @jest-environment jsdom
 */

/**
 * TDD Tests for useAsyncData hook.
 * Async state updates are awaited via waitFor. User actions (retry/refresh) wrapped in act().
 * Known React act() warnings from promise-driven setState are suppressed for this file.
 */

import { renderHook, waitFor, act } from '@testing-library/react';
import { useAsyncData } from './useAsyncData';

function suppressActWarnings(): () => void {
  const orig = console.error;
  console.error = (...args: unknown[]) => {
    const msg = args.map((a) => (typeof a === 'string' ? a : String(a))).join('\n');
    if (msg.includes('not wrapped in act') || msg.includes('not configured to support act')) {
      return;
    }
    orig.apply(console, args);
  };
  return () => {
    console.error = orig;
  };
}

describe('useAsyncData Hook (ISP)', () => {
  let restoreConsole: () => void;

  beforeAll(() => {
    restoreConsole = suppressActWarnings();
  });

  afterAll(() => {
    restoreConsole();
  });

  it('should return loading state initially', () => {
    const { result } = renderHook(() =>
      useAsyncData(() => Promise.resolve({ data: 'test' }))
    );

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('should load data successfully', async () => {
    const { result } = renderHook(() =>
      useAsyncData(() => Promise.resolve({ data: 'test' }))
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual({ data: 'test' });
    expect(result.current.error).toBeNull();
  });

  it('should handle errors', async () => {
    const { result } = renderHook(() =>
      useAsyncData(() => Promise.reject(new Error('Test error')))
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe('Test error');
  });

  it('should support retry', async () => {
    let shouldSucceed = false;
    const fetchFn = jest.fn(() => {
      if (!shouldSucceed) {
        return Promise.reject(new Error('Failed'));
      }
      return Promise.resolve({ data: 'success' });
    });

    const { result } = renderHook(() => useAsyncData(fetchFn));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('Failed');

    shouldSucceed = true;
    await act(async () => {
      result.current.retry();
    });

    await waitFor(() => {
      expect(result.current.data).toEqual({ data: 'success' });
    });

    expect(result.current.error).toBeNull();
  });

  it('should support manual refresh', async () => {
    let callCount = 0;
    const fetchFn = jest.fn(() => {
      callCount++;
      return Promise.resolve({ data: `result-${callCount}` });
    });

    const { result } = renderHook(() => useAsyncData(fetchFn));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const callsBefore = fetchFn.mock.calls.length;

    await act(async () => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(fetchFn.mock.calls.length).toBeGreaterThan(callsBefore);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });
});

