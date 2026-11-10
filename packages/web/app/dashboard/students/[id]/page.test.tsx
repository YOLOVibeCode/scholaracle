/**
 * TDD/ISP: Student detail page – tab styling and accessibility (aria-controls), and the
 * role-gated controls of sharing-spec §4.2.
 * @jest-environment jsdom
 */

import { render, screen, waitFor } from '@testing-library/react';
import EditStudentPage from './page';
import { studentsApi, type IStudent } from '@/lib/api/students';

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

const OWNED: IStudent = {
  id: 'student-1',
  userId: 'user-1',
  name: 'Test Student',
  grade: '10',
  studentId: 'ext-1',
  access: 'owner',
  peopleCount: 1,
};

describe('EditStudentPage (TDD / ISP)', () => {
  beforeEach(() => {
    mockGetById.mockResolvedValue(OWNED);
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

  describe('role-gated controls (sharing-spec §4.2)', () => {
    it('owner: Share button, editable overview, "Family & guardians" tab label', async () => {
      render(<EditStudentPage />);
      await waitFor(() => expect(screen.getByTestId('student-tabs')).toBeTruthy());
      expect(screen.getByTestId('button-share-student')).toBeTruthy();
      expect(screen.getByTestId('button-save-student')).toBeTruthy();
      expect(screen.queryByTestId('student-overview-readonly')).toBeNull();
      expect(screen.queryByTestId('shared-with-you')).toBeNull();
      expect(screen.getByTestId('tab-parents').textContent).toBe('Family & guardians');
    });

    it('member: no Share, read-only overview, "Shared with you · by <inviter>" from the student itself', async () => {
      mockGetById.mockResolvedValue({
        ...OWNED,
        userId: 'user-owner',
        access: 'member',
        peopleCount: 3,
        invitedBy: { userId: 'user-owner', name: 'Ricardo' },
      } satisfies IStudent);
      render(<EditStudentPage />);
      await waitFor(() => expect(screen.getByTestId('student-tabs')).toBeTruthy());
      expect(screen.queryByTestId('button-share-student')).toBeNull();
      expect(screen.getByTestId('student-overview-readonly')).toBeTruthy();
      expect(screen.queryByTestId('button-save-student')).toBeNull();
      expect((screen.getByTestId('input-student-name') as HTMLInputElement).disabled).toBe(true);
      expect(screen.getByTestId('shared-with-you').textContent).toContain('Shared with you · by Ricardo');
    });

    it('renders no role-gated control while the student is still loading', () => {
      mockGetById.mockReturnValue(new Promise(() => undefined));
      render(<EditStudentPage />);
      expect(screen.getByText('Loading student...')).toBeTruthy();
      expect(screen.queryByTestId('button-share-student')).toBeNull();
      expect(screen.queryByTestId('input-student-name')).toBeNull();
      expect(screen.queryByTestId('button-save-student')).toBeNull();
    });
  });
});
