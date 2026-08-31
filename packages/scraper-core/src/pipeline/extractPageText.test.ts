import { EXTRACTED_TEXT_MAX_CHARS, extractPageText } from './extractPageText';

describe('extractPageText', () => {
  it('strips tags and collapses whitespace', () => {
    expect(extractPageText('<html><body><p>Hello   <b>world</b></p></body></html>')).toBe(
      'Hello world'
    );
  });

  it('drops script and style bodies', () => {
    const html =
      '<html><head><style>body{color:red}</style><script>alert(1)</script></head>' +
      '<body>Visible</body></html>';
    expect(extractPageText(html)).toBe('Visible');
  });

  it('caps length', () => {
    const html = `<p>${'a'.repeat(80)}</p>`;
    expect(extractPageText(html, 10)).toBe('aaaaaaaaaa');
  });

  it('default cap is CLASS_OFFLINE_PACK 50 KB', () => {
    expect(EXTRACTED_TEXT_MAX_CHARS).toBe(50_000);
  });
});
