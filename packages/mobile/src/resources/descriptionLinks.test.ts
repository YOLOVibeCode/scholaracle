import { extractDescriptionLinks, stripHtmlToText } from './descriptionLinks';

describe('extractDescriptionLinks', () => {
  it('returns empty array for plain text with no anchors', () => {
    expect(extractDescriptionLinks('Complete the worksheet.')).toEqual([]);
  });

  it('extracts a single anchor', () => {
    const html = '<p>See <a href="https://khanacademy.org/bio">Khan Academy</a></p>';
    expect(extractDescriptionLinks(html)).toEqual([
      { href: 'https://khanacademy.org/bio', text: 'Khan Academy' },
    ]);
  });

  it('extracts multiple anchors', () => {
    const html =
      '<a href="https://example.com/rubric.pdf">Rubric</a> and ' +
      '<a href="https://www.sparknotes.com/lit/mocking/">SparkNotes</a>';
    const links = extractDescriptionLinks(html);
    expect(links).toHaveLength(2);
    expect(links[0]).toEqual({ href: 'https://example.com/rubric.pdf', text: 'Rubric' });
    expect(links[1]).toEqual({
      href: 'https://www.sparknotes.com/lit/mocking/',
      text: 'SparkNotes',
    });
  });

  it('uses href as text when anchor has no visible text', () => {
    const html = '<a href="https://example.com/file.pdf"></a>';
    expect(extractDescriptionLinks(html)).toEqual([
      { href: 'https://example.com/file.pdf', text: 'https://example.com/file.pdf' },
    ]);
  });

  it('strips inner tags from anchor text', () => {
    const html = '<a href="https://example.com"><strong>Bold link</strong></a>';
    expect(extractDescriptionLinks(html)).toEqual([
      { href: 'https://example.com', text: 'Bold link' },
    ]);
  });

  it('ignores javascript: hrefs', () => {
    const html = '<a href="javascript:void(0)">Click me</a>';
    expect(extractDescriptionLinks(html)).toEqual([]);
  });

  it('handles single-quote href attributes', () => {
    const html = "<a href='https://example.com/doc'>Document</a>";
    expect(extractDescriptionLinks(html)).toEqual([
      { href: 'https://example.com/doc', text: 'Document' },
    ]);
  });
});

describe('stripHtmlToText', () => {
  it('removes tags from plain text', () => {
    expect(stripHtmlToText('<p>Hello world</p>')).toBe('Hello world');
  });

  it('converts <br> to newline', () => {
    expect(stripHtmlToText('Line 1<br>Line 2')).toBe('Line 1\nLine 2');
  });

  it('converts </p> to newline', () => {
    expect(stripHtmlToText('<p>First</p><p>Second</p>')).toBe('First\nSecond');
  });

  it('decodes common HTML entities', () => {
    const result = stripHtmlToText('a &amp; b &lt;c&gt; &quot;d&quot;');
    expect(result).toBe('a & b <c> "d"');
  });

  it('converts &nbsp; to a space', () => {
    expect(stripHtmlToText('before&nbsp;after')).toBe('before after');
  });

  it('collapses whitespace', () => {
    expect(stripHtmlToText('  lots   of   spaces  ')).toBe('lots of spaces');
  });
});
