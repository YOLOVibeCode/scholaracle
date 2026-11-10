import type { IEmailEnvelope, IEmailTransport } from '@scholaracle/agents';
import {
  SharingInviteEmailSender,
  joinNames,
  renderSharingInviteEmail,
  renderSharingLeftEmail,
} from './SharingInviteEmailSender';

const RAW_TOKEN = 'tok_3f9a-SECRET-base64url';
const INVITE = {
  to: 'jessica@example.com',
  recipientName: 'Jessica',
  inviterName: 'Ricardo',
  studentNames: ['Ava', 'Christian', 'Gideon'],
  inviteUrl: `https://scholarmancy.com/magic?token=${RAW_TOKEN}`,
  baseUrl: 'https://scholarmancy.com/',
  expiresInDays: 7,
};

describe('renderSharingInviteEmail', () => {
  it('names every student once, in the subject, the list and the plain text', () => {
    const { subject, html, text } = renderSharingInviteEmail(INVITE);
    expect(subject).toBe('Ricardo invited you to follow Ava, Christian and Gideon on Scholarmancy');
    for (const name of INVITE.studentNames) {
      expect(html).toContain(`<li>${name}</li>`);
      expect(text).toContain(`  - ${name}`);
    }
  });

  it('has one accept button to /magic?token= and the sign-in fallback line', () => {
    const { html, text } = renderSharingInviteEmail(INVITE);
    expect(html.match(/\/magic\?token=/g)).toHaveLength(1);
    expect(html).toContain(`href="https://scholarmancy.com/magic?token=${RAW_TOKEN}"`);
    expect(html).toContain('Accept invitation');
    expect(html).toContain('sign in at <a href="https://scholarmancy.com">');
    expect(html).toContain('and open Invites');
    expect(text).toContain(INVITE.inviteUrl);
    expect(text).toContain('Or sign in at https://scholarmancy.com and open Invites.');
    // The dead S0 links are gone.
    expect(html).not.toContain('/register?invite=');
    expect(html).not.toContain('/dashboard/invites');
  });

  it('escapes names so an inviter or student cannot inject HTML', () => {
    const { html } = renderSharingInviteEmail({
      ...INVITE,
      inviterName: '<script>alert(1)</script>',
      studentNames: ['Ava "A" <b>'],
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('<li>Ava &quot;A&quot; &lt;b&gt;</li>');
  });

  it('contains nothing but the one-time token: no ids, hashes or passwords', () => {
    const { html, text } = renderSharingInviteEmail(INVITE);
    for (const body of [html, text]) {
      expect(body).not.toMatch(/inviteGroupId|passwordHash|tokenHash|sha256/i);
      expect(body).not.toMatch(/[0-9a-f]{24}/); // no Mongo ids leak into the mail
    }
  });

  it('joinNames reads naturally for one, two and many', () => {
    expect(joinNames(['Ava'])).toBe('Ava');
    expect(joinNames(['Ava', 'Christian'])).toBe('Ava and Christian');
    expect(joinNames(['Ava', 'Christian', 'Gideon'])).toBe('Ava, Christian and Gideon');
    expect(joinNames([])).toBe('a student');
  });
});

describe('renderSharingLeftEmail', () => {
  it('tells the owner who stopped following whom', () => {
    const { subject, text, html } = renderSharingLeftEmail({
      to: 'owner@example.com',
      leaverName: 'Jennifer',
      studentName: 'Gideon',
      baseUrl: 'https://scholarmancy.com',
    });
    expect(subject).toBe('Jennifer no longer follows Gideon on Scholarmancy');
    expect(text).toContain('Jennifer no longer follows Gideon.');
    expect(html).toContain('href="https://scholarmancy.com/dashboard"');
  });
});

describe('SharingInviteEmailSender', () => {
  function captureTransport(): IEmailTransport & { sent: IEmailEnvelope[] } {
    const sent: IEmailEnvelope[] = [];
    return {
      sent,
      async send(envelope) {
        sent.push(envelope);
        return { messageId: 'm-1' };
      },
    };
  }

  it('sends one email per invitation through the app transport, from the configured sender', async () => {
    const transport = captureTransport();
    const sender = new SharingInviteEmailSender(transport, {
      fromEmail: 'noreply@scholarmancy.com',
      fromName: 'Scholarmancy',
    });

    await sender.sendInvite(INVITE);

    expect(transport.sent).toHaveLength(1);
    const mail = transport.sent[0]!;
    expect(mail.to).toBe('jessica@example.com');
    expect(mail.from).toEqual({ email: 'noreply@scholarmancy.com', name: 'Scholarmancy' });
    expect(mail.subject).toContain('Ava, Christian and Gideon');
    expect(mail.html).toContain('/magic?token=');
  });

  it('sends the owner notice through the same transport', async () => {
    const transport = captureTransport();
    const sender = new SharingInviteEmailSender(transport, {
      fromEmail: 'noreply@scholarmancy.com',
      fromName: 'Scholarmancy',
    });

    await sender.sendLeftNotice({
      to: 'owner@example.com',
      leaverName: 'Robert',
      studentName: 'Ava',
      baseUrl: 'https://scholarmancy.com',
    });

    expect(transport.sent.map((m) => m.subject)).toEqual([
      'Robert no longer follows Ava on Scholarmancy',
    ]);
  });
});
