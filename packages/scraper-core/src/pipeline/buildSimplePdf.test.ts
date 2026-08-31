import { buildSimplePdf } from './buildSimplePdf';

describe('buildSimplePdf', () => {
  it('produces a PDF that contains the title and a body line', () => {
    const bytes = buildSimplePdf('Lab Safety Handout', 'Wear goggles at all times.');
    const asText = new TextDecoder().decode(bytes);
    expect(asText.startsWith('%PDF-')).toBe(true);
    expect(asText).toContain('Lab Safety Handout');
    expect(asText).toContain('Wear goggles at all times.');
    expect(asText).toContain('%%EOF');
  });

  it('escapes parentheses in body text', () => {
    const bytes = buildSimplePdf('Notes', 'See (Appendix A).');
    const asText = new TextDecoder().decode(bytes);
    expect(asText).toContain('\\(Appendix A\\)');
  });
});
