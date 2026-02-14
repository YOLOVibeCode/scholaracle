'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { authApi } from '@/lib/api/auth';

export default function ConnectorActivatePage() {
  const router = useRouter();
  const [userCode, setUserCode] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleApprove = async () => {
    setStatus('submitting');
    setError(null);

    const token = authApi.getToken();
    if (!token) {
      router.push('/login');
      return;
    }

    try {
      const res = await fetch(`${process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:2801/api'}/ingest/v1/device/approve`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userCode }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Failed to approve (${res.status})`);
      }

      setStatus('success');
    } catch (e) {
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


