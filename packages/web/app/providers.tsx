'use client';

import { SessionProvider, useSession } from 'next-auth/react';
import { useEffect, useRef } from 'react';
import { apiClient } from '@/lib/api/client';

function OAuthSessionSync() {
  const { data: session, status } = useSession();
  const synced = useRef(false);

  useEffect(() => {
    if (status !== 'authenticated' || !session) return;
    const ext = session as { accessToken?: string; refreshToken?: string };
    if (!ext.accessToken) return;
    if (synced.current) return;
    synced.current = true;
    apiClient.setToken(ext.accessToken);
    if (ext.refreshToken) {
      apiClient.setRefreshToken(ext.refreshToken, false);
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem('remember_me', 'true');
      localStorage.setItem('auth_token', ext.accessToken);
      const maxAge = 15 * 60;
      document.cookie = `auth_token=${ext.accessToken}; path=/; max-age=${maxAge}; SameSite=Lax`;
    }
  }, [session, status]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <OAuthSessionSync />
      {children}
    </SessionProvider>
  );
}
