'use client';

import { useEffect, useState } from 'react';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';

export type OAuthProviderId = 'google' | 'apple' | 'azure-ad';

interface OAuthButtonsProps {
  disabled?: boolean;
  /** Optional callback when an error occurs (e.g. OAuth failed). */
  onError?: (message: string) => void;
  /** Called once the configured provider list has been resolved. */
  onProvidersResolved?: (ids: OAuthProviderId[]) => void;
}

const ALL_PROVIDERS: { id: OAuthProviderId; label: string }[] = [
  { id: 'google', label: 'Google' },
  { id: 'apple', label: 'Apple' },
  { id: 'azure-ad', label: 'Microsoft' },
];

export function OAuthButtons({ disabled = false, onError, onProvidersResolved }: OAuthButtonsProps) {
  const [loadingProvider, setLoadingProvider] = useState<OAuthProviderId | null>(null);
  const [configuredIds, setConfiguredIds] = useState<Set<string> | null>(null);

  useEffect(() => {
    void fetch('/api/auth/providers')
      .then((r) => r.json() as Promise<Record<string, unknown>>)
      .then((data) => {
        const ids = new Set(Object.keys(data));
        setConfiguredIds(ids);
        onProvidersResolved?.(
          ALL_PROVIDERS.filter(({ id }) => ids.has(id)).map(({ id }) => id),
        );
      })
      .catch(() => {
        setConfiguredIds(new Set());
        onProvidersResolved?.([]);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOAuth = async (provider: OAuthProviderId) => {
    setLoadingProvider(provider);
    try {
      await signIn(provider, { callbackUrl: '/dashboard' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign in failed';
      onError?.(message);
    } finally {
      setLoadingProvider(null);
    }
  };

  const visibleProviders = configuredIds === null
    ? []
    : ALL_PROVIDERS.filter(({ id }) => configuredIds.has(id));

  if (visibleProviders.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {visibleProviders.map(({ id, label }) => (
        <Button
          key={id}
          type="button"
          variant="outline"
          className="w-full"
          disabled={disabled || loadingProvider !== null}
          onClick={() => void handleOAuth(id)}
          data-testid={`button-oauth-${id}`}
        >
          {loadingProvider === id ? 'Signing in...' : `Continue with ${label}`}
        </Button>
      ))}
    </div>
  );
}
