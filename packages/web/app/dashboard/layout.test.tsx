/**
 * The dashboard layout on a narrow screen: the column that holds the header and the page must be
 * able to be narrower than its widest line of text.
 * @jest-environment jsdom
 */

import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import DashboardLayout from './layout';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => '/dashboard',
}));
jest.mock('@/lib/api/auth', () => ({
  authApi: { initialize: jest.fn(), getToken: () => 'signed-in', logout: jest.fn() },
}));
jest.mock('@/components/ui/sidebar', () => ({
  SidebarProvider: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SidebarTrigger: (props: Record<string, unknown>) => <button type="button" {...props} />,
}));
jest.mock('@/components/dashboard/Sidebar', () => ({
  Sidebar: () => <nav data-testid="sidebar" />,
}));
jest.mock('@/components/dashboard/UserMenu', () => ({ UserMenu: () => null }));
jest.mock('@/components/dashboard/DemoBanner', () => ({ DemoBanner: () => null }));
jest.mock('@/components/dashboard/ViewingAsBanner', () => ({ ViewingAsBanner: () => null }));
jest.mock('@/lib/contexts/StudentViewContext', () => ({
  StudentViewProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

describe('DashboardLayout', () => {
  // A flex item is never narrower than its content unless it is told it may be. A title that is
  // cut short with "…" still counts at its full length, so one long title made the header and
  // the page wider than a phone screen.
  it('lets the column with the header and the page be narrower than its content', () => {
    render(
      <DashboardLayout>
        <p data-testid="page">page</p>
      </DashboardLayout>
    );

    const column = screen.getByTestId('dashboard-content');
    expect(column.className.split(/\s+/)).toEqual(expect.arrayContaining(['min-w-0', 'flex-1']));
    expect(column.contains(screen.getByTestId('button-logout'))).toBe(true);
    expect(column.contains(screen.getByTestId('page'))).toBe(true);
    expect(column.contains(screen.getByTestId('sidebar'))).toBe(false);
  });
});
