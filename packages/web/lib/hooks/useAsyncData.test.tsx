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
    let attemptCount = 0;
    const { result } = renderHook(() =>
      useAsyncData(() => {
        attemptCount++;
        if (attemptCount < 2) {
          return Promise.reject(new Error('Failed'));
        }
        return Promise.resolve({ data: 'success' });
      })
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('Failed');

    // Retry
    result.current.retry();
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual({ data: 'success' });
    expect(result.current.error).toBeNull();
  });

  it('should support manual refresh', async () => {
    const { result } = renderHook(() =>
      useAsyncData(() => Promise.resolve({ data: 'test' }))
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Refresh
    result.current.refresh();
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });
});

