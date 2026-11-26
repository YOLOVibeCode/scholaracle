import { buildManualDigestEmail } from './diagnostics';

describe('buildManualDigestEmail', () => {
  it('calls the product Scholarmancy in the heading, the signature and the plain text', () => {
    const email = buildManualDigestEmail('Avery', [
      { title: 'Missing assignment', message: 'Algebra homework 4 is missing.' },
    ]);

    expect(email.subject).toBe('Daily Digest for Avery');
    expect(email.html).toContain('<h2>Scholarmancy Digest for Avery</h2>');
    expect(email.html).toContain('<p>--<br>Scholarmancy</p>');
    expect(email.text).toBe('Scholarmancy Digest: 1 updates for Avery');
    expect(`${email.subject} ${email.text} ${email.html}`).not.toContain('Scholaracle');
  });

  it('lists every alert and counts the updates', () => {
    const email = buildManualDigestEmail(
      'Avery',
      [
        { title: 'Missing assignment', message: 'Algebra homework 4 is missing.' },
        { title: 'Grade dropped', message: 'English fell to a C.' },
      ],
      3
    );

    expect(email.html).toContain('<p>You have 3 update(s):</p>');
    expect(email.html).toContain(
      '<li><strong>Missing assignment</strong><br>Algebra homework 4 is missing.</li>'
    );
    expect(email.html).toContain('<li><strong>Grade dropped</strong><br>English fell to a C.</li>');
    expect(email.text).toBe('Scholarmancy Digest: 3 updates for Avery');
  });

  it('shows names and alert text from a school portal as text, never as markup', () => {
    const email = buildManualDigestEmail('Pat <Young>', [
      { title: 'Quiz <b>3</b>', message: 'See <a href="https://example.test">this</a> & more' },
    ]);

    expect(email.html).toContain('Scholarmancy Digest for Pat &lt;Young&gt;');
    expect(email.html).toContain('<strong>Quiz &lt;b&gt;3&lt;/b&gt;</strong>');
    expect(email.html).toContain(
      'See &lt;a href=&quot;https://example.test&quot;&gt;this&lt;/a&gt; &amp; more'
    );
    expect(email.html).not.toContain('<a href');
  });
});
