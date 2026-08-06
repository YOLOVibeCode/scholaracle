'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { authApi } from '@/lib/api/auth';

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:2801/api';
const DEMO_EMAIL = 'demo@scholarmancy.com';

function getEmailFromToken(token: string | null): string | null {
  if (!token || typeof token !== 'string') return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = (parts[1] ?? '').replace(/-/g, '+').replace(/_/g, '/');
    const json = typeof atob !== 'undefined' ? atob(base64) : '';
    const payload = JSON.parse(json) as { email?: string };
    return typeof payload.email === 'string' ? payload.email : null;
  } catch {
    return null;
  }
}

export function DemoBanner() {
  const router = useRouter();
  const token = authApi.getToken();
  const email = getEmailFromToken(token);
  const isDemoUser = email === DEMO_EMAIL;

  const [resetting, setResetting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleReset = async () => {
    setResetting(true);
    try {
      const res = await fetch(`${API_BASE}/seed/demo/reset`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setConfirmOpen(false);
        router.refresh();
        window.location.reload();
      }
    } finally {
      setResetting(false);
    }
  };

  if (!isDemoUser) return null;

  return (
    <>
      <div
        className="flex flex-wrap items-center justify-center gap-2 border-b bg-amber-50 px-4 py-2 text-sm dark:bg-amber-950/40 dark:border-amber-900"
        data-testid="demo-banner"
      >
        <span className="text-amber-900 dark:text-amber-100">You&apos;re viewing a demo account.</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-amber-600 text-amber-800 hover:bg-amber-100 dark:border-amber-500 dark:text-amber-200 dark:hover:bg-amber-900/50"
          onClick={() => setConfirmOpen(true)}
          disabled={resetting}
          data-testid="button-reset-demo"
        >
          {resetting ? 'Resetting…' : 'Reset Demo Data'}
        </Button>
      </div>
      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="demo-reset-title"
          data-testid="demo-reset-dialog"
        >
          <div className="w-full max-w-sm rounded-lg bg-card p-4 shadow-lg">
            <h2 id="demo-reset-title" className="font-semibold">Reset demo data?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This will restore all demo data to its original state. Your session will reload.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)} disabled={resetting}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleReset} disabled={resetting} data-testid="button-confirm-reset-demo">
                {resetting ? 'Resetting…' : 'Reset'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
