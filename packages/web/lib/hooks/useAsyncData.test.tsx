/**
 * @jest-environment jsdom
 */

/**
 * TDD Tests for useAsyncData hook
 *
 * Following ISP: Small, focused interface for async data loading
 */

import { renderHook, waitFor } from '@testing-library/react';
import { useAsyncData } from './useAsyncData';

describe('useAsyncData Hook (ISP)', () => {
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
    // Track whether we should succeed — allows any number of React double-invokes
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

    // Switch to success mode and retry
    shouldSucceed = true;
    result.current.retry();

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

    // Refresh triggers a new fetch
    result.current.refresh();

    await waitFor(() => {
      expect(fetchFn.mock.calls.length).toBeGreaterThan(callsBefore);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });
});

