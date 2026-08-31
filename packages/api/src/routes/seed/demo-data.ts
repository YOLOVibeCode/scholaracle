import { createHash } from 'node:crypto';
import { buildSimplePdf } from '@scholaracle/scraper-core';

export const DEMO_USER = {
  email: 'demo@scholarmancy.com',
  password: 'DemoPass123!',
  name: 'Sarah Mitchell',
} as const;

export const DEMO_STUDENT_EMMA = {
  name: 'Emma Mitchell',
  grade: 10,
  studentId: 'demo-emma',
} as const;

export const DEMO_STUDENT_LIAM = {
  name: 'Liam Mitchell',
  grade: 7,
  studentId: 'demo-liam',
} as const;

export const DEMO_STUDENTS = [DEMO_STUDENT_EMMA, DEMO_STUDENT_LIAM] as const;

/** Student-facing login for Emma. Parent-provisioned; not created via public register. */
export const DEMO_STUDENT_USER_EMMA = {
  email: 'emma.demo@scholarmancy.com',
  password: 'DemoPass123!',
  name: 'Emma Mitchell',
} as const;

/** Student-facing login for Liam. Parent-provisioned; not created via public register. */
export const DEMO_STUDENT_USER_LIAM = {
  email: 'liam.demo@scholarmancy.com',
  password: 'DemoPass123!',
  name: 'Liam Mitchell',
} as const;

export const SPARKNOTES_DEMO_TEXT =
  'DEMO SNAPSHOT of a public study page (what airplane mode can still show). ' +
  'To Kill a Mockingbird is narrated by Scout Finch. Atticus defends Tom Robinson. ' +
  'Themes to track: conscience vs law, empathy, and growing up in Maycomb. ' +
  'Use this as a starting outline, then cite the novel itself in your essay.';

export const PRIMARY_SOURCE_DEMO_TEXT =
  'When in the Course of human events, it becomes necessary for one people to dissolve the ' +
  'political bands which have connected them with another... We hold these truths to be ' +
  'self-evident, that all men are created equal, that they are endowed by their Creator with ' +
  'certain unalienable Rights, that among these are Life, Liberty and the pursuit of Happiness.';

export const READING_LIST_DEMO_TEXT =
  'Required reading this term: To Kill a Mockingbird (Lee); selected sonnets (handout); ' +
  'one independent novel from the library cart. Log pages in the reading journal every Friday.';

const DEMO_PDF_BODIES: Readonly<Record<string, string>> = {
  'demo-emma-ap-bio-syllabus':
    'Westfield High School  2025-26\n' +
    'Teacher: Dr. Patel  Period 3\n' +
    'Units: cells, genetics, evolution, ecology. Labs most Fridays. Safety contract required before any wet lab.',
  'demo-emma-ap-bio-lab-safety':
    '1. Goggles on before chemicals come out. Keep them on until cleanup is checked.\n' +
    '2. Tie back hair. No open-toe shoes.\n' +
    '3. Report spills to Dr. Patel immediately. Do not taste or smell unknowns.\n' +
    '4. Wash hands before leaving. Sign the safety contract on page 2 before Thursday lab.',
  'demo-emma-ap-bio-study-guide':
    'Chapter 5 - Cell cycle\n' +
    'Know: G1, S, G2, mitosis vs meiosis, checkpoints, cancer as unregulated division.\n' +
    'Practice: label a spindle diagram; compare haploid vs diploid outcomes.',
  'demo-emma-alg2-syllabus':
    'Algebra II  Westfield High  Ms. Chen  Period 1\n' +
    'Graphing calculator recommended. Weekly quiz Fridays. Missing work drops the grade fast - turn in late for 70% credit within one week.',
  'demo-emma-alg2-formula':
    'Quadratic formula: x = (-b +/- sqrt(b^2 - 4ac)) / 2a\n' +
    'Vertex form: y = a(x-h)^2 + k\n' +
    'Exponential: y = ab^x    Log: log_b(xy) = log_b x + log_b y\n' +
    'Bring this sheet to Missing assignment 1. Show work; circling the answer is not enough.',
  'demo-emma-eng10-syllabus':
    'English 10 Honors  Mr. Alvarez  Period 5\n' +
    'Major texts: To Kill a Mockingbird, selected poetry, one independent novel. Essays use MLA. Drafts due before finals.',
  'demo-emma-eng10-rubric':
    'Essay rubric (100 pts)\n' +
    'Claim & structure 30  Evidence from the text 30  Analysis (not summary) 25  Conventions 15\n' +
    'A: arguable thesis, quoted evidence, explains how the quote proves the claim.\n' +
    'C: thesis is a topic, quotes dumped without commentary.',
  'demo-emma-wh-syllabus':
    'World History  Ms. Brooks  Period 2\n' +
    'This unit: Age of Exploration. Primary sources every Friday. Timeline PDF is required reading for the Chapter 2 quiz.',
  'demo-emma-wh-timeline':
    '1492 Columbus reaches the Caribbean\n' +
    '1494 Treaty of Tordesillas\n' +
    '1519-21 Cortes and the Aztec Empire\n' +
    '1532 Pizarro and the Inca\n' +
    '1588 Spanish Armada\n' +
    'Use this timeline on the Chapter 2 quiz. Dates must be in order.',
  'demo-emma-span2-vocab':
    'Unidad 4 - La comida\n' +
    'el desayuno, el almuerzo, la cena, la cuenta, el camarero, sabroso, pedir, probar\n' +
    'Write 8 original sentences. No translator paragraphs.',
  'demo-emma-pe-fitness':
    'Weekly fitness log\n' +
    'Date | Activity | Minutes | Heart-rate notes\n' +
    'Fill five days. PE / Health - Coach Rivera.',
  'demo-liam-math7-syllabus':
    'Math 7  Mr. Singh  Period 4\n' +
    'Ratios, percents, intro algebra. Homework nightly. Show work.',
  'demo-liam-la-rubric':
    'Book report rubric\n' +
    'Summary 20  Character 20  Theme 30  Conventions 20  Effort 10\n' +
    'Theme must be a sentence, not one word.',
  'demo-liam-science-lab':
    'Lab guidelines\n' +
    'No tasting. Clean station. Graph in pencil. Conclusion restates the question and uses data.',
  'demo-liam-art-project':
    'Color study project\n' +
    'Pick a still life. Complementary colors in the background. Due Friday. Sign the back.',
  'demo-emma-eng10-spark': SPARKNOTES_DEMO_TEXT,
  'demo-emma-wh-primary1': PRIMARY_SOURCE_DEMO_TEXT,
  'demo-emma-eng10-reading': READING_LIST_DEMO_TEXT,
};

function demoPdfBuffer(externalId: string, title: string): Buffer {
  const body = DEMO_PDF_BODIES[externalId] ?? `${title}\nWestfield High School demo handout.`;
  return Buffer.from(buildSimplePdf(title, body));
}

function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Lab-safety PDF bytes — real readable page, not an empty MediaBox. */
export const DEMO_LAB_SAFETY_BYTES = demoPdfBuffer(
  'demo-emma-ap-bio-lab-safety',
  'Lab Safety Handout'
);

/** @deprecated Use DEMO_LAB_SAFETY_BYTES. Kept so older tests still import a Buffer. */
export const DEMO_MINIMAL_PDF = DEMO_LAB_SAFETY_BYTES;

export const DEMO_LAB_SAFETY_ASSET_ID = 'demo-asset-demo-emma-ap-bio-lab-safety';
export const DEMO_LAB_SAFETY_HASH = sha256Hex(DEMO_LAB_SAFETY_BYTES);
export const DEMO_LAB_SAFETY_STORAGE_KEY = 'demo/demo-asset-demo-emma-ap-bio-lab-safety';

/** Blended-family demo contacts (emails); create users for accepted ones when seeding. */
export const DEMO_CONTACT_JESSICA = 'jessica.demo@scholaracle.com';
export const DEMO_CONTACT_RICKY = 'ricky.demo@scholaracle.com';
export const DEMO_CONTACT_JENNIFER = 'jennifer.demo@scholaracle.com';

/** Default password for demo contact users (accepted contacts need a userId). */
export const DEMO_CONTACT_PASSWORD = 'DemoPass123!';

/** Course definitions: [studentExternalId, courseExternalId, courseName] */
export const DEMO_COURSES: ReadonlyArray<{
  studentId: string;
  courseExternalId: string;
  courseName: string;
}> = [
  {
    studentId: DEMO_STUDENT_EMMA.studentId,
    courseExternalId: 'demo-emma-ap-bio',
    courseName: 'AP Biology',
  },
  {
    studentId: DEMO_STUDENT_EMMA.studentId,
    courseExternalId: 'demo-emma-alg2',
    courseName: 'Algebra II',
  },
  {
    studentId: DEMO_STUDENT_EMMA.studentId,
    courseExternalId: 'demo-emma-eng10',
    courseName: 'English 10 Honors',
  },
  {
    studentId: DEMO_STUDENT_EMMA.studentId,
    courseExternalId: 'demo-emma-world-hist',
    courseName: 'World History',
  },
  {
    studentId: DEMO_STUDENT_EMMA.studentId,
    courseExternalId: 'demo-emma-span2',
    courseName: 'Spanish II',
  },
  {
    studentId: DEMO_STUDENT_EMMA.studentId,
    courseExternalId: 'demo-emma-pe',
    courseName: 'PE / Health',
  },
  {
    studentId: DEMO_STUDENT_LIAM.studentId,
    courseExternalId: 'demo-liam-math7',
    courseName: 'Math 7',
  },
  {
    studentId: DEMO_STUDENT_LIAM.studentId,
    courseExternalId: 'demo-liam-la',
    courseName: 'Language Arts',
  },
  {
    studentId: DEMO_STUDENT_LIAM.studentId,
    courseExternalId: 'demo-liam-science',
    courseName: 'Life Science',
  },
  {
    studentId: DEMO_STUDENT_LIAM.studentId,
    courseExternalId: 'demo-liam-ss',
    courseName: 'Social Studies',
  },
  { studentId: DEMO_STUDENT_LIAM.studentId, courseExternalId: 'demo-liam-art', courseName: 'Art' },
];

export type AssignmentStatus = 'missing' | 'submitted' | 'graded' | 'late' | 'unknown';

export interface DemoAssignmentInput {
  courseExternalId: string;
  studentExternalId: string;
  externalId: string;
  title: string;
  dueAt: string;
  status: AssignmentStatus;
  pointsPossible?: number;
  pointsEarned?: number;
  /** Assignment instructions HTML — shown on the work pack. */
  description?: string;
  /** Direct LMS link to the assignment page. */
  lmsUrl?: string;
}

/**
 * Build demo assignments with due dates relative to baseDate.
 * Spread over the past 6 weeks and next 2 weeks.
 */
// eslint-disable-next-line complexity
export function buildDemoAssignments(baseDate: Date): DemoAssignmentInput[] {
  const out: DemoAssignmentInput[] = [];
  const day = (d: number) => {
    const x = new Date(baseDate);
    x.setDate(x.getDate() + d);
    return x.toISOString();
  };

  // Emma - AP Biology: 91% (A-), strong
  for (let i = -35; i <= 10; i += 5) {
    const pts = 10;
    const earned = i <= 0 ? Math.floor(pts * (0.88 + Math.random() * 0.12)) : undefined;
    const isMissing = i > 3;
    out.push({
      courseExternalId: 'demo-emma-ap-bio',
      studentExternalId: DEMO_STUDENT_EMMA.studentId,
      externalId: `demo-emma-ap-bio-a${i}`,
      title: `Unit ${Math.floor((i + 40) / 5)} Homework`,
      dueAt: day(i),
      status: i <= 0 ? 'graded' : isMissing ? 'missing' : 'submitted',
      pointsPossible: pts,
      pointsEarned: earned,
      // Attach instructions + public resources to the first missing assignment
      ...(i === 5
        ? {
            description:
              '<p>Complete the <strong>Cell Division</strong> worksheet below and submit via Canvas.</p>' +
              '<p>Reference materials: <a href="https://www.khanacademy.org/science/ap-biology/cell-communication-and-cell-cycle">Khan Academy – Cell Cycle</a>.</p>' +
              '<p>Lab safety rules apply — review the handout before lab time.</p>',
            lmsUrl: 'https://school.instructure.com/courses/bio101/assignments/cell-division',
          }
        : {}),
    });
  }

  // Emma - Algebra II: 67% (D+), at risk, 3 missing
  const alg2Graded = [
    [10, 5],
    [10, 6],
    [10, 7],
    [15, 9],
    [10, 4],
    [10, 8],
    [20, 10],
    [10, 6],
  ];
  alg2Graded.forEach(([possible, earned], idx) => {
    out.push({
      courseExternalId: 'demo-emma-alg2',
      studentExternalId: DEMO_STUDENT_EMMA.studentId,
      externalId: `demo-emma-alg2-a${idx}`,
      title: `Algebra II Assignment ${idx + 1}`,
      dueAt: day(-30 + idx * 5),
      status: 'graded',
      pointsPossible: possible,
      pointsEarned: earned,
    });
  });
  for (let i = 1; i <= 3; i++) {
    out.push({
      courseExternalId: 'demo-emma-alg2',
      studentExternalId: DEMO_STUDENT_EMMA.studentId,
      externalId: `demo-emma-alg2-missing-${i}`,
      title: `Missing assignment ${i}`,
      dueAt: day(-5 + i),
      status: 'missing',
      pointsPossible: 10,
    });
  }

  // Emma - English 10 Honors: 84% (B)
  for (let i = 0; i < 10; i++) {
    const pts = i === 9 ? 50 : 10;
    const earned = i < 9 ? 8 + Math.floor(Math.random() * 2) : undefined;
    out.push({
      courseExternalId: 'demo-emma-eng10',
      studentExternalId: DEMO_STUDENT_EMMA.studentId,
      externalId: `demo-emma-eng10-a${i}`,
      title: i === 9 ? 'Essay draft' : `Reading response ${i + 1}`,
      dueAt: day(-42 + i * 5),
      status: i < 9 ? 'graded' : i === 9 ? 'submitted' : 'missing',
      pointsPossible: pts,
      pointsEarned: earned,
      // Attach instructions + external resources to the essay assignment
      ...(i === 9
        ? {
            description:
              '<p>Write a 5-paragraph <strong>analytical essay</strong> on a theme from <em>To Kill a Mockingbird</em>.</p>' +
              '<ul>' +
              '<li>Follow the <a href="https://scholarmancy.com/demo/essay-rubric.pdf">Essay Rubric</a> (PDF, hosted).</li>' +
              '<li>Reference guide: <a href="https://www.sparknotes.com/lit/mocking/">SparkNotes – To Kill a Mockingbird</a>.</li>' +
              '</ul>' +
              '<p>Submit via Google Classroom before 11:59 PM.</p>',
            lmsUrl: 'https://school.instructure.com/courses/eng10/assignments/essay-draft',
          }
        : {}),
    });
  }

  // Emma - World History: 78% (C+)
  for (let i = 0; i < 8; i++) {
    out.push({
      courseExternalId: 'demo-emma-world-hist',
      studentExternalId: DEMO_STUDENT_EMMA.studentId,
      externalId: `demo-emma-wh-a${i}`,
      title: `Chapter ${i + 1} quiz`,
      dueAt: day(-40 + i * 6),
      status: 'graded',
      pointsPossible: 20,
      pointsEarned: 14 + Math.floor(Math.random() * 4),
      // Attach instructions + public primary-source links to chapter 2
      ...(i === 1
        ? {
            description:
              '<p>Quiz covers Chapter 2: <strong>Age of Exploration</strong>.</p>' +
              '<p>Study materials:</p>' +
              '<ul>' +
              '<li><a href="https://scholarmancy.com/demo/timeline.pdf">Timeline PDF</a> (hosted copy)</li>' +
              '<li><a href="https://example.com/primary-1">Primary Source — Declaration</a> (public)</li>' +
              '</ul>',
            lmsUrl: 'https://school.instructure.com/courses/whist/assignments/ch2-quiz',
          }
        : {}),
    });
  }

  // Emma - Spanish II: 92% (A-)
  for (let i = 0; i < 9; i++) {
    out.push({
      courseExternalId: 'demo-emma-span2',
      studentExternalId: DEMO_STUDENT_EMMA.studentId,
      externalId: `demo-emma-span2-a${i}`,
      title: `Tarea ${i + 1}`,
      dueAt: day(-38 + i * 4),
      status: 'graded',
      pointsPossible: 10,
      pointsEarned: 9 + (i % 2),
    });
  }

  // Emma - PE: 95% (A)
  for (let i = 0; i < 6; i++) {
    out.push({
      courseExternalId: 'demo-emma-pe',
      studentExternalId: DEMO_STUDENT_EMMA.studentId,
      externalId: `demo-emma-pe-a${i}`,
      title: `Weekly participation ${i + 1}`,
      dueAt: day(-35 + i * 7),
      status: 'graded',
      pointsPossible: 10,
      pointsEarned: 9 + (i >= 4 ? 1 : 0),
    });
  }

  // Liam - Math 7: 88% (B+)
  for (let i = 0; i < 10; i++) {
    out.push({
      courseExternalId: 'demo-liam-math7',
      studentExternalId: DEMO_STUDENT_LIAM.studentId,
      externalId: `demo-liam-math7-a${i}`,
      title: `Math 7 HW ${i + 1}`,
      dueAt: day(-35 + i * 4),
      status: 'graded',
      pointsPossible: 10,
      pointsEarned: 8 + Math.floor(Math.random() * 2),
    });
  }

  // Liam - Language Arts: 72% (C-), at risk, 2 missing book reports
  for (let i = 0; i < 6; i++) {
    out.push({
      courseExternalId: 'demo-liam-la',
      studentExternalId: DEMO_STUDENT_LIAM.studentId,
      externalId: `demo-liam-la-a${i}`,
      title: `Book report ${i + 1}`,
      dueAt: day(-30 + i * 7),
      status: i < 4 ? 'graded' : 'missing',
      pointsPossible: 25,
      pointsEarned: i < 4 ? 16 + Math.floor(Math.random() * 6) : undefined,
    });
  }

  // Liam - Life Science, Social Studies, Art
  ['demo-liam-science', 'demo-liam-ss', 'demo-liam-art'].forEach((courseId, ci) => {
    const titles = ['Lab report', 'Section quiz', 'Project'][ci] ?? 'Assignment';
    for (let i = 0; i < 8; i++) {
      out.push({
        courseExternalId: courseId,
        studentExternalId: DEMO_STUDENT_LIAM.studentId,
        externalId: `demo-liam-${courseId}-a${i}`,
        title: `${titles} ${i + 1}`,
        dueAt: day(-32 + i * 5),
        status: 'graded',
        pointsPossible: 20,
        pointsEarned: 16 + Math.floor(Math.random() * 4),
      });
    }
  });

  return out;
}

/**
 * Build slc_courses documents for the demo user.
 */
export function buildDemoCourseDocs(userId: string) {
  const provider = 'demo';
  const adapterId = 'com.scholaracle.demo';
  return DEMO_COURSES.map((c) => ({
    userId,
    provider,
    adapterId,
    externalId: c.courseExternalId,
    studentExternalId: c.studentId,
    deletedAt: null,
    record: { name: c.courseName },
  }));
}

/**
 * Build slc_assignments documents for the demo user.
 */
export function buildDemoAssignmentDocs(userId: string, baseDate: Date) {
  const provider = 'demo';
  const adapterId = 'com.scholaracle.demo';
  const assignments = buildDemoAssignments(baseDate);
  const now = new Date();
  return assignments.map((a) => ({
    userId,
    provider,
    adapterId,
    externalId: a.externalId,
    studentExternalId: a.studentExternalId,
    institutionExternalId: 'demo-westfield',
    courseExternalId: a.courseExternalId,
    termExternalId: 'demo-term',
    deletedAt: null,
    observedAt: now,
    updatedAt: now,
    record: {
      title: a.title,
      dueAt: a.dueAt,
      status: a.status,
      pointsPossible: a.pointsPossible,
      pointsEarned: a.pointsEarned,
      description: a.description,
      url: a.lmsUrl,
    },
  }));
}

/**
 * Build slc_event_series documents: ~10 events over 2-week lookahead + recurring Weekly Quiz.
 */
export function buildDemoEventSeries(userId: string, baseDate: Date) {
  const day = (d: number) => {
    const x = new Date(baseDate);
    x.setDate(x.getDate() + d);
    return x;
  };
  const series: Array<Record<string, unknown>> = [
    {
      userId,
      provider: 'demo',
      adapterId: 'com.scholaracle.demo',
      externalId: 'demo-emma-alg2-midterm',
      studentExternalId: DEMO_STUDENT_EMMA.studentId,
      institutionExternalId: 'demo-westfield',
      deletedAt: null,
      record: {
        title: 'Algebra II Midterm',
        category: 'test',
        timezone: 'America/New_York',
        startsAt: day(3).toISOString(),
        endsAt: day(3).toISOString(),
        recurrence: { rrule: 'FREQ=DAILY;COUNT=1', count: 1 },
      },
    },
    {
      userId,
      provider: 'demo',
      adapterId: 'com.scholaracle.demo',
      externalId: 'demo-liam-science-test',
      studentExternalId: DEMO_STUDENT_LIAM.studentId,
      institutionExternalId: 'demo-westfield',
      deletedAt: null,
      record: {
        title: 'Life Science Unit Test',
        category: 'test',
        timezone: 'America/New_York',
        startsAt: day(4).toISOString(),
        endsAt: day(4).toISOString(),
        recurrence: { rrule: 'FREQ=DAILY;COUNT=1', count: 1 },
      },
    },
    {
      userId,
      provider: 'demo',
      adapterId: 'com.scholaracle.demo',
      externalId: 'demo-emma-apbio-lab',
      studentExternalId: DEMO_STUDENT_EMMA.studentId,
      institutionExternalId: 'demo-westfield',
      deletedAt: null,
      record: {
        title: 'AP Biology Lab',
        category: 'assignment',
        timezone: 'America/New_York',
        startsAt: day(5).toISOString(),
        endsAt: day(5).toISOString(),
        recurrence: { rrule: 'FREQ=DAILY;COUNT=1', count: 1 },
      },
    },
    {
      userId,
      provider: 'demo',
      adapterId: 'com.scholaracle.demo',
      externalId: 'demo-liam-la-report5',
      studentExternalId: DEMO_STUDENT_LIAM.studentId,
      institutionExternalId: 'demo-westfield',
      deletedAt: null,
      record: {
        title: 'Book Report #5 Due',
        category: 'assignment',
        timezone: 'America/New_York',
        startsAt: day(6).toISOString(),
        endsAt: day(6).toISOString(),
        recurrence: { rrule: 'FREQ=DAILY;COUNT=1', count: 1 },
      },
    },
    {
      userId,
      provider: 'demo',
      adapterId: 'com.scholaracle.demo',
      externalId: 'demo-emma-eng10-essay',
      studentExternalId: DEMO_STUDENT_EMMA.studentId,
      institutionExternalId: 'demo-westfield',
      deletedAt: null,
      record: {
        title: 'English 10 Essay Due',
        category: 'assignment',
        timezone: 'America/New_York',
        startsAt: day(7).toISOString(),
        endsAt: day(7).toISOString(),
        recurrence: { rrule: 'FREQ=DAILY;COUNT=1', count: 1 },
      },
    },
    {
      userId,
      provider: 'demo',
      adapterId: 'com.scholaracle.demo',
      externalId: 'demo-liam-math7-quiz',
      studentExternalId: DEMO_STUDENT_LIAM.studentId,
      institutionExternalId: 'demo-westfield',
      deletedAt: null,
      record: {
        title: 'Math 7 Quiz',
        category: 'quiz',
        timezone: 'America/New_York',
        startsAt: day(8).toISOString(),
        endsAt: day(8).toISOString(),
        recurrence: { rrule: 'FREQ=DAILY;COUNT=1', count: 1 },
      },
    },
    {
      userId,
      provider: 'demo',
      adapterId: 'com.scholaracle.demo',
      externalId: 'demo-emma-wh-project',
      studentExternalId: DEMO_STUDENT_EMMA.studentId,
      institutionExternalId: 'demo-westfield',
      deletedAt: null,
      record: {
        title: 'World History Project Due',
        category: 'assignment',
        timezone: 'America/New_York',
        startsAt: day(10).toISOString(),
        endsAt: day(10).toISOString(),
        recurrence: { rrule: 'FREQ=DAILY;COUNT=1', count: 1 },
      },
    },
    {
      userId,
      provider: 'demo',
      adapterId: 'com.scholaracle.demo',
      externalId: 'demo-liam-art-project',
      studentExternalId: DEMO_STUDENT_LIAM.studentId,
      institutionExternalId: 'demo-westfield',
      deletedAt: null,
      record: {
        title: 'Art Project Due',
        category: 'assignment',
        timezone: 'America/New_York',
        startsAt: day(11).toISOString(),
        endsAt: day(11).toISOString(),
        recurrence: { rrule: 'FREQ=DAILY;COUNT=1', count: 1 },
      },
    },
    {
      userId,
      provider: 'demo',
      adapterId: 'com.scholaracle.demo',
      externalId: 'demo-emma-span2-oral',
      studentExternalId: DEMO_STUDENT_EMMA.studentId,
      institutionExternalId: 'demo-westfield',
      deletedAt: null,
      record: {
        title: 'Spanish II Oral Exam',
        category: 'test',
        timezone: 'America/New_York',
        startsAt: day(12).toISOString(),
        endsAt: day(12).toISOString(),
        recurrence: { rrule: 'FREQ=DAILY;COUNT=1', count: 1 },
      },
    },
    {
      userId,
      provider: 'demo',
      adapterId: 'com.scholaracle.demo',
      externalId: 'demo-weekly-quiz',
      studentExternalId: DEMO_STUDENT_EMMA.studentId,
      institutionExternalId: 'demo-westfield',
      deletedAt: null,
      record: {
        title: 'Weekly Quiz (Fridays)',
        category: 'quiz',
        timezone: 'America/New_York',
        startsAt: day(5).toISOString(),
        endsAt: day(5).toISOString(),
        recurrence: { rrule: 'FREQ=WEEKLY;BYDAY=FR;COUNT=4', count: 4 },
      },
    },
  ];
  return series;
}

/** Course material row for demo: courseExternalId, externalId, title, type, and optional record fields. */
export interface DemoMaterialInput {
  readonly courseExternalId: string;
  readonly studentExternalId: string;
  readonly externalId: string;
  readonly title: string;
  readonly type:
    'document' | 'link' | 'syllabus' | 'handout' | 'rubric' | 'study_guide' | 'video' | 'other';
  readonly url?: string;
  readonly fileName?: string;
  readonly linkAccessibility?: 'public' | 'authenticated' | 'unknown';
  readonly hasAsset?: boolean;
  /** Readable article snapshot for offline work packs. */
  readonly extractedText?: string;
  /** Linked assignment externalId (layer-1 join for the work pack). */
  readonly assignmentExternalId?: string;
}

const DEMO_MATERIAL_INPUTS: readonly DemoMaterialInput[] = [
  // Emma - AP Biology
  {
    courseExternalId: 'demo-emma-ap-bio',
    studentExternalId: DEMO_STUDENT_EMMA.studentId,
    externalId: 'demo-emma-ap-bio-syllabus',
    title: 'AP Biology Syllabus',
    type: 'syllabus',
    fileName: 'syllabus.pdf',
    hasAsset: true,
  },
  {
    courseExternalId: 'demo-emma-ap-bio',
    studentExternalId: DEMO_STUDENT_EMMA.studentId,
    externalId: 'demo-emma-ap-bio-lab-safety',
    title: 'Lab Safety Handout',
    type: 'handout',
    fileName: 'lab-safety.pdf',
    hasAsset: true,
    assignmentExternalId: 'demo-emma-ap-bio-a5',
  },
  {
    courseExternalId: 'demo-emma-ap-bio',
    studentExternalId: DEMO_STUDENT_EMMA.studentId,
    externalId: 'demo-emma-ap-bio-khan',
    title: 'Khan Academy - Cell Division',
    type: 'video',
    url: 'https://www.khanacademy.org/science/ap-biology/cell-communication-and-cell-cycle',
    linkAccessibility: 'public',
    assignmentExternalId: 'demo-emma-ap-bio-a5',
  },
  {
    courseExternalId: 'demo-emma-ap-bio',
    studentExternalId: DEMO_STUDENT_EMMA.studentId,
    externalId: 'demo-emma-ap-bio-yt',
    title: 'YouTube - AP Bio Review',
    type: 'video',
    url: 'https://www.youtube.com/results?search_query=AP+Biology+cell+cycle',
    linkAccessibility: 'public',
  },
  {
    courseExternalId: 'demo-emma-ap-bio',
    studentExternalId: DEMO_STUDENT_EMMA.studentId,
    externalId: 'demo-emma-ap-bio-study-guide',
    title: 'Chapter 5 Study Guide',
    type: 'study_guide',
    fileName: 'ch5-study.pdf',
    hasAsset: true,
  },
  // Emma - Algebra II
  {
    courseExternalId: 'demo-emma-alg2',
    studentExternalId: DEMO_STUDENT_EMMA.studentId,
    externalId: 'demo-emma-alg2-syllabus',
    title: 'Algebra II Syllabus',
    type: 'syllabus',
    fileName: 'syllabus.pdf',
    hasAsset: true,
  },
  {
    courseExternalId: 'demo-emma-alg2',
    studentExternalId: DEMO_STUDENT_EMMA.studentId,
    externalId: 'demo-emma-alg2-formula',
    title: 'Formula Sheet',
    type: 'handout',
    fileName: 'formulas.pdf',
    hasAsset: true,
    assignmentExternalId: 'demo-emma-alg2-missing-1',
  },
  {
    courseExternalId: 'demo-emma-alg2',
    studentExternalId: DEMO_STUDENT_EMMA.studentId,
    externalId: 'demo-emma-alg2-desmos',
    title: 'Desmos Graphing',
    type: 'link',
    url: 'https://www.desmos.com/calculator',
    linkAccessibility: 'authenticated',
  },
  // Emma - English 10 Honors
  {
    courseExternalId: 'demo-emma-eng10',
    studentExternalId: DEMO_STUDENT_EMMA.studentId,
    externalId: 'demo-emma-eng10-syllabus',
    title: 'English 10 Honors Syllabus',
    type: 'syllabus',
    fileName: 'syllabus.pdf',
    hasAsset: true,
  },
  {
    courseExternalId: 'demo-emma-eng10',
    studentExternalId: DEMO_STUDENT_EMMA.studentId,
    externalId: 'demo-emma-eng10-rubric',
    title: 'Essay Rubric',
    type: 'rubric',
    fileName: 'essay-rubric.pdf',
    hasAsset: true,
    assignmentExternalId: 'demo-emma-eng10-a9',
  },
  {
    courseExternalId: 'demo-emma-eng10',
    studentExternalId: DEMO_STUDENT_EMMA.studentId,
    externalId: 'demo-emma-eng10-reading',
    title: 'Required Reading List',
    type: 'link',
    url: 'https://example.com/reading-list',
    linkAccessibility: 'public',
    extractedText: READING_LIST_DEMO_TEXT,
    fileName: 'reading-list.pdf',
    hasAsset: true,
  },
  {
    courseExternalId: 'demo-emma-eng10',
    studentExternalId: DEMO_STUDENT_EMMA.studentId,
    externalId: 'demo-emma-eng10-spark',
    title: 'SparkNotes - To Kill a Mockingbird',
    type: 'link',
    url: 'https://www.sparknotes.com/lit/mocking/',
    linkAccessibility: 'public',
    extractedText: SPARKNOTES_DEMO_TEXT,
    fileName: 'sparknotes-snapshot.pdf',
    hasAsset: true,
    assignmentExternalId: 'demo-emma-eng10-a9',
  },
  // Emma - World History
  {
    courseExternalId: 'demo-emma-world-hist',
    studentExternalId: DEMO_STUDENT_EMMA.studentId,
    externalId: 'demo-emma-wh-syllabus',
    title: 'World History Syllabus',
    type: 'syllabus',
    fileName: 'syllabus.pdf',
    hasAsset: true,
  },
  {
    courseExternalId: 'demo-emma-world-hist',
    studentExternalId: DEMO_STUDENT_EMMA.studentId,
    externalId: 'demo-emma-wh-timeline',
    title: 'Timeline PDF',
    type: 'document',
    fileName: 'timeline.pdf',
    hasAsset: true,
    assignmentExternalId: 'demo-emma-wh-a1',
  },
  {
    courseExternalId: 'demo-emma-world-hist',
    studentExternalId: DEMO_STUDENT_EMMA.studentId,
    externalId: 'demo-emma-wh-primary1',
    title: 'Primary Source - Declaration',
    type: 'link',
    url: 'https://example.com/primary-1',
    linkAccessibility: 'public',
    extractedText: PRIMARY_SOURCE_DEMO_TEXT,
    fileName: 'declaration-excerpt.pdf',
    hasAsset: true,
    assignmentExternalId: 'demo-emma-wh-a1',
  },
  {
    courseExternalId: 'demo-emma-world-hist',
    studentExternalId: DEMO_STUDENT_EMMA.studentId,
    externalId: 'demo-emma-wh-primary2',
    title: 'Primary Source - Letters',
    type: 'link',
    url: 'https://example.com/primary-2',
    linkAccessibility: 'authenticated',
  },
  // Emma - Spanish II
  {
    courseExternalId: 'demo-emma-span2',
    studentExternalId: DEMO_STUDENT_EMMA.studentId,
    externalId: 'demo-emma-span2-vocab',
    title: 'Vocabulary List',
    type: 'document',
    fileName: 'vocabulary.pdf',
    hasAsset: true,
  },
  {
    courseExternalId: 'demo-emma-span2',
    studentExternalId: DEMO_STUDENT_EMMA.studentId,
    externalId: 'demo-emma-span2-audio',
    title: 'Audio Practice',
    type: 'link',
    url: 'https://example.com/spanish-audio',
    linkAccessibility: 'public',
  },
  // Emma - PE
  {
    courseExternalId: 'demo-emma-pe',
    studentExternalId: DEMO_STUDENT_EMMA.studentId,
    externalId: 'demo-emma-pe-fitness',
    title: 'Fitness Log Template',
    type: 'document',
    fileName: 'fitness-log.pdf',
    hasAsset: true,
  },
  // Liam - 1–2 per course
  {
    courseExternalId: 'demo-liam-math7',
    studentExternalId: DEMO_STUDENT_LIAM.studentId,
    externalId: 'demo-liam-math7-syllabus',
    title: 'Math 7 Syllabus',
    type: 'syllabus',
    fileName: 'syllabus.pdf',
    hasAsset: true,
  },
  {
    courseExternalId: 'demo-liam-la',
    studentExternalId: DEMO_STUDENT_LIAM.studentId,
    externalId: 'demo-liam-la-rubric',
    title: 'Book Report Rubric',
    type: 'rubric',
    fileName: 'rubric.pdf',
    hasAsset: true,
  },
  {
    courseExternalId: 'demo-liam-science',
    studentExternalId: DEMO_STUDENT_LIAM.studentId,
    externalId: 'demo-liam-science-lab',
    title: 'Lab Guidelines',
    type: 'handout',
    fileName: 'lab-guidelines.pdf',
    hasAsset: true,
  },
  {
    courseExternalId: 'demo-liam-ss',
    studentExternalId: DEMO_STUDENT_LIAM.studentId,
    externalId: 'demo-liam-ss-syllabus',
    title: 'Social Studies Syllabus',
    type: 'syllabus',
    hasAsset: false,
  },
  {
    courseExternalId: 'demo-liam-art',
    studentExternalId: DEMO_STUDENT_LIAM.studentId,
    externalId: 'demo-liam-art-project',
    title: 'Project Instructions',
    type: 'document',
    fileName: 'project.pdf',
    hasAsset: true,
  },
];

/**
 * Build slc_course_materials documents for the demo user.
 * Emma: AP Bio, Algebra II, English 10, World History, Spanish II, PE. Liam: 1–2 per course.
 */
export function buildDemoMaterialDocs(userId: string): Array<Record<string, unknown>> {
  const provider = 'demo';
  const adapterId = 'com.scholaracle.demo';
  const now = new Date();
  return DEMO_MATERIAL_INPUTS.map((m) => ({
    userId,
    provider,
    adapterId,
    externalId: m.externalId,
    studentExternalId: m.studentExternalId,
    courseExternalId: m.courseExternalId,
    institutionExternalId: 'demo-westfield',
    termExternalId: 'demo-term',
    deletedAt: null,
    observedAt: now,
    updatedAt: now,
    record: {
      title: m.title,
      courseExternalId: m.courseExternalId,
      type: m.type,
      url: m.url,
      fileName: m.fileName,
      linkAccessibility: m.linkAccessibility,
      assignmentExternalId: m.assignmentExternalId,
      extractedText: m.extractedText,
    },
  }));
}

/**
 * Build slc_assets documents for demo materials that have downloadable files.
 */
export function buildDemoAssetDocs(userId: string): Array<Record<string, unknown>> {
  const sourceId = 'demo';
  const now = new Date();
  return DEMO_MATERIAL_INPUTS.filter((m) => m.hasAsset === true).map((m) => {
    const bytes = demoPdfBuffer(m.externalId, m.title);
    return {
      assetId: `demo-asset-${m.externalId}`,
      sourceId,
      userId,
      originalUrl: `https://demo.scholaracle.com/files/${encodeURIComponent(m.fileName ?? 'document.pdf')}`,
      storageKey: `demo/demo-asset-${m.externalId}`,
      fileName: m.fileName ?? 'document.pdf',
      mimeType: 'application/pdf',
      fileSize: bytes.length,
      contentHash: sha256Hex(bytes),
      entityType: 'courseMaterial',
      entityExternalId: m.externalId,
      courseExternalId: m.courseExternalId,
      deletedAt: null,
      uploadedAt: now,
      lastAccessedAt: now,
    };
  });
}

/** Files to put into IAssetStore when seeding demo (same tiny PDF per hosted material). */
export function demoAssetByteFiles(): ReadonlyArray<{
  readonly storageKey: string;
  readonly bytes: Buffer;
  readonly contentType: string;
}> {
  return DEMO_MATERIAL_INPUTS.filter((m) => m.hasAsset === true).map((m) => ({
    storageKey: `demo/demo-asset-${m.externalId}`,
    bytes: demoPdfBuffer(m.externalId, m.title),
    contentType: 'application/pdf',
  }));
}

/**
 * Build slc_grade_history documents: weekly snapshots for ~8 weeks.
 * Emma: Algebra II declining 82→67, AP Bio 89→91, Spanish II stable 92. Liam: Language Arts 80→72.
 */
// eslint-disable-next-line complexity
export function buildDemoGradeHistory(
  userId: string,
  baseDate: Date
): Array<Record<string, unknown>> {
  const provider = 'demo';
  const adapterId = 'com.scholaracle.demo';
  const docs: Array<Record<string, unknown>> = [];
  const toDate = (d: number) => {
    const x = new Date(baseDate);
    x.setDate(x.getDate() + d);
    return x.toISOString().slice(0, 10);
  };
  const weeks = 8;
  for (let w = 0; w < weeks; w++) {
    const d = -7 * (weeks - 1 - w);
    const date = toDate(d);
    const t = new Date(baseDate);
    t.setDate(t.getDate() + d);
    const observedAt = t.toISOString();
    // Emma - Algebra II: 82 → 67 over 8 weeks
    const alg2Pct = Math.round(82 - (82 - 67) * (w / (weeks - 1)));
    docs.push({
      userId,
      provider,
      adapterId,
      studentExternalId: DEMO_STUDENT_EMMA.studentId,
      courseExternalId: 'demo-emma-alg2',
      date,
      percentGrade: alg2Pct,
      letterGrade: alg2Pct >= 90 ? 'A' : alg2Pct >= 80 ? 'B' : alg2Pct >= 70 ? 'C' : 'D',
      sourceType: 'calculated',
      observedAt,
      updatedAt: t,
    });
    // Emma - AP Bio: 89 → 91
    const apBioPct = w <= 4 ? 89 : w <= 6 ? 90 : 91;
    docs.push({
      userId,
      provider,
      adapterId,
      studentExternalId: DEMO_STUDENT_EMMA.studentId,
      courseExternalId: 'demo-emma-ap-bio',
      date,
      percentGrade: apBioPct,
      letterGrade: apBioPct >= 90 ? 'A' : 'B',
      sourceType: 'calculated',
      observedAt,
      updatedAt: t,
    });
    // Emma - Spanish II: stable 92
    docs.push({
      userId,
      provider,
      adapterId,
      studentExternalId: DEMO_STUDENT_EMMA.studentId,
      courseExternalId: 'demo-emma-span2',
      date,
      percentGrade: 92,
      letterGrade: 'A',
      sourceType: 'calculated',
      observedAt,
      updatedAt: t,
    });
    // Emma - English 10, World History, PE: stable
    for (const [courseId, pct] of [
      ['demo-emma-eng10', 84],
      ['demo-emma-world-hist', 78],
      ['demo-emma-pe', 95],
    ] as const) {
      docs.push({
        userId,
        provider,
        adapterId,
        studentExternalId: DEMO_STUDENT_EMMA.studentId,
        courseExternalId: courseId,
        date,
        percentGrade: pct + (w % 2 === 0 ? 0 : 1),
        letterGrade: pct >= 90 ? 'A' : pct >= 80 ? 'B' : 'C',
        sourceType: 'calculated',
        observedAt,
        updatedAt: t,
      });
    }
    // Liam - Language Arts: 80 → 72
    const laPct = Math.round(80 - (80 - 72) * (w / (weeks - 1)));
    docs.push({
      userId,
      provider,
      adapterId,
      studentExternalId: DEMO_STUDENT_LIAM.studentId,
      courseExternalId: 'demo-liam-la',
      date,
      percentGrade: laPct,
      letterGrade: laPct >= 80 ? 'B' : laPct >= 70 ? 'C' : 'D',
      sourceType: 'calculated',
      observedAt,
      updatedAt: t,
    });
    // Liam - Math 7, Life Science, Social Studies, Art: stable
    for (const [courseId, pct] of [
      ['demo-liam-math7', 88],
      ['demo-liam-science', 85],
      ['demo-liam-ss', 82],
      ['demo-liam-art', 90],
    ] as const) {
      docs.push({
        userId,
        provider,
        adapterId,
        studentExternalId: DEMO_STUDENT_LIAM.studentId,
        courseExternalId: courseId,
        date,
        percentGrade: pct + (w % 3 === 0 ? 0 : 1),
        letterGrade: pct >= 90 ? 'A' : pct >= 80 ? 'B' : 'C',
        sourceType: 'calculated',
        observedAt,
        updatedAt: t,
      });
    }
  }
  return docs;
}

/**
 * Build slc_grade_snapshots documents: current grade per course.
 */
export function buildDemoGradeSnapshots(
  userId: string,
  baseDate: Date
): Array<Record<string, unknown>> {
  const provider = 'demo';
  const adapterId = 'com.scholaracle.demo';
  const asOfDate = baseDate.toISOString().slice(0, 10);
  const now = new Date();
  const courses: Array<{
    courseExternalId: string;
    studentExternalId: string;
    percent: number;
    letter: string;
  }> = [
    {
      courseExternalId: 'demo-emma-ap-bio',
      studentExternalId: DEMO_STUDENT_EMMA.studentId,
      percent: 91,
      letter: 'A',
    },
    {
      courseExternalId: 'demo-emma-alg2',
      studentExternalId: DEMO_STUDENT_EMMA.studentId,
      percent: 67,
      letter: 'D',
    },
    {
      courseExternalId: 'demo-emma-eng10',
      studentExternalId: DEMO_STUDENT_EMMA.studentId,
      percent: 84,
      letter: 'B',
    },
    {
      courseExternalId: 'demo-emma-world-hist',
      studentExternalId: DEMO_STUDENT_EMMA.studentId,
      percent: 78,
      letter: 'C',
    },
    {
      courseExternalId: 'demo-emma-span2',
      studentExternalId: DEMO_STUDENT_EMMA.studentId,
      percent: 92,
      letter: 'A',
    },
    {
      courseExternalId: 'demo-emma-pe',
      studentExternalId: DEMO_STUDENT_EMMA.studentId,
      percent: 95,
      letter: 'A',
    },
    {
      courseExternalId: 'demo-liam-math7',
      studentExternalId: DEMO_STUDENT_LIAM.studentId,
      percent: 88,
      letter: 'B',
    },
    {
      courseExternalId: 'demo-liam-la',
      studentExternalId: DEMO_STUDENT_LIAM.studentId,
      percent: 72,
      letter: 'C',
    },
    {
      courseExternalId: 'demo-liam-science',
      studentExternalId: DEMO_STUDENT_LIAM.studentId,
      percent: 85,
      letter: 'B',
    },
    {
      courseExternalId: 'demo-liam-ss',
      studentExternalId: DEMO_STUDENT_LIAM.studentId,
      percent: 82,
      letter: 'B',
    },
    {
      courseExternalId: 'demo-liam-art',
      studentExternalId: DEMO_STUDENT_LIAM.studentId,
      percent: 90,
      letter: 'A',
    },
  ];
  return courses.map((c) => ({
    userId,
    provider,
    adapterId,
    externalId: `demo-gs-${c.courseExternalId}`,
    studentExternalId: c.studentExternalId,
    institutionExternalId: 'demo-westfield',
    courseExternalId: c.courseExternalId,
    termExternalId: 'demo-term',
    deletedAt: null,
    observedAt: now,
    updatedAt: now,
    record: {
      courseExternalId: c.courseExternalId,
      asOfDate,
      percentGrade: c.percent,
      letterGrade: c.letter,
    },
  }));
}

/**
 * Build slc_attendance_events: ~35 school days per student.
 * Emma: mostly present, 2 absences (1 excused, 1 unexcused), 3 tardies. Liam: 1 excused absence, 1 tardy.
 */
export function buildDemoAttendanceDocs(
  userId: string,
  baseDate: Date
): Array<Record<string, unknown>> {
  const provider = 'demo';
  const adapterId = 'com.scholaracle.demo';
  const docs: Array<Record<string, unknown>> = [];
  const schoolDays: string[] = [];
  for (let i = -35; i <= 0; i++) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + i);
    const day = d.getDay();
    if (day >= 1 && day <= 5) schoolDays.push(d.toISOString().slice(0, 10));
  }
  const now = new Date();
  for (const date of schoolDays) {
    const emmaExtId = `demo-emma-att-${date}`;
    const isEmmaAbsent1 = date === schoolDays[5];
    const isEmmaAbsent2 = date === schoolDays[12];
    const emmaTardyDates = [schoolDays[8], schoolDays[15], schoolDays[22]];
    const status = isEmmaAbsent1
      ? 'excused'
      : isEmmaAbsent2
        ? 'unexcused'
        : emmaTardyDates.includes(date)
          ? 'tardy'
          : 'present';
    docs.push({
      userId,
      provider,
      adapterId,
      externalId: emmaExtId,
      studentExternalId: DEMO_STUDENT_EMMA.studentId,
      institutionExternalId: 'demo-westfield',
      deletedAt: null,
      observedAt: now,
      updatedAt: now,
      record: { date, status },
    });
    const liamExtId = `demo-liam-att-${date}`;
    const isLiamAbsent = date === schoolDays[7];
    const liamTardy = date === schoolDays[14];
    const liamStatus = isLiamAbsent ? 'excused' : liamTardy ? 'tardy' : 'present';
    docs.push({
      userId,
      provider,
      adapterId,
      externalId: liamExtId,
      studentExternalId: DEMO_STUDENT_LIAM.studentId,
      institutionExternalId: 'demo-westfield',
      deletedAt: null,
      observedAt: now,
      updatedAt: now,
      record: { date, status: liamStatus },
    });
  }
  return docs;
}

/**
 * Build demo alerts covering all 7 AlertType variants.
 */
export function buildDemoAlerts(userId: string, emmaStudentDbId: string, liamStudentDbId: string) {
  return [
    {
      userId,
      studentId: emmaStudentDbId,
      type: 'grade_drop',
      severity: 'critical' as const,
      message: 'Algebra II grade has dropped 15%; 3 missing assignments.',
      relatedData: {
        courseName: 'Algebra II',
        courseExternalId: 'demo-emma-alg2',
        previousGrade: 82,
        currentGrade: 67,
      },
      acknowledged: false,
    },
    {
      userId,
      studentId: liamStudentDbId,
      type: 'missing_assignment',
      severity: 'warning' as const,
      message: '2 book reports missing in Language Arts.',
      relatedData: { courseName: 'Language Arts', courseExternalId: 'demo-liam-la' },
      acknowledged: false,
    },
    {
      userId,
      studentId: emmaStudentDbId,
      type: 'deadline',
      severity: 'info' as const,
      message: 'Algebra II Midterm in 3 days.',
      relatedData: { courseName: 'Algebra II', courseExternalId: 'demo-emma-alg2', dueDate: null },
      acknowledged: false,
    },
    {
      userId,
      studentId: liamStudentDbId,
      type: 'test',
      severity: 'warning' as const,
      message: 'Life Science Unit Test in 4 days.',
      relatedData: { courseName: 'Life Science', courseExternalId: 'demo-liam-science' },
      acknowledged: false,
    },
    {
      userId,
      studentId: emmaStudentDbId,
      type: 'workload',
      severity: 'info' as const,
      message: '4 assignments due this week across 3 courses.',
      relatedData: { assignmentCount: 4 },
      acknowledged: false,
    },
    {
      userId,
      studentId: emmaStudentDbId,
      type: 'positive',
      severity: 'info' as const,
      message: 'AP Biology grade improved 2% this week.',
      relatedData: { courseName: 'AP Biology', courseExternalId: 'demo-emma-ap-bio' },
      acknowledged: false,
    },
    {
      userId,
      studentId: emmaStudentDbId,
      type: 'recommendation',
      severity: 'info' as const,
      message: 'Consider scheduling a study session for Algebra II before the midterm.',
      relatedData: { courseName: 'Algebra II', courseExternalId: 'demo-emma-alg2' },
      acknowledged: false,
    },
  ];
}

// ---------------------------------------------------------------------------
// Two-parent fixture — owner-scoped data model verification
// ---------------------------------------------------------------------------

/**
 * A second household (Dad) who has accepted shared access to Emma's record.
 * Used to verify that `student.dataUserId()` correctly routes reads to the
 * owner's (Sarah Mitchell's) slc_* partition so Dad sees the same gradebook.
 *
 * In tests / dev seed:
 *   1. Register DEMO_COACCESS_USER (or look them up).
 *   2. Add them to Emma's `sharedWith` array with status 'accepted'.
 *   3. Assert GET /students/:emmaId/grades under DEMO_COACCESS_USER returns
 *      the same courses/assignments as under DEMO_USER.
 */
export const DEMO_COACCESS_USER = {
  email: 'david.mitchell.demo@scholarmancy.com',
  password: 'DemoPass123!',
  name: 'David Mitchell',
} as const;

/** Build the sharedWith entry to add to Emma's student record. */
export function buildDemoCoAccessEntry(
  coAccessUserId: string,
  now: Date = new Date()
): {
  userId: string;
  email: string;
  name: string;
  role: 'parent';
  status: 'accepted';
  isAdmin: false;
  invitedAt: Date;
  acceptedAt: Date;
} {
  return {
    userId: coAccessUserId,
    email: DEMO_COACCESS_USER.email,
    name: DEMO_COACCESS_USER.name,
    role: 'parent',
    status: 'accepted',
    isAdmin: false,
    invitedAt: now,
    acceptedAt: now,
  };
}
