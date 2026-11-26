'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { authApi } from '@/lib/api/auth';
import { apiClient } from '@/lib/api/client';
import { SessionExpiredRedirectError } from '@/lib/auth/clearParentSession';

export default function ConnectorActivatePage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-md py-8 text-center text-muted-foreground">Loading…</div>}>
      <ConnectorActivateContent />
    </Suspense>
  );
}

function ConnectorActivateContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [userCode, setUserCode] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get('code')?.trim().toUpperCase();
    if (code) setUserCode(code);
  }, [searchParams]);

  const handleApprove = async () => {
    setStatus('submitting');
    setError(null);

    // This page is opened by a fresh page load, outside the dashboard, so the session is in
    // the browser's storage and not yet in memory. Load it before asking for it (issue #3).
    authApi.initialize();
    if (!authApi.getToken()) {
      // Sign in, then come back here with the code still filled in.
      const here = `/connector/activate?code=${encodeURIComponent(userCode.trim())}`;
      router.push(`/login?redirect=${encodeURIComponent(here)}`);
      return;
    }

    try {
      // The shared client renews an expired session once and retries before giving up.
      await apiClient.post('/ingest/v1/device/approve', { userCode });
      setStatus('success');
    } catch (e) {
      // The client is already sending the visitor to sign in again.
      if (e instanceof SessionExpiredRedirectError) return;
      setStatus('error');
      setError(e instanceof Error ? e.message : 'Failed to approve');
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-3xl font-bold tracking-tight">Activate Connector</h1>
      <p className="text-gray-600 dark:text-gray-400">
        Enter the code shown in your connector (CLI/extension/app) to approve this device.
      </p>

      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="userCode">
          User code
        </label>
        <Input
          id="userCode"
          data-testid="connector-user-code"
          placeholder="ABCD-EFGH"
          value={userCode}
          onChange={(e) => setUserCode(e.target.value.toUpperCase())}
          disabled={status === 'submitting' || status === 'success'}
        />
      </div>

      {status === 'error' && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700" data-testid="connector-error">
          {error}
        </div>
      )}
      {status === 'success' && (
        <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700" data-testid="connector-success">
          Approved. You can return to your connector.
        </div>
      )}

      <Button
        onClick={handleApprove}
        disabled={status === 'submitting' || status === 'success' || userCode.trim().length < 4}
        data-testid="connector-approve"
      >
        {status === 'submitting' ? 'Approving…' : 'Approve device'}
      </Button>
    </div>
  );
}


