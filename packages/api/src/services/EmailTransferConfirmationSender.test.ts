import type { MailService } from '@sendgrid/mail';
import {
  SendGridEmailTransferConfirmationSender,
  renderEmailTransferConfirmation,
} from './EmailTransferConfirmationSender';

const OPTS = {
  to: 'old@example.com',
  studentName: 'Ava <b>',
  confirmUrl: 'https://scholarmancy.com/dashboard/students/abc/contacts/transfer-confirm?token=t1',
  expiresInHours: 48,
};

describe('renderEmailTransferConfirmation', () => {
  it('says what it is: a confirmation of an email change for the student, with one link', () => {
    const { subject, html, text } = renderEmailTransferConfirmation(OPTS);
    expect(subject).toBe('Confirm your new email for Ava <b>');
    expect(html).toContain(`href="${OPTS.confirmUrl}"`);
    expect(html).toContain('Confirm email change');
    expect(html).toContain('Ava &lt;b&gt;');
    expect(html).not.toContain('invited');
    expect(html).not.toContain('/register?invite=');
    expect(html).not.toContain('/dashboard/invites');
    expect(text).toContain(OPTS.confirmUrl);
    expect(text).toContain('valid 48 hours');
  });
});

describe('SendGridEmailTransferConfirmationSender', () => {
  function fakeMail(): MailService & { sent: unknown[] } {
    const sent: unknown[] = [];
    return {
      sent,
      setApiKey: () => undefined,
      send: async (msg: unknown) => {
        sent.push(msg);
        return [{ statusCode: 202 }, {}];
      },
    } as unknown as MailService & { sent: unknown[] };
  }

  it('no-ops without an API key and sends with one', async () => {
    const quiet = fakeMail();
    await new SendGridEmailTransferConfirmationSender(
      { apiKey: '', fromEmail: 'noreply@scholarmancy.com', fromName: 'Scholarmancy' },
      quiet
    ).sendConfirmation(OPTS);
    expect(quiet.sent).toHaveLength(0);

    const live = fakeMail();
    await new SendGridEmailTransferConfirmationSender(
      { apiKey: 'test-key', fromEmail: 'noreply@scholarmancy.com', fromName: 'Scholarmancy' },
      live
    ).sendConfirmation(OPTS);
    expect(live.sent).toHaveLength(1);
    expect(live.sent[0]).toMatchObject({
      to: 'old@example.com',
      subject: 'Confirm your new email for Ava <b>',
    });
  });
});
