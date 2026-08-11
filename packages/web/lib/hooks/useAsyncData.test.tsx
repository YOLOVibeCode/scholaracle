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
import { ApiClientError } from '@/lib/api/client';

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

  it('should expose structured errorInfo from ApiClientError while keeping error string', async () => {
    const fetchFn = jest
      .fn()
      .mockRejectedValue(
        new ApiClientError('Forbidden', 403, 'FORBIDDEN', undefined, 'req-42')
      );

    const { result } = renderHook(() => useAsyncData(fetchFn));

    await waitFor(() => {
      expect(result.current.error).toBe('Forbidden');
    });

    expect(result.current.errorInfo).toEqual({
      message: 'Forbidden',
      status: 403,
      code: 'FORBIDDEN',
      requestId: 'req-42',
    });
  });

  it('should populate errorInfo with only a message for plain errors', async () => {
    const fetchFn = jest.fn().mockRejectedValue(new Error('plain failure'));

    const { result } = renderHook(() => useAsyncData(fetchFn));

    await waitFor(() => {
      expect(result.current.error).toBe('plain failure');
    });

    expect(result.current.errorInfo).toEqual({ message: 'plain failure' });
  });

  it('should clear errorInfo after a successful retry', async () => {
    const fetchFn = jest
      .fn()
      .mockRejectedValueOnce(new ApiClientError('Down', 503, 'EXTERNAL_SERVICE_ERROR'))
      .mockResolvedValue('recovered');

    const { result } = renderHook(() => useAsyncData(fetchFn));

    await waitFor(() => {
      expect(result.current.errorInfo).not.toBeNull();
    });

    await act(async () => {
      result.current.retry();
    });

    await waitFor(() => {
      expect(result.current.data).toBe('recovered');
    });
    expect(result.current.error).toBeNull();
    expect(result.current.errorInfo).toBeNull();
  });
});

