'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { UserMenu } from '@/components/dashboard/UserMenu';
import { authApi } from '@/lib/api/auth';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    // Initialize auth token
    authApi.initialize();

    // Check if user is authenticated
    const token = authApi.getToken();
    if (!token) {
      router.push('/login');
    }
  }, [router]);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <Sidebar />
        <div className="flex flex-1 flex-col">
          <header className="flex h-16 items-center gap-4 border-b px-4">
            <SidebarTrigger />
            <div className="flex flex-1 items-center justify-end gap-4">
              <UserMenu />
            </div>
          </header>
          <main className="flex flex-1 flex-col gap-4 p-4 md:p-6">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}

