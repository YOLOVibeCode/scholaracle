import type { IEmailEnvelope, IEmailTransportResult } from './IEmailTransport';
import type { Transporter } from 'nodemailer';

export interface ISmtpTransportConfig {
  readonly host: string;
  readonly port: number;
}

/**
 * SMTP implementation of IEmailTransport (ISP).
 * Used with Mailpit or any SMTP server for local/dev email testing.
 */
export class SmtpTransport {
  constructor(
    _config: ISmtpTransportConfig,
    private readonly _transporter: Transporter
  ) {}

  async send(envelope: IEmailEnvelope): Promise<IEmailTransportResult> {
    const result = await this._transporter.sendMail({
      to: envelope.to,
      from: `${envelope.from.name} <${envelope.from.email}>`,
      ...(envelope.replyTo && { replyTo: envelope.replyTo }),
      subject: envelope.subject,
      text: envelope.text,
      html: envelope.html,
    });

    return {
      messageId: result.messageId,
    };
  }
}
