import { SendGridTransport } from './SendGridTransport';
import { IEmailEnvelope } from './IEmailTransport';
import { MailService } from '@sendgrid/mail';

describe('SendGridTransport', () => {
  let transport: SendGridTransport;
  let mockSend: jest.Mock;
  let mockSetApiKey: jest.Mock;

  const envelope: IEmailEnvelope = {
    to: 'recipient@example.com',
    from: { email: 'from@example.com', name: 'From Name' },
    subject: 'Test Subject',
    text: 'Plain text',
    html: '<p>HTML body</p>',
  };

  beforeEach(() => {
    mockSend = jest.fn();
    mockSetApiKey = jest.fn();
    const mockMailService = {
      setApiKey: mockSetApiKey,
      send: mockSend,
    } as unknown as MailService;
    transport = new SendGridTransport('test-api-key', mockMailService);
  });

  it('calls mailService.send() with correct shape', async () => {
    mockSend.mockResolvedValue([{ statusCode: 202, body: {}, headers: {} }, {}]);

    await transport.send(envelope);

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith({
      to: envelope.to,
      from: envelope.from,
      subject: envelope.subject,
      text: envelope.text,
      html: envelope.html,
    });
  });

  it('returns messageId from response when present', async () => {
    const messageId = 'sg-msg-123';
    mockSend.mockResolvedValue([
      { statusCode: 202, body: { message_id: messageId }, headers: {} },
      {},
    ]);

    const result = await transport.send(envelope);

    expect(result.messageId).toBe(messageId);
  });

  it('throws on non-202 status', async () => {
    mockSend.mockResolvedValue([
      { statusCode: 500, body: { error: 'Internal error' }, headers: {} },
      {},
    ]);

    await expect(transport.send(envelope)).rejects.toThrow(/status 500/);
  });
});
