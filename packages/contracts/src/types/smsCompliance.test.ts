import {
  SCHOLARMANCY_SMS_BRAND,
  SCHOLARMANCY_SMS_PURPOSE,
  SMS_STOP_SUFFIX,
  SMS_CONTACT_OPT_IN_PATH,
  SMS_CONSENT_REQUIRED_MESSAGE,
  buildSmsOptInLabelHtml,
  buildSmsContactOptInUrl,
} from './smsCompliance';

describe('smsCompliance constants', () => {
  it('uses Scholarmancy brand and purpose in opt-in label', () => {
    const label = buildSmsOptInLabelHtml();
    expect(label).toContain(SCHOLARMANCY_SMS_BRAND);
    expect(label).toContain(SCHOLARMANCY_SMS_PURPOSE);
    expect(label).toContain('Message frequency varies');
  });
});

describe('contact self opt-in', () => {
  it('builds the public opt-in URL from the web origin and token', () => {
    expect(buildSmsContactOptInUrl('https://scholarmancy.com/', 'abc123')).toBe(
      `https://scholarmancy.com${SMS_CONTACT_OPT_IN_PATH}/abc123`
    );
  });

  it('says a number alone is not consent', () => {
    expect(SMS_CONSENT_REQUIRED_MESSAGE).toMatch(/not consent/);
  });

  it('uses a STOP suffix carriers recognize', () => {
    expect(SMS_STOP_SUFFIX).toBe('Reply STOP to opt out.');
  });
});
