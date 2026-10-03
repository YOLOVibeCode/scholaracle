import {
  SCHOLARMANCY_SMS_BRAND,
  SCHOLARMANCY_SMS_PURPOSE,
  buildSmsOptInLabelHtml,
} from './smsCompliance';

describe('smsCompliance constants', () => {
  it('uses Scholarmancy brand and purpose in opt-in label', () => {
    const label = buildSmsOptInLabelHtml();
    expect(label).toContain(SCHOLARMANCY_SMS_BRAND);
    expect(label).toContain(SCHOLARMANCY_SMS_PURPOSE);
    expect(label).toContain('Message frequency varies');
  });
});
