import { buildGlanceEmail } from './glanceEmailTemplate';
import type { IGradeBlock } from './digestEmailTemplate';

describe('buildGlanceEmail', () => {
  const sampleGrades: IGradeBlock[] = [
    {
      courseName: 'Math',
      percentGrade: 85,
      letterGrade: 'B',
      courseUrl: 'http://example.com/math',
    },
    {
      courseName: 'English',
      percentGrade: 92,
      letterGrade: 'A',
      courseUrl: 'http://example.com/eng',
    },
  ];

  it('returns subject with student name', () => {
    const { subject } = buildGlanceEmail({ studentName: 'Ava Lewis' });
    expect(subject).toContain("Ava Lewis's Snapshot");
  });

  it('includes grade bar when grades provided', () => {
    const { html } = buildGlanceEmail({ studentName: 'Ava', grades: sampleGrades });
    expect(html).toContain('Math');
    expect(html).toContain('English');
    expect(html).toContain('http://example.com/math');
  });

  it('omits grade bar when no grades', () => {
    const { html } = buildGlanceEmail({ studentName: 'Ava', grades: [] });
    expect(html).not.toContain('http://example.com');
  });

  it('renders missing assignments table', () => {
    const { html } = buildGlanceEmail({
      studentName: 'Ava',
      missingAssignments: [
        { title: 'Chapter 5 Quiz', courseName: 'Math', dueAt: new Date('2026-04-10') },
      ],
    });
    expect(html).toContain('Missing Assignments');
    expect(html).toContain('Chapter 5 Quiz');
    expect(html).toContain('Math');
  });

  it('renders upcoming deadlines table', () => {
    const { html } = buildGlanceEmail({
      studentName: 'Ava',
      upcomingDeadlines: [
        { title: 'Essay Draft', courseName: 'English', dueAt: new Date('2026-04-15') },
      ],
    });
    expect(html).toContain('Coming Up This Week');
    expect(html).toContain('Essay Draft');
  });

  it('shows all caught up when no missing or upcoming', () => {
    const { html } = buildGlanceEmail({
      studentName: 'Ava',
      missingAssignments: [],
      upcomingDeadlines: [],
    });
    expect(html).toContain('All caught up');
  });

  it('includes AI insight when provided', () => {
    const { html } = buildGlanceEmail({
      studentName: 'Ava',
      aiInsight: 'Ava is doing great in Math.',
    });
    expect(html).toContain('Ava is doing great in Math.');
    expect(html).toContain('Today&rsquo;s Summary');
  });

  it('includes dashboard CTA when url provided', () => {
    const { html } = buildGlanceEmail({
      studentName: 'Ava',
      dashboardUrl: 'https://app.scholarmancy.com/dashboard/students/123/view',
    });
    expect(html).toContain('View Dashboard');
    expect(html).toContain('https://app.scholarmancy.com/dashboard/students/123/view');
  });

  it('escapes HTML in student name', () => {
    const { html } = buildGlanceEmail({ studentName: '<script>alert(1)</script>' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
