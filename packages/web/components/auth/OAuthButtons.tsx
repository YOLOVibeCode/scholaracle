'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';

export type OAuthProviderId = 'google' | 'apple' | 'azure-ad';

interface OAuthButtonsProps {
  disabled?: boolean;
  /** Optional callback when an error occurs (e.g. OAuth failed). */
  onError?: (message: string) => void;
}

const PROVIDERS: { id: OAuthProviderId; label: string }[] = [
  { id: 'google', label: 'Google' },
  { id: 'apple', label: 'Apple' },
  { id: 'azure-ad', label: 'Microsoft' },
];

export function OAuthButtons({ disabled = false, onError }: OAuthButtonsProps) {
  const [loadingProvider, setLoadingProvider] = useState<OAuthProviderId | null>(null);

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

  return (
    <div className="space-y-2">
      {PROVIDERS.map(({ id, label }) => (
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
