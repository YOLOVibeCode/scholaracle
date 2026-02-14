'use client';

import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  Users,
  CreditCard,
  FileText,
  BarChart3,
  MessageSquare,
  Settings,
  ClipboardList,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { adminAuthApi } from '@/lib/api/admin/auth';

function getInitialAdminUser(): { id: string; email: string; name: string; role: string } | null {
  if (typeof window === 'undefined') return null;
  try {
    return adminAuthApi.getCurrentAdmin();
  } catch {
    return null;
  }
}

/** Human-readable label for admin role (for display in UI). */
function getRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    super_admin: 'Super Admin',
    admin: 'Admin',
    support: 'Support',
    billing: 'Billing',
    analyst: 'Analyst',
  };
  return labels[role] ?? role;
}

function isForbiddenByRole(role: string, pathname: string): boolean {
  const forbiddenByRole: Record<string, readonly RegExp[]> = {
    // Support: no billing or system settings
    support: [/^\/admin\/settings/, /^\/admin\/payments/, /^\/admin\/subscriptions/, /^\/admin\/audit-logs/],
    // Billing: no communications or system settings
    billing: [/^\/admin\/communications/, /^\/admin\/settings/, /^\/admin\/audit-logs/],
    // Analyst: no system settings / audit logs / communications / subscriptions management
    analyst: [/^\/admin\/settings/, /^\/admin\/audit-logs/, /^\/admin\/communications/, /^\/admin\/subscriptions/],
    // Admin: no system settings / audit logs
    admin: [/^\/admin\/settings/, /^\/admin\/audit-logs/],
    // Super admin: everything allowed
    super_admin: [],
  };

  return (forbiddenByRole[role] ?? []).some((re) => re.test(pathname));
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isLoginRoute = pathname === '/admin/login';
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [adminUser, setAdminUser] = useState<{ id: string; name: string; email: string; role: string } | null>(
    () => getInitialAdminUser()
  );

  useEffect(() => {
    // Keep state in sync in case localStorage changes after initial load.
    const user = getInitialAdminUser();
    if (user) setAdminUser(user);
  }, [router]);

  const forbidden = useMemo(() => {
    if (!adminUser) return false;
    return isForbiddenByRole(adminUser.role, pathname);
  }, [adminUser, pathname]);

  // Enforce auth + RBAC as early as possible for best UX (and stable E2E).
  useLayoutEffect(() => {
    if (isLoginRoute) return;
    if (!adminUser) {
      router.replace('/admin/login');
      return;
    }
    if (forbidden) {
      router.replace('/admin/dashboard');
    }
  }, [adminUser, forbidden, isLoginRoute, router]);

  const handleLogout = async () => {
    await adminAuthApi.logout();
    router.push('/admin/login');
  };

  // Avoid rendering forbidden routes (prevents flicker and makes denial deterministic).
  if (!isLoginRoute && (!adminUser || forbidden)) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
        <p className="text-sm text-gray-600 dark:text-gray-400">Redirecting…</p>
      </div>
    );
  }

  const navItems = [
    { href: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { href: '/admin/customers', icon: Users, label: 'Customers' },
    { href: '/admin/subscriptions', icon: CreditCard, label: 'Subscriptions' },
    { href: '/admin/payments', icon: FileText, label: 'Payments' },
    { href: '/admin/analytics', icon: BarChart3, label: 'Analytics' },
    { href: '/admin/reports', icon: ClipboardList, label: 'Reports' },
    { href: '/admin/communications', icon: MessageSquare, label: 'Communications' },
    { href: '/admin/settings', icon: Settings, label: 'Settings' },
    { href: '/admin/audit-logs', icon: ClipboardList, label: 'Audit Logs' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-40 h-screen transition-transform ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Admin Panel</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1" data-testid="admin-role-label">
              {adminUser ? getRoleLabel(adminUser.role) : ''}
            </p>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                data-testid={`${item.label.toLowerCase().replace(/\s+/g, '-')}-link`}
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <item.icon className="w-5 h-5" />
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>

          {/* User info & logout */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <div className="mb-3">
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {adminUser?.name}
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-400">{adminUser?.email}</p>
            </div>
            <button
              onClick={handleLogout}
              data-testid="button-logout"
              className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile menu toggle */}
      <button
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        className="fixed top-4 left-4 z-50 lg:hidden p-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg"
      >
        {isSidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {/* Main content */}
      <main className={`transition-all ${isSidebarOpen ? 'lg:ml-64' : ''} min-h-screen`}>
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}


