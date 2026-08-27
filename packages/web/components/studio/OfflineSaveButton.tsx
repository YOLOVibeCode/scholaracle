'use client';

import { useState, useEffect, useCallback } from 'react';
import { createOfflinePackManager } from '@/lib/studio/offlinePackManager';

export type OfflineSaveState = 'idle' | 'saving' | 'saved' | 'stale' | 'error';

export interface IOfflineSaveButtonProps {
  readonly courseExternalId: string;
  readonly courseName: string;
  readonly token: string;
}

/**
 * Default-offline: silently saves the class pack on every mount while online.
 * No user action needed — the pack is always ready before the student loses Wi-Fi.
 *
 * States:
 *   idle   — auto-save not yet started (SSR hydration window)
 *   saving — save() running in background
 *   saved  — bytes + JSON persisted; shows quiet savedAt badge
 *   stale  — parent synced new content since last save; tap to refresh
 *   error  — save failed silently; stale or no data, tap to retry
 */
export function OfflineSaveButton({
  courseExternalId,
  courseName,
  token,
}: IOfflineSaveButtonProps): React.ReactElement {
  const [status, setStatus] = useState<OfflineSaveState>('idle');
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // Auto-save on every mount while online. Fail-open: errors are silent.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const manager = createOfflinePackManager(token);

    void (async () => {
      try {
        if (navigator.onLine) {
          setStatus('saving');
          await manager.save(courseExternalId);
          const saved = await manager.load(courseExternalId);
          setStatus('saved');
          setSavedAt(saved?.savedAt ?? new Date().toISOString());
        } else {
          // Offline — load whatever we have locally
          const saved = await manager.load(courseExternalId);
          if (saved !== null) {
            setStatus(saved.stale ? 'stale' : 'saved');
            setSavedAt(saved.savedAt);
          }
          // If offline and never saved: stay idle (nothing we can do)
        }
      } catch {
        // Auto-save failed — try to surface cached state rather than showing error
        try {
          const saved = await manager.load(courseExternalId);
          if (saved !== null) {
            setStatus(saved.stale ? 'stale' : 'saved');
            setSavedAt(saved.savedAt);
          } else {
            setStatus('error');
          }
        } catch {
          setStatus('error');
        }
      }
    })();
  }, [courseExternalId, token]);

  // Manual refresh — only shown for stale/error states
  const handleRefresh = useCallback(async () => {
    setStatus('saving');
    try {
      const manager = createOfflinePackManager(token);
      await manager.save(courseExternalId);
      const saved = await manager.load(courseExternalId);
      setStatus('saved');
      setSavedAt(saved?.savedAt ?? new Date().toISOString());
    } catch {
      setStatus('error');
    }
  }, [courseExternalId, token]);

  const savedAtLabel =
    savedAt !== null
      ? new Date(savedAt).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
      : null;

  // Idle / saving: render nothing visible (background work in progress)
  if (status === 'idle') return <></>;

  if (status === 'saving') {
    return (
      <p
        data-testid="studio-offline-save-btn"
        data-save-state="saving"
        className="text-xs text-muted-foreground"
      >
        Saving offline copy…
      </p>
    );
  }

  if (status === 'saved') {
    return (
      <div className="flex flex-col gap-0.5" data-testid="studio-offline-save-btn" data-save-state="saved">
        <p className="text-xs text-muted-foreground">
          ✓ {courseName} available offline
        </p>
        {savedAtLabel !== null && (
          <p data-testid="studio-offline-status" className="text-xs text-muted-foreground/70">
            Saved {savedAtLabel}
          </p>
        )}
      </div>
    );
  }

  // stale or error: show a tap-to-refresh affordance
  const isStale = status === 'stale';
  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        data-testid="studio-offline-save-btn"
        data-save-state={status}
        className="w-fit rounded text-xs font-medium text-amber-700 underline-offset-2 hover:underline"
        onClick={() => void handleRefresh()}
      >
        {isStale ? `${courseName} offline copy outdated — tap to refresh` : 'Offline save failed — tap to retry'}
      </button>
      {savedAtLabel !== null && (
        <p data-testid="studio-offline-status" className="text-xs text-muted-foreground/70">
          Last saved {savedAtLabel}
        </p>
      )}
    </div>
  );
}
