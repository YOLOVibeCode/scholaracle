/**
 * Aeries Parent Portal browser-context extractor functions.
 *
 * These functions run inside the browser context. They must be self-contained
 * — no imports, no closure over outer scope.
 */

// ---------------------------------------------------------------------------
// Raw extract types
// ---------------------------------------------------------------------------

export interface IAeriesCourseExtract {
  readonly period: string;
  readonly name: string;
  readonly term: string;
  readonly teacher: string;
  readonly teacherEmail: string;
  readonly room: string;
  readonly currentGrade: number | null;
  readonly currentPercent: number | null;
  readonly missingCount: number;
  readonly assignments: IAeriesAssignmentExtract[];
}

export interface IAeriesAssignmentExtract {
  readonly number: string;
  readonly title: string;
  readonly category: string;
  readonly scoreEarned: number | null;
  readonly scorePossible: number | null;
  readonly percentCorrect: number | null;
  readonly dateAssigned: string;
  readonly dateDue: string;
  readonly dateCompleted: string;
  readonly gradingComplete: boolean;
  readonly isMissing: boolean;
  readonly comment: string;
}

export interface IAeriesStudentExtract {
  readonly name: string;
  readonly studentId: string;
  readonly grade: string;
  readonly school: string;
  readonly courses: IAeriesCourseExtract[];
  readonly attendance: IAeriesAttendanceExtract[];
}

export interface IAeriesAttendanceExtract {
  readonly date: string;
  readonly period: string;
  readonly status: string;
  readonly reason: string;
  readonly course: string;
}

export interface IAeriesFullExtract {
  readonly students: IAeriesStudentExtract[];
  readonly timestamp: string;
}

// ---------------------------------------------------------------------------
// Extractor functions
// ---------------------------------------------------------------------------

/** Extracts students listed on the Aeries dashboard. */
export function extractAeriesStudentList(): Array<{ name: string; grade: string; school: string }> {
  const results: Array<{ name: string; grade: string; school: string }> = [];
  const studentEls = document.querySelectorAll('[class*="student-card"], [class*="StudentCard"]');
  if (studentEls.length > 0) {
    for (const el of studentEls) {
      const name =
        el
          .querySelector('a[href*="Vega"], a[class*="name"], h3, h4, strong')
          ?.textContent?.trim() ?? '';
      const text = el.textContent ?? '';
      const gradeMatch = text.match(/Grade:\s*(\d+)/);
      const schoolMatch = text.match(/(?:Grade:\s*\d+\s*)(.*?)$/m);
      results.push({
        name:
          (name ||
            text
              .split('\n')
              .filter((l: string) => l.trim())[0]
              ?.trim()) ??
          '',
        grade: gradeMatch?.[1] ?? '',
        school: schoolMatch?.[1]?.trim() ?? '',
      });
    }
  }
  if (results.length === 0) {
    const allText = document.body.textContent ?? '';
    const nameMatch = allText.match(/Welcome to the Aeries Portal for\s+(.+)/);
    if (nameMatch) results.push({ name: nameMatch[1]!.trim(), grade: '', school: '' });
  }
  return results;
}

/** Extracts course rows from the Aeries dashboard using a CSS selector. */
export function extractAeriesDashboardCourses(rowSelector: string): Array<{
  period: string;
  name: string;
  term: string;
  teacher: string;
  teacherEmail: string;
  room: string;
  currentGrade: number | null;
  currentPercent: number | null;
  missingCount: number;
  assignments: never[];
}> {
  const rows = document.querySelectorAll(rowSelector);
  const out: Array<{
    period: string;
    name: string;
    term: string;
    teacher: string;
    teacherEmail: string;
    room: string;
    currentGrade: number | null;
    currentPercent: number | null;
    missingCount: number;
    assignments: never[];
  }> = [];
  for (const row of rows) {
    const cells = row.querySelectorAll('td, [role="gridcell"]');
    if (cells.length < 3) continue;
    const periodText = cells[0]?.textContent?.trim() ?? '';
    const courseText = cells[1]?.textContent ?? '';
    const gradeText = cells[2]?.textContent?.trim() ?? '';
    const missingText = cells[3]?.textContent?.trim() ?? '';
    if (!periodText || !/^\d+$/.test(periodText)) continue;
    const teacherMatch = courseText.match(/Teacher:\s*([^R\n]+?)(?:\s*Room:|$)/);
    const roomMatch = courseText.match(/Room:\s*(\S+)/);
    const nameMatch = courseText.match(/^([^T]+?)(?:\s*Teacher:|$)/);
    const termMatch = courseText.match(/- (Quarter \d+|Semester \d+|[^-]+)$/m);
    const gradeNumMatch = gradeText.match(/(\d+)\s*\((\d+\.?\d*)%\)/);
    out.push({
      period: periodText,
      name:
        nameMatch?.[1]?.trim().split('\n')[0]?.trim() ?? courseText.split('\n')[0]?.trim() ?? '',
      term: termMatch?.[1]?.trim() ?? '',
      teacher: teacherMatch?.[1]?.trim() ?? '',
      teacherEmail: '',
      room: roomMatch?.[1]?.trim() ?? '',
      currentGrade: gradeNumMatch ? parseInt(gradeNumMatch[1]!, 10) : null,
      currentPercent: gradeNumMatch ? parseFloat(gradeNumMatch[2]!) : null,
      missingCount: parseInt(missingText, 10) || 0,
      assignments: [],
    });
  }
  return out;
}

/** Extracts the course dropdown options from GradebookDetails. */
export function extractAeriesCourseDropdownOptions(): Array<{ value: string; text: string }> {
  const select = document.querySelector(
    'select[id*="DropDown"], select'
  ) as HTMLSelectElement | null;
  if (!select) return [];
  return Array.from(select.options).map((o: HTMLOptionElement) => ({
    value: o.value,
    text: o.text.trim(),
  }));
}

/** Extracts teacher email from the current GradebookDetails page. */
export function extractAeriesTeacherEmail(): string {
  const emailLink = document.querySelector('a[href*="@"][href*="mailto"], a[href*="@"]');
  if (emailLink) return emailLink.textContent?.trim() ?? '';
  const text = document.body.textContent ?? '';
  const match = text.match(/[\w.-]+@[\w.-]+\.\w{2,}/);
  return match?.[0] ?? '';
}

/** Extracts assignment details from the current GradebookDetails page. */
export function extractAeriesAssignments(): Array<{
  number: string;
  title: string;
  category: string;
  scoreEarned: number | null;
  scorePossible: number | null;
  percentCorrect: number | null;
  dateAssigned: string;
  dateDue: string;
  dateCompleted: string;
  gradingComplete: boolean;
  isMissing: boolean;
  comment: string;
}> {
  type AssignmentRow = {
    number: string;
    title: string;
    category: string;
    scoreEarned: number | null;
    scorePossible: number | null;
    percentCorrect: number | null;
    dateAssigned: string;
    dateDue: string;
    dateCompleted: string;
    gradingComplete: boolean;
    isMissing: boolean;
    comment: string;
  };
  const results: AssignmentRow[] = [];
  const body = document.body.innerHTML;
  const assignmentBlocks = body.split(/(?=<div[^>]*class="[^"]*[Aa]ssignment)/);

  for (const block of assignmentBlocks) {
    const titleMatch = block.match(/<[^>]*class="[^"]*[Tt]itle[^"]*"[^>]*>([^<]+)/);
    if (!titleMatch) continue;
    const scoreMatch = block.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
    const percentMatch = block.match(/(\d+(?:\.\d+)?)%/);
    const dueDateMatch = block.match(/Due\s*(?:Date)?:?\s*(\d{2}\/\d{2}\/\d{4})/);
    const assignedMatch = block.match(/(?:Date\s*)?Assigned:?\s*(\d{2}\/\d{2}\/\d{4})/);
    const completedMatch = block.match(/(?:Date\s*)?Completed:?\s*(\d{2}\/\d{2}\/\d{4})/);
    const categoryMatch = block.match(/(?:Formative|Summative)/i);
    const gradingMatch = block.match(/Grading\s*Complete:?\s*(True|False)/i);
    const missingMatch = block.match(/(?:Missing|MSG)/i);
    results.push({
      number: '',
      title: titleMatch[1]!.trim(),
      category: categoryMatch?.[0] ?? '',
      scoreEarned: scoreMatch ? parseFloat(scoreMatch[1]!) : null,
      scorePossible: scoreMatch ? parseFloat(scoreMatch[2]!) : null,
      percentCorrect: percentMatch ? parseFloat(percentMatch[1]!) : null,
      dateAssigned: assignedMatch?.[1] ?? '',
      dateDue: dueDateMatch?.[1] ?? '',
      dateCompleted: completedMatch?.[1] ?? '',
      gradingComplete: gradingMatch?.[1]?.toLowerCase() === 'true',
      isMissing: !!missingMatch,
      comment: '',
    });
  }

  if (results.length === 0) {
    const allText = (document.body as HTMLElement).innerText;
    const parts = allText.split(/(?=\n\d+\s*-\s+[^\n]+)/);
    for (const part of parts) {
      const headerMatch = part.match(/^(\d+)\s*-\s+(.+)/);
      if (!headerMatch) continue;
      const number = headerMatch[1]!;
      const title = headerMatch[2]!.split('\n')[0]!.trim();
      const categoryMatch = part.match(/(Formative|Summative)/i);
      const scoreMatch = part.match(/Score\s*\n?\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
      const percentMatch = part.match(/(\d+(?:\.\d+)?)%/);
      const dueDateMatch = part.match(/Due\s*Date:?\s*(\d{2}\/\d{2}\/\d{4})/);
      const assignedMatch = part.match(/Date\s*Assigned:?\s*(\d{2}\/\d{2}\/\d{4})/);
      const completedMatch = part.match(/Date\s*Completed:?\s*(\d{2}\/\d{2}\/\d{4})/);
      const gradingMatch = part.match(/Grading\s*Complete:?\s*(True|False)/i);
      const missingClass = part.match(/Missing|MSG -|EXC -/i);
      results.push({
        number,
        title,
        category: categoryMatch?.[1] ?? '',
        scoreEarned: scoreMatch ? parseFloat(scoreMatch[1]!) : null,
        scorePossible: scoreMatch ? parseFloat(scoreMatch[2]!) : null,
        percentCorrect: percentMatch ? parseFloat(percentMatch[1]!) : null,
        dateAssigned: assignedMatch?.[1] ?? '',
        dateDue: dueDateMatch?.[1] ?? '',
        dateCompleted: completedMatch?.[1] ?? '',
        gradingComplete: gradingMatch?.[1]?.toLowerCase() === 'true',
        isMissing: !!missingClass,
        comment: '',
      });
    }
  }
  return results;
}

/** Extracts attendance records from the Aeries attendance page. */
export function extractAeriesAttendance(): Array<{
  date: string;
  period: string;
  status: string;
  reason: string;
  course: string;
}> {
  const results: Array<{
    date: string;
    period: string;
    status: string;
    reason: string;
    course: string;
  }> = [];
  const rows = document.querySelectorAll('table tr, [class*="attendance"] tr');
  for (const row of rows) {
    const cells = row.querySelectorAll('td');
    if (cells.length < 2) continue;
    const texts = Array.from(cells).map((td) => (td as Element).textContent?.trim() ?? '');
    const dateText = texts[0] ?? '';
    if (dateText && /\d{1,2}\/\d{1,2}\/\d{4}/.test(dateText)) {
      results.push({
        date: dateText,
        period: texts[1] ?? '',
        status: texts[2] ?? '',
        reason: texts[3] ?? '',
        course: texts[4] ?? '',
      });
    }
  }
  if (results.length === 0) {
    const text = (document.body as HTMLElement).innerText;
    const lines = text.split('\n');
    for (const line of lines) {
      const match = line.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s+(.+)/);
      if (match) {
        results.push({
          date: match[1]!,
          period: '',
          status: match[2]?.trim() ?? '',
          reason: '',
          course: '',
        });
      }
    }
  }
  return results;
}

/** Extracts student profile information from the current Aeries page. */
export function extractAeriesStudentInfo(): {
  studentId: string;
  name: string;
  grade: string;
  school: string;
} {
  const text = (document.body as HTMLElement).innerText;
  const idMatch = text.match(/ID:\s*(\d+)/);
  const gradeMatch = text.match(/Grade:\s*(\d+)/);
  const nameEl = document.querySelector('[class*="student-name"], h2, [class*="Header"] a');
  let name = nameEl?.textContent?.trim() ?? '';
  if (!name) {
    const headerMatch = text.match(
      /(?:Welcome to the Aeries Portal for|Gradebook Details\s+)([A-Z][a-z]+ [A-Z][a-z]+)/
    );
    name = headerMatch?.[1] ?? '';
  }
  const schoolMatch = text.match(/([\w\s]+(?:High School|Middle School|Elementary))/);
  return {
    studentId: idMatch?.[1] ?? '',
    name,
    grade: gradeMatch?.[1] ?? '',
    school: schoolMatch?.[1]?.trim() ?? '',
  };
}
