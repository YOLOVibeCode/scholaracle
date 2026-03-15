/**
 * Send a realistic Scholarmancy digest email to local Mailpit for design iteration.
 * Usage: npx ts-node-dev --transpile-only src/scripts/send-digest-to-mailpit.ts
 */

import nodemailer from 'nodemailer';
import { buildDigestEmail, type IGradeBlock } from '@scholaracle/agents';
import type { IEmailDigestPendingItem } from '@scholaracle/database';

const MAILPIT_HOST = 'localhost';
const MAILPIT_PORT = 1025;

const now = new Date();
const hoursAgo = (h: number): Date => new Date(now.getTime() - h * 3600_000);
const minutesAgo = (m: number): Date => new Date(now.getTime() - m * 60_000);

const STUDENT_ID = '69a4f1b53671c632ca591c7f';

const sampleItems: IEmailDigestPendingItem[] = [
  {
    userId: 'test-user',
    recipientEmail: 'parent@example.com',
    alertType: 'missing_assignment',
    severity: 'critical',
    subject: 'Missing Assignment Alert',
    body: 'Ava has not submitted "Original Ode" in English 1. This is categorized as a Minor assignment.',
    studentName: 'Ava Lewis',
    courseName: 'English 1',
    assignmentTitle: 'Original Ode',
    recipientType: 'parent',
    studentId: STUDENT_ID,
    courseExternalId: 'skyward-course-5C-english-1',
    createdAt: minutesAgo(30),
  },
  {
    userId: 'test-user',
    recipientEmail: 'parent@example.com',
    alertType: 'missing_assignment',
    severity: 'critical',
    subject: 'Missing Assignment Alert',
    body: 'Ava has not submitted "What makes a powerful photo?" in Journalism which was due on March 2. This is categorized as a Major assignment.',
    studentName: 'Ava Lewis',
    courseName: 'Journalism',
    assignmentTitle: 'What makes a powerful photo?',
    recipientType: 'parent',
    studentId: STUDENT_ID,
    courseExternalId: 'skyward-course-1-journalism',
    createdAt: minutesAgo(30),
  },
  {
    userId: 'test-user',
    recipientEmail: 'parent@example.com',
    alertType: 'missing_assignment',
    severity: 'critical',
    subject: 'Missing Assignment Alert',
    body: 'Ava has 7 missing assignments in Journalism (Period 3) including "Checkpoint Grade #5- Peer Review" (due Feb 25) and "Checkpoint Grade #3- Ladder" (due Feb 19).',
    studentName: 'Ava Lewis',
    courseName: 'Journalism (Per 3)',
    assignmentTitle: 'Multiple missing assignments',
    recipientType: 'parent',
    studentId: STUDENT_ID,
    courseExternalId: 'skyward-course-3-journalism',
    createdAt: hoursAgo(1),
  },
  {
    userId: 'test-user',
    recipientEmail: 'parent@example.com',
    alertType: 'failing_grade',
    severity: 'critical',
    subject: 'Failing Grade Alert',
    body: 'Ava is currently failing Journalism (Period 3) with a grade of 58%. She has 7 missing assignments in this course. This requires immediate attention.',
    studentName: 'Ava Lewis',
    courseName: 'Journalism (Per 3)',
    assignmentTitle: '',
    recipientType: 'parent',
    studentId: STUDENT_ID,
    courseExternalId: 'skyward-course-3-journalism',
    createdAt: hoursAgo(1),
  },
  {
    userId: 'test-user',
    recipientEmail: 'parent@example.com',
    alertType: 'grade_drop',
    severity: 'warning',
    subject: 'Grade Below 75% Warning',
    body: "Ava's grade in English 1 is 74% and Art 1 is 74%. Both are below the passing threshold of 75%.",
    studentName: 'Ava Lewis',
    courseName: 'English 1 / Art 1',
    assignmentTitle: '',
    recipientType: 'parent',
    studentId: STUDENT_ID,
    courseExternalId: 'skyward-course-5C-english-1',
    createdAt: hoursAgo(2),
  },
  {
    userId: 'test-user',
    recipientEmail: 'parent@example.com',
    alertType: 'grade_improvement',
    severity: 'positive',
    subject: 'Strong Performance',
    body: 'Ava is performing well in Spanish 1 (92%) and Principles AG Food & Nat Res (85%). Keep up the great work!',
    studentName: 'Ava Lewis',
    courseName: 'Spanish 1',
    assignmentTitle: '',
    recipientType: 'parent',
    studentId: STUDENT_ID,
    courseExternalId: 'skyward-course-7-spanish-1',
    createdAt: hoursAgo(3),
  },
  {
    userId: 'test-user',
    recipientEmail: 'parent@example.com',
    alertType: 'category_breakdown',
    severity: 'info',
    subject: 'Assignment Category Summary',
    body: 'Algebra 1 breakdown: Major assignments (40% weight) average 79%, Minor assignments (60% weight) average 74%. Focus on improving Minor assignment scores.',
    studentName: 'Ava Lewis',
    courseName: 'Algebra 1',
    assignmentTitle: '',
    recipientType: 'parent',
    studentId: STUDENT_ID,
    courseExternalId: 'skyward-course-4-algebra-1',
    createdAt: hoursAgo(3),
  },
];

const sampleGrades: IGradeBlock[] = [
  {
    courseName: 'Journalism (Per 1)',
    percentGrade: 82,
    letterGrade: 'B',
    courseUrl: 'https://scholarmancy.com/dashboard',
  },
  {
    courseName: 'Principles AG Food & Nat Res',
    percentGrade: 85,
    letterGrade: 'B',
    courseUrl: 'https://scholarmancy.com/dashboard',
  },
  {
    courseName: 'World Geography',
    percentGrade: 78,
    letterGrade: 'C',
    courseUrl: 'https://scholarmancy.com/dashboard',
  },
  {
    courseName: 'Principles Human Services',
    percentGrade: 85,
    letterGrade: 'B',
    courseUrl: 'https://scholarmancy.com/dashboard',
  },
  {
    courseName: 'Journalism (Per 3)',
    percentGrade: 58,
    letterGrade: 'F',
    courseUrl: 'https://scholarmancy.com/dashboard',
  },
  {
    courseName: 'Algebra 1',
    percentGrade: 76,
    letterGrade: 'C',
    courseUrl: 'https://scholarmancy.com/dashboard',
  },
  {
    courseName: 'English 1',
    percentGrade: 74,
    letterGrade: 'C',
    courseUrl: 'https://scholarmancy.com/dashboard',
  },
  {
    courseName: 'Art 1',
    percentGrade: 74,
    letterGrade: 'C',
    courseUrl: 'https://scholarmancy.com/dashboard',
  },
  {
    courseName: 'Spanish 1',
    percentGrade: 92,
    letterGrade: 'A',
    courseUrl: 'https://scholarmancy.com/dashboard',
  },
  {
    courseName: 'Biology',
    percentGrade: 80,
    letterGrade: 'B',
    courseUrl: 'https://scholarmancy.com/dashboard',
  },
];

const aiInsight =
  'Ava has 15 missing assignments across her courses, with the most urgent being in Journalism Period 3 (7 missing, currently failing at 58%). English 1 and Art 1 are both at 74%, just below passing. Her strongest subjects are Spanish 1 (92%) and Principles AG Food & Nat Res (85%). Priority this week: submit missing Journalism assignments and the Original Ode for English 1.';

async function main(): Promise<void> {
  const { subject, html } = buildDigestEmail({
    items: sampleItems,
    dashboardUrl: 'https://scholarmancy.com/dashboard',
    studentName: 'Ava Lewis',
    recipientType: 'parent',
    aiInsight,
    grades: sampleGrades,
    baseUrl: 'https://scholarmancy.com',
    studentId: STUDENT_ID,
  });

  const transport = nodemailer.createTransport({
    host: MAILPIT_HOST,
    port: MAILPIT_PORT,
    secure: false,
  });

  const recipients = [
    { name: 'Robert Lewis', email: 'rmlewis1976@gmail.com' },
    { name: 'Jessica Lewis', email: 'jdenise11@hotmail.com' },
    { name: 'Ricardo Vega Jr', email: 'rvegajr@noctusoft.com' },
  ];

  for (const r of recipients) {
    await transport.sendMail({
      from: '"Scholarmancy" <noreply@scholarmancy.com>',
      to: `"${r.name}" <${r.email}>`,
      subject,
      html,
    });
    // eslint-disable-next-line no-console
    console.log(`Sent to ${r.name} <${r.email}>`);
  }

  // eslint-disable-next-line no-console
  console.log(`\nDone! Check Mailpit at http://localhost:8025\nSubject: ${subject}`);
}

main().catch((e: unknown) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
