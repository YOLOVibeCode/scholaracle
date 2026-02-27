/**
 * TDD/ISP: Student detail page – tab styling and accessibility (aria-controls).
 * @jest-environment jsdom
 */

import { render, screen, waitFor } from '@testing-library/react';
import EditStudentPage from './page';
import { studentsApi } from '@/lib/api/students';

jest.mock('@/lib/api/students');
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useParams: () => ({ id: 'student-1' }),
  useSearchParams: () => ({ get: () => null, toString: () => '' }),
}));
jest.mock('next/link', () => {
  return function MockLink({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) {
    return <a href={href} {...rest}>{children}</a>;
  };
});

const mockGetById = studentsApi.getById as jest.Mock;

describe('EditStudentPage (TDD / ISP)', () => {
  beforeEach(() => {
    mockGetById.mockResolvedValue({
      id: 'student-1',
      userId: 'user-1',
      name: 'Test Student',
      grade: '10',
      studentId: 'ext-1',
    });
  });

  it('renders tablist with active tab having distinct styling (bg-primary)', async () => {
    render(<EditStudentPage />);
    await waitFor(() => {
      expect(screen.getByTestId('student-tabs')).toBeTruthy();
    });
    const overviewTab = screen.getByTestId('tab-overview');
    expect(overviewTab.getAttribute('aria-selected')).toBe('true');
    expect(overviewTab.className).toMatch(/bg-primary/);
  });

  it('each tab has aria-controls pointing to its tabpanel id', async () => {
    render(<EditStudentPage />);
    await waitFor(() => {
      expect(screen.getByTestId('tab-overview')).toBeTruthy();
    });
    expect(screen.getByTestId('tab-overview').getAttribute('aria-controls')).toBe('tabpanel-overview');
    expect(screen.getByTestId('tab-trends').getAttribute('aria-controls')).toBe('tabpanel-trends');
  });

  it('tabpanel has id that matches aria-controls', async () => {
    render(<EditStudentPage />);
    await waitFor(() => {
      expect(screen.getByTestId('student-tabs')).toBeTruthy();
    });
    const panel = document.getElementById('tabpanel-overview');
    expect(panel).toBeTruthy();
    expect(panel?.getAttribute('role')).toBe('tabpanel');
  });
});
