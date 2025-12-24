/**
 * Admin Impersonation Page
 *
 * Calls the admin impersonation endpoint, stores the returned parent JWT into
 * `auth_token` (cookie + localStorage), then redirects to `/dashboard`.
 */

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { adminCustomersApi } from '@/lib/api/admin/customers';
import { apiClient } from '@/lib/api/client';
import { LoadingSkeleton, ErrorDisplay } from '@/components/common';

export default function AdminImpersonatePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ?? '';
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        setError(null);
        const res = await adminCustomersApi.impersonate(id, 'Admin impersonation');
        if (!res.success || !res.data?.token) {
          throw new Error(res.error ?? 'Failed to impersonate customer');
        }

        const token = res.data.token;
        apiClient.setToken(token);

        if (typeof window !== 'undefined') {
          localStorage.setItem('auth_token', token);
          document.cookie = `auth_token=${token}; path=/; max-age=604800; SameSite=Lax`;
        }

        if (!cancelled) {
          router.push('/dashboard');
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Impersonation failed');
        }
      }
    }

    if (id) void run();
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  return (
    <div className="space-y-4" data-testid="admin-impersonate-page">
      <h1 className="text-2xl font-bold">Logging in as customer…</h1>
      {error ? (
        <ErrorDisplay error={error} title="Impersonation failed" onRetry={() => router.back()} />
      ) : (
        <LoadingSkeleton variant="card" />
      )}
    </div>
  );
}


