import { buildBrandedEmail } from './emailTemplate';

describe('buildBrandedEmail', () => {
  it('should include Scholarmancy header with dark background', () => {
    const html = buildBrandedEmail({ title: 'Test', bodyHtml: '<p>Body</p>' });
    expect(html).toContain('Scholarmancy');
    expect(html).toContain('#1a1a1a');
    expect(html).toMatch(/<div[^>]*header[^>]*>/i);
  });

  it('should include body content in container', () => {
    const bodyHtml = '<p>Hello world</p>';
    const html = buildBrandedEmail({ title: 'Test', bodyHtml });
    expect(html).toContain(bodyHtml);
    expect(html).toContain('container');
  });

  it('should include muted footer with contact email', () => {
    const html = buildBrandedEmail({ title: 'Test', bodyHtml: '<p>Body</p>' });
    expect(html).toContain('notifications@scholarmancy.com');
    expect(html).toContain('Sent by Scholarmancy');
  });

  it('should include optional footer note when provided', () => {
    const html = buildBrandedEmail({
      title: 'Test',
      bodyHtml: '<p>Body</p>',
      footerNote: 'Unsubscribe from alerts in settings.',
    });
    expect(html).toContain('Unsubscribe from alerts in settings.');
  });

  it('should escape title and footerNote to prevent XSS', () => {
    const html = buildBrandedEmail({
      title: '<script>alert(1)</script>',
      bodyHtml: '<p>Safe</p>',
      footerNote: 'Click <a href="evil">here</a>',
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;a href=');
  });
});
