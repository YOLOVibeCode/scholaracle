import type { IEmailEnvelope, IEmailTransportResult } from './IEmailTransport';
import type { MailService } from '@sendgrid/mail';

/**
 * SendGrid implementation of IEmailTransport (ISP).
 */
export class SendGridTransport {
  constructor(
    apiKey: string,
    private readonly _mailService: MailService,
    baseUrl?: string
  ) {
    this._mailService.setApiKey(apiKey);
    if (baseUrl) {
      // MailService's typings hide its underlying @sendgrid/client instance, but it
      // always exists at runtime. Overriding the default request baseUrl lets a
      // deployment route mail through a SendGrid-compatible API relay (e.g. the
      // Noctusoft gateway) with no other code changes.
      const svc = this._mailService as unknown as {
        client?: { setDefaultRequest(key: 'baseUrl', value: string): void };
      };
      svc.client?.setDefaultRequest('baseUrl', baseUrl);
    }
  }

  async send(envelope: IEmailEnvelope): Promise<IEmailTransportResult> {
    const [response] = await this._mailService.send({
      to: envelope.to,
      from: envelope.from,
      ...(envelope.replyTo && { replyTo: envelope.replyTo }),
      subject: envelope.subject,
      text: envelope.text,
      html: envelope.html,
    });

    if (response.statusCode !== 202) {
      throw new Error(`SendGrid returned status ${response.statusCode}`);
    }

    const messageId =
      typeof response.body === 'object' && response.body !== null && 'message_id' in response.body
        ? String(response.body.message_id)
        : undefined;

    return { messageId };
  }
}
