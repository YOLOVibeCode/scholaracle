/**
 * Unit tests for digest email template: grade bar, color thresholds, buildDigestEmail.
 */

import {
  buildDigestEmail,
  gradeBarColorForPercent,
  renderGradeBar,
  type IGradeBlock,
} from './digestEmailTemplate';

describe('gradeBarColorForPercent', () => {
  it('returns red (#ef4444) for F (below 70)', () => {
    expect(gradeBarColorForPercent(0)).toBe('#ef4444');
    expect(gradeBarColorForPercent(69)).toBe('#ef4444');
    expect(gradeBarColorForPercent(69.9)).toBe('#ef4444');
  });

  it('returns orange (#f59e0b) for D (70-79)', () => {
    expect(gradeBarColorForPercent(70)).toBe('#f59e0b');
    expect(gradeBarColorForPercent(75)).toBe('#f59e0b');
    expect(gradeBarColorForPercent(79.9)).toBe('#f59e0b');
  });

  it('returns blue (#3b82f6) for C (80-84)', () => {
    expect(gradeBarColorForPercent(80)).toBe('#3b82f6');
    expect(gradeBarColorForPercent(82)).toBe('#3b82f6');
    expect(gradeBarColorForPercent(84.9)).toBe('#3b82f6');
  });

  it('returns green (#10b981) for B (85-92)', () => {
    expect(gradeBarColorForPercent(85)).toBe('#10b981');
    expect(gradeBarColorForPercent(90)).toBe('#10b981');
    expect(gradeBarColorForPercent(92.9)).toBe('#10b981');
  });

  it('returns dark green (#047857) for A (93+)', () => {
    expect(gradeBarColorForPercent(93)).toBe('#047857');
    expect(gradeBarColorForPercent(100)).toBe('#047857');
    expect(gradeBarColorForPercent(130)).toBe('#047857');
  });
});

describe('renderGradeBar', () => {
  it('returns empty string for empty grades array', () => {
    expect(renderGradeBar([])).toBe('');
  });

  it('renders correct number of blocks', () => {
    const grades: IGradeBlock[] = [
      {
        courseName: 'Math',
        percentGrade: 85,
        letterGrade: 'B',
        courseUrl: 'https://example.com/math',
      },
      {
        courseName: 'English',
        percentGrade: 72,
        letterGrade: 'D',
        courseUrl: 'https://example.com/eng',
      },
    ];
    const html = renderGradeBar(grades);
    expect(html).toContain('Math');
    expect(html).toContain('English');
    expect(html).toContain('B');
    expect(html).toContain('D');
    expect((html.match(/<a href=/g) ?? []).length).toBe(2);
  });

  it('uses correct course URLs in links', () => {
    const url = 'https://scholarmancy.com/dashboard/students/s1/grades?course=c1';
    const grades: IGradeBlock[] = [
      { courseName: 'Algebra', percentGrade: 67, letterGrade: 'F', courseUrl: url },
    ];
    const html = renderGradeBar(grades);
    expect(html).toContain(`href="${url}"`);
    expect(html).toContain('Algebra');
    expect(html).toContain('F');
  });

  it('escapes HTML in course names', () => {
    const grades: IGradeBlock[] = [
      {
        courseName: '<script>alert(1)</script>',
        percentGrade: 80,
        letterGrade: 'C',
        courseUrl: 'https://example.com',
      },
    ];
    const html = renderGradeBar(grades);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('applies F color (red) for failing grade', () => {
    const grades: IGradeBlock[] = [
      { courseName: 'X', percentGrade: 48, letterGrade: 'F', courseUrl: 'https://x.com' },
    ];
    const html = renderGradeBar(grades);
    expect(html).toContain('#ef4444');
  });
});

describe('buildDigestEmail', () => {
  const minimalItems = [
    {
      userId: 'u1',
      recipientEmail: 'u@example.com',
      alertType: 'missing_assignment',
      severity: 'warning',
      subject: 'Missing',
      body: 'Body',
      createdAt: new Date(),
    },
  ];

  it('includes grade bar in html when grades provided', () => {
    const grades: IGradeBlock[] = [
      {
        courseName: 'Spanish',
        percentGrade: 92,
        letterGrade: 'A',
        courseUrl: 'https://dash/s1?course=sp',
      },
    ];
    const { html } = buildDigestEmail({
      items: minimalItems,
      grades,
    });
    expect(html).toContain('Spanish');
    expect(html).toContain('A');
    expect(html).toContain('https://dash/s1?course=sp');
  });

  it('omits grade bar when grades empty or undefined', () => {
    const { html: htmlEmpty } = buildDigestEmail({ items: minimalItems, grades: [] });
    const { html: htmlUndefined } = buildDigestEmail({ items: minimalItems });
    expect(htmlEmpty).not.toMatch(/font-size:16px;font-weight:700/);
    expect(htmlUndefined).not.toMatch(/font-size:16px;font-weight:700/);
  });

  it('escapes grade block course names in full email', () => {
    const grades: IGradeBlock[] = [
      {
        courseName: 'Course "with" quotes',
        percentGrade: 80,
        letterGrade: 'C',
        courseUrl: 'https://example.com',
      },
    ];
    const { html } = buildDigestEmail({ items: minimalItems, grades });
    expect(html).toContain('&quot;');
    expect(html).not.toContain('"with"');
  });
});
