/**
 * Realistic demo data for "Try Demo" flow.
 * Demo user: demo@scholaracle.com / DemoPass123! (Sarah Mitchell)
 * Students: Emma Mitchell (10th), Liam Mitchell (7th)
 */

export const DEMO_USER = {
  email: 'demo@scholaracle.com',
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
}

/**
 * Build demo assignments with due dates relative to baseDate.
 * Spread over the past 6 weeks and next 2 weeks.
 */
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
    out.push({
      courseExternalId: 'demo-emma-ap-bio',
      studentExternalId: DEMO_STUDENT_EMMA.studentId,
      externalId: `demo-emma-ap-bio-a${i}`,
      title: `Unit ${Math.floor((i + 40) / 5)} Homework`,
      dueAt: day(i),
      status: i <= 0 ? 'graded' : i > 3 ? 'missing' : 'submitted',
      pointsPossible: pts,
      pointsEarned: earned,
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
    },
  }));
}

/**
 * Build slc_event_series documents (a few quizzes and tests).
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
  ];
  return series;
}

/**
 * Build demo alerts (Emma Algebra II grade drop + missing; Liam Language Arts missing).
 */
export function buildDemoAlerts(userId: string, emmaStudentDbId: string, liamStudentDbId: string) {
  return [
    {
      userId,
      studentId: emmaStudentDbId,
      type: 'GRADE_DROP',
      severity: 'critical' as const,
      message: 'Algebra II grade has dropped; 3 missing assignments.',
      relatedData: { courseName: 'Algebra II', courseExternalId: 'demo-emma-alg2' },
      acknowledged: false,
    },
    {
      userId,
      studentId: liamStudentDbId,
      type: 'MISSING_ASSIGNMENT',
      severity: 'warning' as const,
      message: '2 book reports missing in Language Arts.',
      relatedData: { courseName: 'Language Arts', courseExternalId: 'demo-liam-la' },
      acknowledged: false,
    },
  ];
}
