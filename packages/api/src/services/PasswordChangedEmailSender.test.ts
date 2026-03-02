import type { MailService } from '@sendgrid/mail';
import {
  SendGridPasswordChangedEmailSender,
  type ISendGridPasswordChangedConfig,
} from './PasswordChangedEmailSender';

describe('SendGridPasswordChangedEmailSender', () => {
  const mockSend = jest.fn().mockResolvedValue([{ statusCode: 202 }]);

  const sendGrid = { send: mockSend } as unknown as MailService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should no-op when apiKey is empty', async () => {
    const config: ISendGridPasswordChangedConfig = {
      apiKey: '',
      fromEmail: 'noreply@test.com',
      fromName: 'Test',
    };
    const sender = new SendGridPasswordChangedEmailSender(config, sendGrid);
    await sender.sendPasswordChanged({ to: 'user@test.com', baseUrl: 'https://app.example.com' });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('should send email with correct subject and branded body when configured', async () => {
    const config: ISendGridPasswordChangedConfig = {
      apiKey: 'sk-test',
      fromEmail: 'notifications@scholarmancy.com',
      fromName: 'Scholarmancy',
    };
    const sender = new SendGridPasswordChangedEmailSender(config, sendGrid);
    await sender.sendPasswordChanged({ to: 'user@test.com', baseUrl: 'https://app.example.com' });

    expect(mockSend).toHaveBeenCalledTimes(1);
    const [envelope] = mockSend.mock.calls[0];
    expect(envelope.to).toBe('user@test.com');
    expect(envelope.subject).toBe('Your Scholarmancy password has been changed');
    expect(envelope.from).toEqual({
      email: 'notifications@scholarmancy.com',
      name: 'Scholarmancy',
    });
    expect(envelope.html).toContain('Scholarmancy');
    expect(envelope.html).toContain('password was changed by a support administrator');
    expect(envelope.html).toContain('reset-password');
    expect(envelope.html).toContain('https://app.example.com');
  });
});
