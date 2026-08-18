/**
 * SOURCE_INVITE.md §7
 */

import type { MailService } from '@sendgrid/mail';
import { SendGridSourceInviteEmailSender } from './SourceInviteEmailSender';

describe('SendGridSourceInviteEmailSender', () => {
  const landingUrl = `https://api.example.com/install-source?t=${'ab'.repeat(32)}`;

  it('empty apiKey no-ops', async () => {
    const send = jest.fn();
    const sender = new SendGridSourceInviteEmailSender(
      { apiKey: '', fromEmail: 'noreply@example.com', fromName: 'Scholarmancy' },
      { send, setApiKey: jest.fn() } as unknown as MailService
    );
    await sender.sendInstallLink({
      to: 'parent@example.com',
      providerName: 'Skyward Family Access',
      studentName: 'Ava Lewis',
      landingUrl,
      expiresAt: new Date('2026-08-22T00:00:00.000Z'),
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('send uses branded html, Skyward subject, landing URL, no password', async () => {
    const send = jest.fn().mockResolvedValue([{}]);
    const sender = new SendGridSourceInviteEmailSender(
      { apiKey: 'SG.test', fromEmail: 'noreply@example.com', fromName: 'Scholarmancy' },
      { send, setApiKey: jest.fn() } as unknown as MailService
    );
    await sender.sendInstallLink({
      to: 'parent@example.com',
      providerName: 'Skyward Family Access',
      studentName: 'Ava Lewis',
      landingUrl,
      expiresAt: new Date('2026-08-22T00:00:00.000Z'),
    });
    expect(send).toHaveBeenCalledTimes(1);
    const msg = send.mock.calls[0]?.[0] as { subject: string; html: string; text: string };
    expect(msg.subject).toContain('Skyward');
    expect(msg.html).toContain(landingUrl);
    expect(msg.text).toContain(landingUrl);
    expect(msg.html.toLowerCase()).not.toContain('password=');
    expect(msg.html).not.toContain('skyward.iscorp.com');
  });
});
