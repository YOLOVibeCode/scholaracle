/**
 * Shared fake-portal recipe conformance: one expected-count table for every host driver.
 */
import type { IAeriesFullExtract } from '../extractors/aeries/aeries-extractors';
import type { ISkywardFullExtract } from '../extractors/skyward/skyward-extractors';
import {
  FAKE_PORTAL_AERIES_EXPECTED,
  FAKE_PORTAL_SKYWARD_ASSIGNMENTS,
  FAKE_PORTAL_SKYWARD_EXPECTED,
  FAKE_PORTAL_SKYWARD_GRADEBOOK_PATH,
  buildM402SkywardGradebookHtml,
} from './fakePortalM402';

export type FakePortalRecipeId = 'aeries' | 'skyward';

export interface IFakePortalConformanceCase {
  readonly id: FakePortalRecipeId;
  readonly login: {
    readonly startPath: string;
    readonly expectPathPart: string;
  };
  readonly recipeRoot: (fakeOrigin: string) => string;
}

/** Recipe → expected counts on the M4-02 fake portal (Aeries + Skyward only). */
export const FAKE_PORTAL_RECIPE_CONFORMANCE: readonly IFakePortalConformanceCase[] = [
  {
    id: 'aeries',
    login: {
      startPath: '/fake-aeries/student/LoginParent.aspx?csp=strict',
      expectPathPart: '/fake-aeries/student/Dashboard.aspx',
    },
    recipeRoot: (origin) =>
      `${origin.replace(/\/$/, '')}/fake-aeries/student/`,
  },
  {
    id: 'skyward',
    login: {
      startPath: `/skyward/login?next=${encodeURIComponent(FAKE_PORTAL_SKYWARD_GRADEBOOK_PATH)}&csp=strict`,
      expectPathPart: FAKE_PORTAL_SKYWARD_GRADEBOOK_PATH,
    },
    recipeRoot: (origin) => origin.replace(/\/$/, ''),
  },
] as const;

export { FAKE_PORTAL_AERIES_EXPECTED, FAKE_PORTAL_SKYWARD_EXPECTED };

export function assertFakePortalAeriesExtract(extract: IAeriesFullExtract): void {
  const expected = FAKE_PORTAL_AERIES_EXPECTED;
  const names = extract.students.map((s) => s.name);
  if (JSON.stringify(names) !== JSON.stringify([...expected.studentNames])) {
    throw new Error(`Aeries student names mismatch: got ${names.join(', ')}`);
  }
  const ann = extract.students.find((s) => s.studentId === expected.ann.studentId);
  const ben = extract.students.find((s) => s.studentId === expected.ben.studentId);
  if (!ann || !ben) {
    throw new Error('Aeries expected students Ann/Ben not found in extract');
  }
  const annAssignments = ann.courses.reduce((n, c) => n + c.assignments.length, 0);
  const benAssignments = ben.courses.reduce((n, c) => n + c.assignments.length, 0);
  if (ann.courses.length !== expected.ann.courseCount) {
    throw new Error(`Ann course count: expected ${expected.ann.courseCount}, got ${ann.courses.length}`);
  }
  if (annAssignments !== expected.ann.totalAssignments) {
    throw new Error(
      `Ann assignment count: expected ${expected.ann.totalAssignments}, got ${annAssignments}`
    );
  }
  if (ann.attendance.length !== expected.ann.attendanceCount) {
    throw new Error(
      `Ann attendance count: expected ${expected.ann.attendanceCount}, got ${ann.attendance.length}`
    );
  }
  if (ben.courses.length !== expected.ben.courseCount) {
    throw new Error(`Ben course count: expected ${expected.ben.courseCount}, got ${ben.courses.length}`);
  }
  if (benAssignments !== expected.ben.totalAssignments) {
    throw new Error(
      `Ben assignment count: expected ${expected.ben.totalAssignments}, got ${benAssignments}`
    );
  }
  if (ben.attendance.length !== expected.ben.attendanceCount) {
    throw new Error(
      `Ben attendance count: expected ${expected.ben.attendanceCount}, got ${ben.attendance.length}`
    );
  }
}

export function assertFakePortalSkywardExtract(extract: ISkywardFullExtract): void {
  const expected = FAKE_PORTAL_SKYWARD_EXPECTED;
  if (extract.courses.length !== expected.courseCount) {
    throw new Error(`Skyward course count: expected ${expected.courseCount}, got ${extract.courses.length}`);
  }
  if (extract.assignments.length !== expected.assignmentRowCount) {
    throw new Error(
      `Skyward assignment row count: expected ${expected.assignmentRowCount}, got ${extract.assignments.length}`
    );
  }
  const names = extract.courses.map((c) => c.name).sort();
  const want = [...expected.courseNames].sort();
  if (JSON.stringify(names) !== JSON.stringify(want)) {
    throw new Error(`Skyward course names mismatch: got ${names.join(', ')}`);
  }
}

/** jsdom: attach gradebook dialog handlers (fake portal uses the same slice server-side). */
export function mountFakePortalSkywardJsdomInteractivity(): void {
  const wrap = document.querySelector('.sf_DialogWrap') as HTMLElement | null;
  if (wrap) {
    wrap.querySelector('.sf_DialogClose')?.addEventListener('click', () => {
      wrap.style.display = 'none';
    });
  }
  for (const cell of Array.from(document.querySelectorAll('a#showGradeInfo'))) {
    cell.addEventListener('click', () => {
      const cni = cell.getAttribute('data-cni');
      if (!cni) return;
      setTimeout(() => {
        const dialog = document.querySelector('#gradeInfoDialog');
        if (dialog) {
          dialog.innerHTML =
            '<table><tr><th>Due</th><th>Assignment</th><th>Grade</th><th>Score(%)</th>' +
            `<th>Points Score</th><th>Missing</th></tr>${FAKE_PORTAL_SKYWARD_ASSIGNMENTS[cni] ?? ''}</table>`;
        }
        if (wrap) wrap.style.display = 'block';
      }, 0);
    });
  }
}

export function buildFakePortalSkywardJsdomFixtures(skywardOrigin: string): {
  readonly fixtures: Readonly<Record<string, string>>;
  readonly initialUrl: string;
} {
  const base = skywardOrigin.replace(/\/$/, '');
  const initialUrl = `${base}${FAKE_PORTAL_SKYWARD_GRADEBOOK_PATH}`;
  return {
    fixtures: { [initialUrl]: buildM402SkywardGradebookHtml() },
    initialUrl,
  };
}

/** jsdom replay entry points for both fake-portal recipes (Aeries uses `M402SimAeriesDriver`). */
export function buildFakePortalJsdomFixtures(
  aeriesStudentRoot: string,
  skywardOrigin: string
): {
  readonly aeriesStudentRoot: string;
  readonly skyward: ReturnType<typeof buildFakePortalSkywardJsdomFixtures>;
} {
  return {
    aeriesStudentRoot,
    skyward: buildFakePortalSkywardJsdomFixtures(skywardOrigin),
  };
}

/** Default demo origin for docs and local e2e when env is unset. */
export const FAKE_PORTAL_DEFAULT_ORIGIN = 'http://127.0.0.1:2855';
