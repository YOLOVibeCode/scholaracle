/**
 * Skyward browser-context extractor functions.
 *
 * These functions run inside the browser context. They must be self-contained
 * — no imports, no closure over outer scope.
 */

// ---------------------------------------------------------------------------
// Raw extract types
// ---------------------------------------------------------------------------

export interface ISkywardCourseExtract {
  readonly name: string;
  readonly period: string;
  readonly time: string;
  readonly teacher: string;
  readonly currentGrade: string;
  readonly grades: Record<string, string>;
  readonly _cni?: string;
}

export interface ISkywardAssignmentExtract {
  readonly title: string;
  readonly course: string;
  readonly period: string;
  readonly category: string;
  readonly dueDate: string;
  readonly pointsEarned: string;
  readonly pointsPossible: string;
  readonly grade: string;
  readonly status: 'graded' | 'missing' | 'late' | 'unknown';
}

export interface ISkywardMissingAssignment {
  readonly dueDate: string;
  readonly title: string;
  readonly course: string;
  readonly period: string;
  readonly teacher: string;
}

export interface ISkywardAttendanceExtract {
  readonly date: string;
  readonly status: string;
  readonly period: string;
  readonly course: string;
  readonly reason: string;
}

export interface ISkywardScheduleEntry {
  readonly period: string;
  readonly time: string;
  readonly course: string;
  readonly teacher: string;
  readonly room: string;
}

export interface ISkywardFullExtract {
  readonly student: string;
  readonly school: string;
  readonly courses: ISkywardCourseExtract[];
  readonly missingAssignments: ISkywardMissingAssignment[];
  readonly assignments: ISkywardAssignmentExtract[];
  readonly attendance: ISkywardAttendanceExtract[];
  readonly schedule: ISkywardScheduleEntry[];
  readonly timestamp: string;
}

// ---------------------------------------------------------------------------
// Extractor functions
// ---------------------------------------------------------------------------

/** Extracts the student name from the Skyward header area. */
export function extractSkywardStudentName(): string {
  const el = document.querySelector('.sf_headerName, [id*="studentName"]');
  if (el) return el.textContent?.trim() ?? '';
  const header = document.querySelector('#sf_HeaderWrap, header, [role="banner"]');
  if (header) {
    const headerText = header.textContent ?? '';
    const nameMatch = headerText.match(/([A-Z][a-z]+\s+[A-Z]\.?\s*[A-Z][a-z]+)/);
    if (nameMatch) return nameMatch[1]!;
  }
  const topNav = document.querySelectorAll('a, span');
  for (const node of topNav) {
    const text = node.textContent?.trim() ?? '';
    if (text.match(/^[A-Z][a-z]+ [A-Z][a-z]+$/) && text.length < 40) return text;
  }
  return 'Unknown';
}

/** Extracts the school name from the Skyward page. */
export function extractSkywardSchoolName(): string {
  const el = document.querySelector('[id*="schoolName"]');
  if (el) return el.textContent?.trim() ?? '';
  const allText = document.body?.textContent ?? '';
  const schoolMatch = allText.match(
    /(LAKE DALLAS HIGH SCHOOL|[A-Z ]{10,}(?:HIGH|MIDDLE|ELEMENTARY) SCHOOL)/
  );
  return schoolMatch?.[1] ?? 'Unknown School';
}

/** Extracts assignments from the Skyward gradeInfoDialog for a specific course. */
export function extractSkywardCourseAssignments(
  courseName: string,
  coursePeriod: string
): Array<{
  title: string;
  course: string;
  period: string;
  category: string;
  dueDate: string;
  pointsEarned: string;
  pointsPossible: string;
  grade: string;
  status: 'graded' | 'missing' | 'late' | 'unknown';
}> {
  const dialog = document.querySelector('#gradeInfoDialog');
  if (!dialog) return [];

  const results: Array<{
    title: string;
    course: string;
    period: string;
    category: string;
    dueDate: string;
    pointsEarned: string;
    pointsPossible: string;
    grade: string;
    status: 'graded' | 'missing' | 'late' | 'unknown';
  }> = [];

  const tables = dialog.querySelectorAll('table');
  let assignTable: Element | null = null;
  for (const t of tables) {
    const headerRow = t.querySelector('tr');
    const headerText = headerRow?.textContent ?? '';
    if (
      headerText.includes('Assignment') &&
      (headerText.includes('Due') || headerText.includes('Score'))
    ) {
      assignTable = t;
      break;
    }
  }
  if (!assignTable) return results;

  let currentCategory = '';

  const rows = assignTable.querySelectorAll('tr');
  for (const row of rows) {
    const text = row.textContent?.trim().replace(/\s+/g, ' ') ?? '';
    if (text.includes('weighted at')) {
      const catMatch = text.match(/^(\S+)\s*weighted at\s*([\d.]+)%/);
      if (catMatch) currentCategory = catMatch[1]!;
      continue;
    }

    const cells = row.querySelectorAll('td');
    if (cells.length >= 5) {
      const due = cells[0]?.textContent?.trim() ?? '';
      const title = cells[1]?.textContent?.trim() ?? '';
      const grade = cells[2]?.textContent?.trim() ?? '';
      const pointsRaw = cells[4]?.textContent?.trim() ?? '';
      const missingCell = cells[5]?.textContent?.trim() ?? '';
      const hasMissingImg = cells[5]?.querySelector('img') !== null;

      if (!title || title === 'Assignment' || title.includes('weighted at')) continue;

      const ptsMatch = pointsRaw.match(/([\d.]+)\s*out of\s*([\d.]+)/);
      const pointsEarned = ptsMatch ? ptsMatch[1]! : '';
      const pointsPossible = ptsMatch ? ptsMatch[2]! : '';
      const isMissing = missingCell === 'M' || hasMissingImg;
      const status: 'graded' | 'missing' | 'late' | 'unknown' = isMissing
        ? 'missing'
        : grade && /^\d/.test(grade)
          ? 'graded'
          : 'unknown';

      results.push({
        title,
        course: courseName,
        period: coursePeriod,
        category: currentCategory,
        dueDate: due,
        pointsEarned,
        pointsPossible,
        grade,
        status,
      });
    }
  }
  return results;
}

/** Extracts attendance records from the Skyward attendance page. */
export function extractSkywardAttendance(): Array<{
  date: string;
  status: string;
  period: string;
  course: string;
  reason: string;
}> {
  const results: Array<{
    date: string;
    status: string;
    period: string;
    course: string;
    reason: string;
  }> = [];
  const tables = document.querySelectorAll('table');
  for (const table of tables) {
    const headerText = table.querySelector('tr')?.textContent ?? '';
    if (!headerText.includes('Attendance') || !headerText.includes('Period')) continue;
    const trs = table.querySelectorAll('tr');
    for (let i = 1; i < trs.length; i++) {
      const tds = trs[i]!.querySelectorAll('td');
      if (tds.length >= 3) {
        const texts = Array.from(tds).map((td) => (td as Element).textContent?.trim() ?? '');
        const dateText = texts[0] ?? '';
        if (dateText && /[A-Z][a-z]{2}\s/.test(dateText)) {
          results.push({
            date: dateText,
            status: texts[1] ?? '',
            period: texts[2] ?? '',
            course: texts[3] ?? '',
            reason: '',
          });
        }
      }
    }
  }
  return results;
}

/** Extracts schedule entries from the Skyward schedule page. */
export function extractSkywardSchedule(): Array<{
  period: string;
  time: string;
  course: string;
  teacher: string;
  room: string;
}> {
  const results: Array<{
    period: string;
    time: string;
    course: string;
    teacher: string;
    room: string;
  }> = [];
  const tables = document.querySelectorAll('table');
  for (const table of tables) {
    const headerRow = table.querySelector('tr');
    const headerText = headerRow?.textContent ?? '';
    if (!headerText.includes('Term') && !headerText.includes('2025')) continue;

    const rows = table.querySelectorAll('tr');
    for (let i = 1; i < rows.length; i++) {
      const tds = rows[i]!.querySelectorAll('td, th');
      if (tds.length < 2) continue;

      const periodCell = tds[0]?.textContent?.trim() ?? '';
      const periodMatch = periodCell.match(/Period\s*(\d+[A-Z]?)/);
      const timeMatch = periodCell.match(/\(([^)]+)\)/);
      if (!periodMatch) continue;

      let bestCell = tds[tds.length - 2];
      for (let j = 1; j < tds.length; j++) {
        const style = tds[j]?.getAttribute('style') ?? '';
        const cls = tds[j]?.getAttribute('class') ?? '';
        if (style.includes('background') || cls.includes('highlight') || cls.includes('cur')) {
          bestCell = tds[j];
          break;
        }
      }

      const cellText = bestCell?.textContent?.trim() ?? '';
      if (!cellText) continue;

      const lines = cellText
        .split('\n')
        .map((l: string) => l.trim())
        .filter((l: string) => l);
      const course = lines[0] ?? '';
      const teacher = lines[1] ?? '';
      const roomMatch = cellText.match(/Room\s*(\w+)/);
      results.push({
        period: periodMatch[1] ?? '',
        time: timeMatch?.[1] ?? '',
        course,
        teacher,
        room: roomMatch?.[1] ?? '',
      });
    }
  }
  return results;
}
