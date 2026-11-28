/**
 * Settings: the two controls that decide whether alerts go by text.
 *
 * The opt-in box (Profile) says "text me grade and assignment alerts". Texts go out only
 * when the number, that box and the "SMS Notifications" switch are all there, so ticking
 * the box turns the switch on with it, and the page says what is missing when it is not.
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

interface ISavedTexts {
  readonly phone?: string;
  readonly smsConsent?: boolean;
  readonly sms?: boolean;
}

/** What the API returns for an account whose text settings are these. */
function account(saved: ISavedTexts): unknown {
  return {
    profile: {
      name: 'A Parent',
      email: 'parent@example.com',
      phone: saved.phone ?? '',
      smsConsent: saved.smsConsent ?? false,
      oauthProviders: [],
    },
    notifications: { push: true, email: true, sms: saved.sms ?? false },
    alerts: { gradeDrop: 5, daysBeforeDeadline: 2, lowGradeThreshold: 80 },
    timezone: 'America/Chicago',
  };
}

async function openSettings(saved: ISavedTexts): Promise<void> {
  (settingsApi.load as jest.Mock).mockResolvedValue(account(saved));
  render(<SettingsPage />);
  await waitFor(() => expect(screen.getByTestId('settings-loaded')).toBeTruthy());
}

const optIn = (): HTMLInputElement => screen.getByTestId('sms-consent-checkbox');
const textSwitch = (): HTMLInputElement => screen.getByTestId('toggle-sms');
const phoneField = (): HTMLInputElement => screen.getByTestId('settings-profile-phone');
const note = (): string | null => screen.queryByTestId('sms-toggle-note')?.textContent ?? null;

/** Saves, and returns what was sent about texts. */
async function save(): Promise<{ phone: unknown; smsConsent: unknown; sms: unknown }> {
  fireEvent.submit(screen.getByTestId('settings-form'));
  await waitFor(() => expect(settingsApi.update).toHaveBeenCalledTimes(1));
  const sent = (settingsApi.update as jest.Mock).mock.calls[0][0] as {
    profile: { phone: unknown; smsConsent: unknown };
    notifications: { sms: unknown };
  };
  return {
    phone: sent.profile.phone,
    smsConsent: sent.profile.smsConsent,
    sms: sent.notifications.sms,
  };
}

describe('Settings: alerts by text', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (settingsApi.update as jest.Mock).mockResolvedValue(true);
    (settingsApi.getNotificationHistory as jest.Mock).mockResolvedValue([]);
    (consentsApi.get as jest.Mock).mockResolvedValue({ serverAi: false });
    (consentsApi.setServerAi as jest.Mock).mockResolvedValue({ serverAi: false });
  });

  it('leaves both off for an account that never asked for texts', async () => {
    await openSettings({});

    expect(optIn().checked).toBe(false);
    expect(textSwitch().checked).toBe(false);
    expect(note()).toBeNull();
  });

  it('turns SMS notifications on when the opt-in is ticked, and saves both', async () => {
    await openSettings({});

    fireEvent.change(phoneField(), { target: { value: PHONE } });
    fireEvent.click(optIn());

    expect(optIn().checked).toBe(true);
    expect(textSwitch().checked).toBe(true);
    expect(note()).toBeNull();
    expect(await save()).toEqual({ phone: PHONE, smsConsent: true, sms: true });
  });

  it('turns SMS notifications off when the opt-in is unticked, and saves both', async () => {
    await openSettings({ phone: PHONE, smsConsent: true, sms: true });
    expect(optIn().checked).toBe(true);
    expect(textSwitch().checked).toBe(true);

    fireEvent.click(optIn());

    expect(optIn().checked).toBe(false);
    expect(textSwitch().checked).toBe(false);
    expect(await save()).toEqual({ phone: PHONE, smsConsent: false, sms: false });
  });

  it('lets texts be paused with the switch alone: the opt-in stays as it was', async () => {
    await openSettings({ phone: PHONE, smsConsent: true, sms: true });

    fireEvent.click(textSwitch());

    expect(textSwitch().checked).toBe(false);
    expect(optIn().checked).toBe(true);
    expect(note()).toBeNull();
    expect(await save()).toEqual({ phone: PHONE, smsConsent: true, sms: false });
  });

  it('shows an account as it was saved: the opt-in ticked and the switch off stay that way', async () => {
    await openSettings({ phone: PHONE, smsConsent: true, sms: false });

    expect(optIn().checked).toBe(true);
    expect(textSwitch().checked).toBe(false);
  });

  it('says what is missing when the switch is on and texts cannot go out', async () => {
    await openSettings({});

    expect(textSwitch().getAttribute('aria-describedby')).toBeNull();

    fireEvent.click(textSwitch());
    expect(textSwitch().checked).toBe(true);
    // The switch does not tick the opt-in for the person: consent is theirs to give.
    expect(optIn().checked).toBe(false);
    expect(note()).toBe(
      'No texts will be sent yet: add your mobile number and tick the text opt-in under Profile.'
    );
    // A screen reader reads the note with the switch it is about.
    expect(textSwitch().getAttribute('aria-describedby')).toBe(
      screen.getByTestId('sms-toggle-note').id
    );

    fireEvent.change(phoneField(), { target: { value: PHONE } });
    expect(note()).toBe('No texts will be sent yet: tick the text opt-in under Profile.');

    fireEvent.click(optIn());
    expect(note()).toBeNull();

    fireEvent.change(phoneField(), { target: { value: '   ' } });
    expect(note()).toBe('No texts will be sent yet: add your mobile number under Profile.');
  });
});
