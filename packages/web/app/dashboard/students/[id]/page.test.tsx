/**
 * TDD/ISP: Student detail page – tab styling and accessibility (aria-controls), and the
 * role-gated controls of sharing-spec §4.2.
 * @jest-environment jsdom
 */

import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

  // The name and three buttons sat in one row that could not wrap. On a phone the row was wider
  // than the screen, and the whole page (tabs, cards) scrolled sideways with it.
  describe('the header on a narrow screen', () => {
    /** The classes of an element, one by one: `sm:flex-wrap` is not `flex-wrap`. */
    const classesOf = (element: HTMLElement): string[] => element.className.split(/\s+/);

    it('lets the buttons go to a line of their own', async () => {
      render(<EditStudentPage />);
      await waitFor(() => expect(screen.getByTestId('student-header')).toBeTruthy());

      expect(classesOf(screen.getByTestId('student-header'))).toContain('flex-wrap');
    });

    it('keeps the buttons together in one group that wraps too', async () => {
      render(<EditStudentPage />);
      await waitFor(() => expect(screen.getByTestId('student-header-actions')).toBeTruthy());

      const actions = screen.getByTestId('student-header-actions');
      expect(classesOf(actions)).toContain('flex-wrap');
      for (const button of ['button-share-student', 'button-workflow', 'button-view-as-student']) {
        expect(actions.contains(screen.getByTestId(button))).toBe(true);
      }
    });

    it('gives the name room on its line and lets a long name break', async () => {
      mockGetById.mockResolvedValue({ ...OWNED, name: 'Maximiliana-Alexandrina Featherstonehaugh' });
      render(<EditStudentPage />);
      await waitFor(() => expect(screen.getByTestId('student-header-title')).toBeTruthy());

      const title = screen.getByTestId('student-header-title');
      // Wide enough to start with that the buttons wrap before the name is squeezed.
      expect(classesOf(title)).toEqual(expect.arrayContaining(['basis-48', 'grow', 'min-w-0']));
      expect(title.contains(screen.getByTestId('back-link'))).toBe(false);
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading.textContent).toBe('Maximiliana-Alexandrina Featherstonehaugh');
      expect(classesOf(heading)).toContain('break-words');
    });
  });

  // The dev server mounts the page twice (React strict mode), so the student is loaded twice.
  // An answer that arrived after the form was on screen used to put the stored name back over
  // what the parent was typing, and Save then sent the old name.
  describe('the student is loaded twice', () => {
    function deferred(): { promise: Promise<IStudent>; resolve: (student: IStudent) => void } {
      let resolve!: (student: IStudent) => void;
      const promise = new Promise<IStudent>((done) => {
        resolve = done;
      });
      return { promise, resolve };
    }

    async function renderWithTwoLoads() {
      const earlier = deferred();
      const latest = deferred();
      mockGetById.mockReset();
      mockGetById.mockReturnValueOnce(earlier.promise).mockReturnValueOnce(latest.promise);
      render(
        <StrictMode>
          <EditStudentPage />
        </StrictMode>
      );
      await waitFor(() => expect(mockGetById).toHaveBeenCalledTimes(2));
      return { earlier, latest };
    }

    const nameField = () => screen.getByTestId('input-student-name') as HTMLInputElement;

    it('keeps what the parent typed when the earlier load answers late', async () => {
      const { earlier, latest } = await renderWithTwoLoads();

      await act(async () => latest.resolve(OWNED));
      fireEvent.change(nameField(), { target: { value: 'Renamed Student' } });
      expect(nameField().value).toBe('Renamed Student');

      await act(async () => earlier.resolve(OWNED));

      expect(nameField().value).toBe('Renamed Student');
    });

    it('shows the form once the latest load has answered, not before', async () => {
      const { earlier, latest } = await renderWithTwoLoads();

      await act(async () => earlier.resolve(OWNED));
      expect(screen.getByText('Loading student...')).toBeTruthy();
      expect(screen.queryByTestId('input-student-name')).toBeNull();

      await act(async () => latest.resolve(OWNED));
      expect(nameField().value).toBe('Test Student');
    });
  });
});
