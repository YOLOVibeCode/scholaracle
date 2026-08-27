import { extractDescriptionLinks, stripHtmlToText } from './descriptionLinks';

describe('extractDescriptionLinks', () => {
  it('returns empty array for plain text with no anchors', () => {
    expect(extractDescriptionLinks('Complete the worksheet.')).toEqual([]);
  });

  it('extracts a single anchor with double-quoted href', () => {
    const html = '<p>See <a href="https://khanacademy.org/bio">Khan Academy</a></p>';
    expect(extractDescriptionLinks(html)).toEqual([
      { href: 'https://khanacademy.org/bio', text: 'Khan Academy' },
    ]);
  });

  it('extracts a single anchor with single-quoted href', () => {
    const html = "<a href='https://example.com/doc'>Document</a>";
    expect(extractDescriptionLinks(html)).toEqual([
      { href: 'https://example.com/doc', text: 'Document' },
    ]);
  });

  it('extracts multiple anchors', () => {
    const html =
      '<a href="https://example.com/rubric.pdf">Rubric</a> and ' +
      '<a href="https://www.sparknotes.com/lit/mocking/">SparkNotes</a>';
    const links = extractDescriptionLinks(html);
    expect(links).toHaveLength(2);
    expect(links[0]).toEqual({ href: 'https://example.com/rubric.pdf', text: 'Rubric' });
    expect(links[1]).toEqual({ href: 'https://www.sparknotes.com/lit/mocking/', text: 'SparkNotes' });
  });

  it('uses href as text when visible anchor text is empty', () => {
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
    expect(extractDescriptionLinks('<a href="javascript:void(0)">Click</a>')).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(extractDescriptionLinks('')).toEqual([]);
  });

  it('extracts Canvas /files/NNN style links', () => {
    const html =
      '<p>Download <a href="https://school.instructure.com/files/555/download">worksheet.pdf</a></p>';
    const links = extractDescriptionLinks(html);
    expect(links).toHaveLength(1);
    expect(links[0]?.href).toBe('https://school.instructure.com/files/555/download');
    expect(links[0]?.text).toBe('worksheet.pdf');
  });
});

describe('stripHtmlToText', () => {
  it('returns empty string for empty input', () => {
    expect(stripHtmlToText('')).toBe('');
  });

  it('removes tags from plain text', () => {
    expect(stripHtmlToText('<p>Hello world</p>')).toBe('Hello world');
  });

  it('converts <br> to newline', () => {
    expect(stripHtmlToText('Line 1<br>Line 2')).toBe('Line 1\nLine 2');
  });

  it('converts <br /> to newline', () => {
    expect(stripHtmlToText('Line 1<br />Line 2')).toBe('Line 1\nLine 2');
  });

  it('converts </p> to newline', () => {
    expect(stripHtmlToText('<p>First</p><p>Second</p>')).toBe('First\nSecond');
  });

  it('converts </li> to newline', () => {
    expect(stripHtmlToText('<li>Item A</li><li>Item B</li>')).toBe('Item A\nItem B');
  });

  it('decodes &amp; entity', () => {
    expect(stripHtmlToText('a &amp; b')).toBe('a & b');
  });

  it('decodes &lt; and &gt; entities', () => {
    expect(stripHtmlToText('&lt;tag&gt;')).toBe('<tag>');
  });

  it('decodes &quot; entity', () => {
    expect(stripHtmlToText('say &quot;hello&quot;')).toBe('say "hello"');
  });

  it('converts &nbsp; to a regular space', () => {
    expect(stripHtmlToText('before&nbsp;after')).toBe('before after');
  });

  it('collapses multiple horizontal spaces to one', () => {
    expect(stripHtmlToText('lots   of   spaces')).toBe('lots of spaces');
  });

  it('collapses 3+ newlines to 2', () => {
    expect(stripHtmlToText('a\n\n\n\nb')).toBe('a\n\nb');
  });

  it('trims leading and trailing whitespace', () => {
    expect(stripHtmlToText('  hello  ')).toBe('hello');
  });

  it('handles nested tags', () => {
    expect(stripHtmlToText('<p><strong>Bold</strong> text</p>')).toBe('Bold text');
  });

  it('produces human-readable output from real LMS description HTML', () => {
    const html =
      '<p>Write a 5-paragraph <strong>essay</strong> on a theme.</p>' +
      '<ul><li>Follow the <a href="https://example.com/rubric">Rubric</a>.</li>' +
      '<li>Submit by 11:59 PM.</li></ul>';
    const text = stripHtmlToText(html);
    expect(text).toContain('Write a 5-paragraph');
    expect(text).toContain('essay');
    expect(text).toContain('Submit by 11:59 PM.');
    expect(text).not.toContain('<');
  });
});
