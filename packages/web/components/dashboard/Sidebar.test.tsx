/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Sidebar } from './Sidebar';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { markFeedbackReady, resetFeedbackForTests } from '@/lib/feedback/feedback';

jest.mock('next/navigation', () => ({
  usePathname: (): string => '/dashboard',
}));

jest.mock('@/lib/contexts/StudentViewContext', () => ({
  useStudentView: (): { isStudentView: boolean; studentId: null } => ({
    isStudentView: false,
    studentId: null,
  }),
}));

function setWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
  // jsdom has no matchMedia; the sidebar's own "is this a phone" hook needs one.
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: width < 768,
      media: query,
      onchange: null,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }),
  });
}

function renderSidebar(): void {
  render(
    <SidebarProvider>
      <SidebarTrigger data-testid="open-menu" />
      <Sidebar />
    </SidebarProvider>
  );
}

describe('Sidebar — Send feedback', () => {
  beforeEach(() => {
    resetFeedbackForTests();
    delete window.NoctusoftFeedback;
  });

  it('is not in the sidebar on a wide screen, where the floating button is', () => {
    setWidth(1280);
    markFeedbackReady();

    renderSidebar();

    expect(screen.getByTestId('sidebar-dashboard')).toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-send-feedback')).toBeNull();
  });

  it('is in the menu on a phone, under the navigation', async () => {
    setWidth(390);
    markFeedbackReady();
    renderSidebar();

    fireEvent.click(screen.getByTestId('open-menu'));

    const entry = await screen.findByTestId('sidebar-send-feedback');
    expect(entry).toHaveTextContent('Send feedback');
    expect(entry.tagName).toBe('BUTTON');
    const settings = screen.getByTestId('sidebar-settings');
    expect(settings.compareDocumentPosition(entry) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('is not in the menu on a phone while the widget has not loaded', async () => {
    setWidth(390);
    renderSidebar();

    fireEvent.click(screen.getByTestId('open-menu'));

    expect(await screen.findByTestId('sidebar-settings')).toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-send-feedback')).toBeNull();
  });

  it('closes the menu and opens the form when pressed', async () => {
    setWidth(390);
    markFeedbackReady();
    const open = jest.fn();
    window.NoctusoftFeedback = { open, close: jest.fn() };
    renderSidebar();
    fireEvent.click(screen.getByTestId('open-menu'));

    await act(async () => {
      fireEvent.click(await screen.findByTestId('sidebar-send-feedback'));
    });

    expect(open).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByTestId('sidebar-send-feedback')).toBeNull());
  });
});
