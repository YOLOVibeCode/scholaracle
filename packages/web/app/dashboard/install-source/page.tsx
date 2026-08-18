'use client';

/**
 * SOURCE_INVITE.md §9 — Continue in browser after email tap.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { sourceInvitesApi } from '@/lib/api/sourceInvites';
import { parseInstallSearch } from '@/lib/install/parseInstallSearch';
import { invitePrefillFromRedeem, storeInvitePrefill } from '@/lib/install/invitePrefill';
import { SOURCE_INVITE_REDEEM_ERROR } from '@scholaracle/contracts';

export default function InstallSourcePage(): React.ReactElement {
  const router = useRouter();
  const [message, setMessage] = useState('Opening your install link…');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = parseInstallSearch(typeof window !== 'undefined' ? window.location.search : '');
    if (!token) {
      setError(SOURCE_INVITE_REDEEM_ERROR);
      return;
    }
    void (async (): Promise<void> => {
      try {
        const invite = await sourceInvitesApi.redeem(token);
        storeInvitePrefill(invitePrefillFromRedeem(invite));
        window.history.replaceState({}, '', '/dashboard/install-source');
        setMessage(
          `${invite.displayName} is ready. Open the iOS/Android app or Chrome extension and sign in to the portal there.`
        );
      } catch (err: unknown) {
        const status = typeof err === 'object' && err !== null && 'status' in err ? Number((err as { status: number }).status) : 0;
        if (status === 401) {
          const returnTo = `/dashboard/install-source?t=${encodeURIComponent(token)}`;
          router.push(`/login?redirect=${encodeURIComponent(returnTo)}`);
          return;
        }
        setError(SOURCE_INVITE_REDEEM_ERROR);
      }
    })();
  }, [router]);

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-xl font-semibold">Install a school portal</h1>
      {error ? <p className="text-sm text-destructive">{error}</p> : <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}
