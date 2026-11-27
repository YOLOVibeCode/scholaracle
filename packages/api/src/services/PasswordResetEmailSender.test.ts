import type { MailService } from '@sendgrid/mail';
import { SendGridPasswordResetEmailSender } from './PasswordResetEmailSender';

interface ISentMail {
  readonly to: string;
  readonly from: { email: string; name: string };
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

function fakeMail(): { mail: MailService; sent: ISentMail[] } {
  const sent: ISentMail[] = [];
  const mail = {
    setApiKey: jest.fn(),
    send: jest.fn(async (message: ISentMail) => {
      sent.push(message);
    }),
  } as unknown as MailService;
  return { mail, sent };
}

const RESET_URL = 'https://scholarmancy.com/reset-password?token=abc123';

describe('SendGridPasswordResetEmailSender', () => {
  it('calls the product Scholarmancy, the name the parent signed up under', async () => {
    const { mail, sent } = fakeMail();
    const sender = new SendGridPasswordResetEmailSender(
      { apiKey: 'SG.test', fromEmail: 'notifications@scholarmancy.com', fromName: 'Scholarmancy' },
      mail
    );

    await sender.sendResetLink('parent@example.com', RESET_URL);

    expect(sent).toHaveLength(1);
    const message = sent[0]!;
    expect(message.subject).toBe('Reset your Scholarmancy password');
    expect(message.html).toContain('your Scholarmancy account');
    expect(`${message.subject} ${message.text} ${message.html}`).not.toContain('Scholaracle');
  });

  it('sends the reset link to the address that asked, from the configured sender', async () => {
    const { mail, sent } = fakeMail();
    const sender = new SendGridPasswordResetEmailSender(
      { apiKey: 'SG.test', fromEmail: 'notifications@scholarmancy.com', fromName: 'Scholarmancy' },
      mail
    );

    await sender.sendResetLink('parent@example.com', RESET_URL);

    const message = sent[0]!;
    expect(message.to).toBe('parent@example.com');
    expect(message.from).toEqual({
      email: 'notifications@scholarmancy.com',
      name: 'Scholarmancy',
    });
    expect(message.text).toContain(RESET_URL);
    expect(message.html).toContain(`href="${RESET_URL}"`);
  });

  it('sends nothing when no mail key is configured', async () => {
    const { mail, sent } = fakeMail();
    const sender = new SendGridPasswordResetEmailSender(
      { apiKey: '', fromEmail: 'notifications@scholarmancy.com', fromName: 'Scholarmancy' },
      mail
    );

    await sender.sendResetLink('parent@example.com', RESET_URL);

    expect(sent).toHaveLength(0);
  });
});
