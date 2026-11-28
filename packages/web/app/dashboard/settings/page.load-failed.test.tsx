/**
 * Settings when they could not be loaded.
 *
 * The page saves everything it shows: the number, the text opt-in, every switch and every
 * threshold. When the load failed it used to show the defaults as if they were the person's own,
 * and Save then wrote them: the number removed, the text consent withdrawn, quiet hours and
 * thresholds reset, the AI consent turned off. A page that did not load must not be savable.
 *
 * @jest-environment jsdom
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SettingsPage from './page';
import { settingsApi } from '@/lib/api/settings';
import { consentsApi } from '@/lib/api/consents';

jest.mock('@/lib/api/settings');
jest.mock('@/lib/api/consents');
jest.mock('@/components/settings/StudentLoginsSection', () => ({
  StudentLoginsSection: () => null,
}));
jest.mock('next/link', () => {
  return function MockLink({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [k: string]: unknown;
  }) {
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  };
});

const PHONE = '(512) 555-0100';

const SAVED = {
  profile: {
    name: 'A Parent',
    email: 'parent@example.com',
    phone: PHONE,
    smsConsent: true,
    oauthProviders: [],
  },
  notifications: { push: true, email: true, sms: true },
  alerts: { gradeDrop: 5, daysBeforeDeadline: 2, lowGradeThreshold: 80 },
  timezone: 'America/Chicago',
};

const form = (): HTMLElement => screen.getByTestId('settings-form');
const saveButton = (): HTMLButtonElement => screen.getByTestId('button-save-settings');
const failure = (): HTMLElement | null => screen.queryByTestId('settings-load-failed');
const optIn = (): HTMLInputElement => screen.getByTestId('sms-consent-checkbox');
const phoneField = (): HTMLInputElement => screen.getByTestId('settings-profile-phone');
const classesOf = (element: HTMLElement): string[] => element.className.split(/\s+/);

async function openSettings(): Promise<void> {
  render(<SettingsPage />);
  await waitFor(() => expect(screen.getByTestId('settings-loaded')).toBeTruthy());
}

/** Tries every way a form is sent, then gives a save that was started time to go out. */
async function tryToSave(): Promise<void> {
  fireEvent.click(saveButton());
  fireEvent.submit(form());
  await new Promise((resolve) => setTimeout(resolve, 20));
}

describe('Settings that could not be loaded', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (settingsApi.load as jest.Mock).mockResolvedValue(SAVED);
    (settingsApi.update as jest.Mock).mockResolvedValue(true);
    (settingsApi.getNotificationHistory as jest.Mock).mockResolvedValue([]);
    (consentsApi.get as jest.Mock).mockResolvedValue({ serverAi: true });
    (consentsApi.setServerAi as jest.Mock).mockResolvedValue({ serverAi: true });
  });

  it('shows what was saved, with no warning, when both loads work', async () => {
    await openSettings();

    expect(failure()).toBeNull();
    expect(classesOf(form())).not.toContain('hidden');
    expect(saveButton().disabled).toBe(false);
    expect(phoneField().value).toBe(PHONE);
    expect(optIn().checked).toBe(true);
  });

  it.each([
    ['the settings', (): void => void (settingsApi.load as jest.Mock).mockRejectedValue(new Error('500'))],
    ['the consents', (): void => void (consentsApi.get as jest.Mock).mockRejectedValue(new Error('500'))],
  ])('says so and cannot be saved when %s did not load', async (_what, breakIt) => {
    breakIt();

    await openSettings();

    const alert = failure();
    expect(alert).not.toBeNull();
    expect(alert?.getAttribute('role')).toBe('alert');
    expect(alert?.textContent).toContain('Your settings could not be loaded');
    // The defaults are not shown as if they were the person's own.
    expect(classesOf(form())).toContain('hidden');
    expect(saveButton().disabled).toBe(true);

    await tryToSave();

    expect(settingsApi.update).not.toHaveBeenCalled();
    expect(consentsApi.setServerAi).not.toHaveBeenCalled();
  });

  it('loads again on "Try again" and can then be saved with what was saved before', async () => {
    (settingsApi.load as jest.Mock).mockRejectedValueOnce(new Error('network'));
    await openSettings();
    expect(failure()).not.toBeNull();

    fireEvent.click(screen.getByTestId('button-retry-settings'));

    await waitFor(() => expect(failure()).toBeNull());
    expect(settingsApi.load).toHaveBeenCalledTimes(2);
    expect(classesOf(form())).not.toContain('hidden');
    expect(saveButton().disabled).toBe(false);
    expect(phoneField().value).toBe(PHONE);
    expect(optIn().checked).toBe(true);

    fireEvent.submit(form());
    await waitFor(() => expect(settingsApi.update).toHaveBeenCalledTimes(1));
    const sent = (settingsApi.update as jest.Mock).mock.calls[0][0] as {
      profile: { phone: unknown; smsConsent: unknown };
      notifications: { sms: unknown };
    };
    expect(sent.profile).toEqual({ phone: PHONE, smsConsent: true });
    expect(sent.notifications.sms).toBe(true);
    expect(consentsApi.setServerAi).toHaveBeenCalledWith(true);
  });

  it('cannot be saved while it is still loading', async () => {
    (settingsApi.load as jest.Mock).mockReturnValue(new Promise(() => undefined));
    render(<SettingsPage />);

    expect(screen.queryByTestId('settings-loaded')).toBeNull();
    expect(saveButton().disabled).toBe(true);

    await tryToSave();

    expect(settingsApi.update).not.toHaveBeenCalled();
    expect(consentsApi.setServerAi).not.toHaveBeenCalled();
  });

  it('keeps the warning when "Try again" fails too', async () => {
    (settingsApi.load as jest.Mock).mockRejectedValue(new Error('network'));
    await openSettings();

    fireEvent.click(screen.getByTestId('button-retry-settings'));

    await waitFor(() => expect(settingsApi.load).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId('button-retry-settings')).not.toHaveProperty('disabled', true));
    expect(failure()).not.toBeNull();
    expect(saveButton().disabled).toBe(true);
  });
});
