'use client';

import { useEffect, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { UserMenu } from '@/components/dashboard/UserMenu';
import { DemoBanner } from '@/components/dashboard/DemoBanner';
import { ViewingAsBanner } from '@/components/dashboard/ViewingAsBanner';
import { StudentViewProvider } from '@/lib/contexts/StudentViewContext';
import { Button } from '@/components/ui/button';
import { authApi } from '@/lib/api/auth';

const STUDENT_VIEW_PATH = /^\/dashboard\/students\/([^/]+)\/view/;

function getStudentIdFromPath(pathname: string): string | null {
  const match = pathname.match(STUDENT_VIEW_PATH);
  return match ? match[1] ?? null : null;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const studentIdFromPath = useMemo(() => getStudentIdFromPath(pathname ?? ''), [pathname]);

  useEffect(() => {
    // Initialize auth token
    authApi.initialize();

    // Check if user is authenticated
    const token = authApi.getToken();
    if (!token) {
      router.push('/login');
    }
  }, [router]);

  const handleLogout = async () => {
    await authApi.logout();
    router.push('/login');
  };

  const clearStudentView = () => {
    router.push('/dashboard');
  };

  return (
    <SidebarProvider>
      <StudentViewProvider
        studentIdFromPath={studentIdFromPath}
        onClear={clearStudentView}
      >
        <div className="flex min-h-screen w-full">
          <Sidebar />
          <div className="flex flex-1 flex-col">
            <header className="flex h-16 items-center gap-4 border-b px-4">
              <SidebarTrigger />
              <div className="flex flex-1 items-center justify-end gap-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLogout}
                  data-testid="button-logout"
                >
                  Logout
                </Button>
                <UserMenu />
              </div>
            </header>
            <DemoBanner />
            <ViewingAsBanner />
            <main className="flex flex-1 flex-col gap-4 p-4 md:p-6">{children}</main>
          </div>
        </div>
      </StudentViewProvider>
    </SidebarProvider>
  );
}

