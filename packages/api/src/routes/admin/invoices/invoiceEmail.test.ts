import { buildInvoiceEmail } from './invoices';

const PAYMENT = {
  amount: 2500,
  createdAt: new Date('2026-11-13T15:00:00.000Z'),
  description: 'Scholarmancy Family, monthly',
};

describe('buildInvoiceEmail', () => {
  it('comes from the Scholarmancy sender when nothing else is configured', () => {
    const email = buildInvoiceEmail(PAYMENT, 'parent@example.com', {}, {});

    expect(email.from).toEqual({
      email: 'notifications@scholarmancy.com',
      name: 'Scholarmancy',
    });
  });

  it('uses the sender the server sends every other email from', () => {
    const email = buildInvoiceEmail(
      PAYMENT,
      'parent@example.com',
      {},
      {
        SENDGRID_FROM_EMAIL: 'billing@scholarmancy.com',
        SENDGRID_FROM_NAME: 'Scholarmancy Billing',
      }
    );

    expect(email.from).toEqual({
      email: 'billing@scholarmancy.com',
      name: 'Scholarmancy Billing',
    });
  });

  it('lets the router config override the environment', () => {
    const email = buildInvoiceEmail(
      PAYMENT,
      'parent@example.com',
      { fromEmail: 'config@scholarmancy.com', fromName: 'From Config' },
      { SENDGRID_FROM_EMAIL: 'env@scholarmancy.com', SENDGRID_FROM_NAME: 'From Env' }
    );

    expect(email.from).toEqual({ email: 'config@scholarmancy.com', name: 'From Config' });
  });

  it('still honours EMAIL_FROM, the variable this route read before', () => {
    const email = buildInvoiceEmail(
      PAYMENT,
      'parent@example.com',
      {},
      { EMAIL_FROM: 'legacy@scholarmancy.com' }
    );

    expect(email.from.email).toBe('legacy@scholarmancy.com');
  });

  it('calls the product Scholarmancy in the subject and the signature', () => {
    const email = buildInvoiceEmail(PAYMENT, 'parent@example.com', {}, {});

    expect(email.subject).toBe('Scholarmancy Invoice — $25.00');
    expect(email.html).toContain('— Scholarmancy</p>');
    expect(`${email.subject} ${email.html}`).not.toContain('Scholaracle');
    expect(email.from.email).not.toContain('scholaracle');
  });

  it('states the amount, addresses the customer and links to billing on the configured site', () => {
    const email = buildInvoiceEmail(
      PAYMENT,
      'parent@example.com',
      { baseUrl: 'https://scholarmancy.com' },
      {}
    );

    expect(email.to).toBe('parent@example.com');
    expect(email.html).toContain('<strong>$25.00</strong>');
    expect(email.html).toContain('Scholarmancy Family, monthly');
    expect(email.html).toContain('href="https://scholarmancy.com/dashboard/billing"');
  });
});
