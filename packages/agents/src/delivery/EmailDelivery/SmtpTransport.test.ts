import { SmtpTransport } from './SmtpTransport';
import { IEmailEnvelope } from './IEmailTransport';

describe('SmtpTransport', () => {
  let mockSendMail: jest.Mock;
  let transport: SmtpTransport;

  const envelope: IEmailEnvelope = {
    to: 'recipient@example.com',
    from: { email: 'from@example.com', name: 'From Name' },
    subject: 'Test Subject',
    text: 'Plain text',
    html: '<p>HTML body</p>',
  };

  beforeEach(() => {
    mockSendMail = jest.fn();
    transport = new SmtpTransport(
      { host: 'localhost', port: 1025 },
      { sendMail: mockSendMail } as any
    );
  });

  it('calls transporter.sendMail() with correct shape', async () => {
    mockSendMail.mockResolvedValue({ messageId: 'smtp-msg-456' });

    await transport.send(envelope);

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail).toHaveBeenCalledWith({
      to: envelope.to,
      from: `${envelope.from.name} <${envelope.from.email}>`,
      subject: envelope.subject,
      text: envelope.text,
      html: envelope.html,
    });
  });

  it('returns messageId from nodemailer response', async () => {
    const messageId = 'smtp-msg-456';
    mockSendMail.mockResolvedValue({ messageId });

    const result = await transport.send(envelope);

    expect(result.messageId).toBe(messageId);
  });

  it('throws on sendMail error', async () => {
    mockSendMail.mockRejectedValue(new Error('Connection refused'));

    await expect(transport.send(envelope)).rejects.toThrow('Connection refused');
  });
});
