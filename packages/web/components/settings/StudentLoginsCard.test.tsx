/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { IStudentLoginStatus } from '@scholaracle/contracts';
import { StudentLoginsCard, type IStudentLoginRow } from './StudentLoginsCard';

const EMMA_LOGIN: IStudentLoginStatus = {
  provisioned: true,
  email: 'emma.demo@scholarmancy.com',
  showGrades: false,
  createdAt: '2026-08-24T00:00:00.000Z',
  userId: 'user-emma',
};

const LIAM_NONE: IStudentLoginStatus = {
  provisioned: false,
  showGrades: false,
};

const ROWS: readonly IStudentLoginRow[] = [
  { id: 'emma-id', name: 'Emma Mitchell', login: EMMA_LOGIN },
  { id: 'liam-id', name: 'Liam Mitchell', login: LIAM_NONE },
];

describe('StudentLoginsCard', () => {
  it('shows Emma’s existing login, COPPA copy, and a show-grades toggle default off', () => {
    render(
      <StudentLoginsCard
        students={ROWS}
        onInvite={jest.fn()}
        onRevoke={jest.fn()}
        onShowGradesChange={jest.fn()}
        onIssueIpadLink={jest.fn()}
      />
    );

    expect(screen.getByTestId('student-login-emma')).toBeInTheDocument();
    expect(screen.getByText('emma.demo@scholarmancy.com')).toBeInTheDocument();
    expect(screen.getByText(/creating a login for your child/i)).toBeInTheDocument();
    expect(screen.getByText(/cannot sign up on their own/i)).toBeInTheDocument();
    const grades = screen.getByTestId('student-login-emma-show-grades');
    expect(grades).toHaveAttribute('data-state', 'unchecked');
  });

  it('lets the parent create a login for a child who does not have one', async () => {
    const onInvite = jest.fn().mockResolvedValue({
      email: 'liam.provision@example.com',
      temporaryPassword: 'TempPass1!',
    });
    render(
      <StudentLoginsCard
        students={ROWS}
        onInvite={onInvite}
        onRevoke={jest.fn()}
        onShowGradesChange={jest.fn()}
        onIssueIpadLink={jest.fn()}
      />
    );

    fireEvent.change(screen.getByTestId('student-login-liam-email'), {
      target: { value: 'liam.provision@example.com' },
    });
    fireEvent.click(screen.getByTestId('student-login-liam-create'));
    await waitFor(() => {
      expect(onInvite).toHaveBeenCalledWith('liam-id', 'liam.provision@example.com');
    });
  });

  it('reset and revoke call through for a provisioned student', async () => {
    const onInvite = jest.fn().mockResolvedValue({
      email: 'emma.demo@scholarmancy.com',
      temporaryPassword: 'NewTemp1!',
    });
    const onRevoke = jest.fn().mockResolvedValue(undefined);
    render(
      <StudentLoginsCard
        students={ROWS}
        onInvite={onInvite}
        onRevoke={onRevoke}
        onShowGradesChange={jest.fn()}
        onIssueIpadLink={jest.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('student-login-emma-reset'));
    await waitFor(() => {
      expect(onInvite).toHaveBeenCalledWith('emma-id');
    });
    fireEvent.click(screen.getByTestId('student-login-emma-revoke'));
    await waitFor(() => {
      expect(onRevoke).toHaveBeenCalledWith('emma-id');
    });
  });

  it('shows an iPad QR for a provisioned student and not for an unprovisioned one', async () => {
    const onIssueIpadLink = jest.fn().mockResolvedValue({
      loginUrl: 'http://localhost:2800/login?magic=once-only',
      expiresAt: '2026-08-25T21:30:00.000Z',
      qrDataUrl: 'data:image/png;base64,qq',
    });
    render(
      <StudentLoginsCard
        students={ROWS}
        onInvite={jest.fn()}
        onRevoke={jest.fn()}
        onShowGradesChange={jest.fn()}
        onIssueIpadLink={onIssueIpadLink}
      />
    );

    expect(screen.queryByTestId('student-login-liam-ipad')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('student-login-emma-ipad'));
    await waitFor(() => {
      expect(onIssueIpadLink).toHaveBeenCalledWith('emma-id');
    });
    const qr = screen.getByTestId('student-login-emma-qr');
    expect(qr).toHaveAttribute('src', 'data:image/png;base64,qq');
    expect(qr.getAttribute('alt')).toMatch(/ipad camera/i);
    expect(screen.getByText(/scan with the ipad camera/i)).toBeInTheDocument();
  });
});
