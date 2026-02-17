import type { IEmailEnvelope, IEmailTransportResult } from './IEmailTransport';
import type { MailService } from '@sendgrid/mail';

/**
 * SendGrid implementation of IEmailTransport (ISP).
 */
export class SendGridTransport {
  constructor(
    apiKey: string,
    private readonly _mailService: MailService
  ) {
    this._mailService.setApiKey(apiKey);
  }

  async send(envelope: IEmailEnvelope): Promise<IEmailTransportResult> {
    const [response] = await this._mailService.send({
      to: envelope.to,
      from: envelope.from,
      subject: envelope.subject,
      text: envelope.text,
      html: envelope.html,
    });

    if (response.statusCode !== 202) {
      throw new Error(`SendGrid returned status ${response.statusCode}`);
    }

    const messageId =
      typeof response.body === 'object' &&
      response.body !== null &&
      'message_id' in response.body
        ? String(response.body.message_id)
        : undefined;

    return { messageId };
  }
}
