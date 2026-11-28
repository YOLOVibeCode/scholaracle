/**
 * Settings on a narrow phone (320 px): the three choices of "Tone" and of "Frequency" sit in one
 * row, and a row that cannot wrap is wider than the screen. They wrap.
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

const ACCOUNT = {
  profile: {
    name: 'A Parent',
    email: 'parent@example.com',
    phone: '',
    smsConsent: false,
    oauthProviders: [],
  },
  notifications: { push: true, email: true, sms: false, tone: 'casual', frequency: 'minimal' },
  alerts: { gradeDrop: 5, daysBeforeDeadline: 2, lowGradeThreshold: 80 },
  timezone: 'America/Chicago',
};

const classesOf = (element: HTMLElement): string[] => element.className.split(/\s+/);
const radio = (name: string, value: string): HTMLInputElement => {
  const found = document.querySelector<HTMLInputElement>(`input[name="${name}"][value="${value}"]`);
  if (!found) throw new Error(`no ${name} choice "${value}"`);
  return found;
};

async function openSettings(): Promise<void> {
  render(<SettingsPage />);
  await waitFor(() => expect(screen.getByTestId('settings-loaded')).toBeTruthy());
}

describe('Settings on a narrow phone', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (settingsApi.load as jest.Mock).mockResolvedValue(ACCOUNT);
    (settingsApi.getNotificationHistory as jest.Mock).mockResolvedValue([]);
    (consentsApi.get as jest.Mock).mockResolvedValue({ serverAi: false });
  });

  it.each([
    ['tone-options', 'tone', ['formal', 'casual', 'encouraging']],
    ['frequency-options', 'frequency', ['minimal', 'balanced', 'proactive']],
  ])('lets the choices of %s wrap', async (testId, name, values) => {
    await openSettings();

    const row = screen.getByTestId(testId);
    expect(classesOf(row)).toEqual(expect.arrayContaining(['flex', 'flex-wrap']));
    for (const value of values) {
      expect(row.contains(radio(name, value))).toBe(true);
    }
  });

  it('still shows what was saved and takes another choice', async () => {
    await openSettings();

    expect(radio('tone', 'casual').checked).toBe(true);
    expect(radio('frequency', 'minimal').checked).toBe(true);

    fireEvent.click(radio('tone', 'formal'));
    fireEvent.click(radio('frequency', 'proactive'));

    expect(radio('tone', 'formal').checked).toBe(true);
    expect(radio('tone', 'casual').checked).toBe(false);
    expect(radio('frequency', 'proactive').checked).toBe(true);
  });
});
