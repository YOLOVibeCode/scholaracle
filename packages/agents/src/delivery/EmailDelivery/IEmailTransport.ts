/**
 * Segregated interface for sending a single email (ISP).
 * Implementations: SendGridTransport, SmtpTransport.
 */

export interface IEmailEnvelope {
  readonly to: string;
  readonly from: { readonly email: string; readonly name: string };
  readonly replyTo?: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

export interface IEmailTransportResult {
  readonly messageId?: string;
}

export interface IEmailTransport {
  send(envelope: IEmailEnvelope): Promise<IEmailTransportResult>;
}
