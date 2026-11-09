/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SetPasswordBanner } from './SetPasswordBanner';
import { SET_PASSWORD_PROMPT_KEY } from '@/lib/sharing/setPasswordPrompt';

function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64('{"alg":"HS256"}')}.${b64(JSON.stringify(payload))}.sig`;
}

describe('SetPasswordBanner', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders nothing unless a magic login flagged the account', async () => {
    const { container } = render(<SetPasswordBanner />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('links to the reset flow with the signed-in email and dismisses once', async () => {
    localStorage.setItem(SET_PASSWORD_PROMPT_KEY, '1');
    localStorage.setItem('auth_token', fakeJwt({ userId: 'u-jen', email: 'jennifer@example.com', role: 'parent' }));
    render(<SetPasswordBanner />);

    const link = await screen.findByTestId('set-password-link');
    expect(link).toHaveAttribute('href', '/forgot-password?required=1&email=jennifer%40example.com');

    fireEvent.click(screen.getByTestId('set-password-dismiss'));
    await waitFor(() => expect(screen.queryByTestId('set-password-banner')).not.toBeInTheDocument());
    expect(localStorage.getItem(SET_PASSWORD_PROMPT_KEY)).toBeNull();
  });
});
