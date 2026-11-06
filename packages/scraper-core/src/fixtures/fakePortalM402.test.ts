/**
 * @jest-environment jsdom
 *
 * Locks M4-02 fake portal expected extraction sizes to the shared fixture module.
 */
import { runAeriesRecipe } from '../recipes/aeries-recipe';
import { runSkywardRecipe } from '../recipes/skyward-recipe';
import {
  FAKE_PORTAL_AERIES_EXPECTED,
  FAKE_PORTAL_SKYWARD_EXPECTED,
  buildM402SkywardGradebookHtml,
  FAKE_PORTAL_SKYWARD_ASSIGNMENTS,
  M402SimAeriesDriver,
} from './fakePortalM402';
import type { IPageDriver } from '../driver/IPageDriver';

const AERIES_ROOT = 'https://district.aeries.net/student/';

class SkywardJsdomDriver implements IPageDriver {
  async goto(): Promise<void> {}

  url(): string {
    return 'https://skyward.example.test/scripts/wsisa.dll/WService=x/sfgradebook001.w';
  }

  async evaluate<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => TResult | Promise<TResult>,
    ...args: TArgs
  ): Promise<TResult> {
    return fn(...args);
  }

  async content(): Promise<string> {
    return document.documentElement.outerHTML;
  }

  async waitForLoad(): Promise<void> {}

  async waitForUrlIncludes(): Promise<void> {}

  async sleep(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  onNewPage(): void {}
}

function mountSkywardFixture(): void {
  document.body.innerHTML = buildM402SkywardGradebookHtml();
  const wrap = document.querySelector('.sf_DialogWrap') as HTMLElement;
  wrap.querySelector('.sf_DialogClose')!.addEventListener('click', () => {
    wrap.style.display = 'none';
  });
  for (const cell of Array.from(document.querySelectorAll('a#showGradeInfo'))) {
    cell.addEventListener('click', () => {
      const cni = cell.getAttribute('data-cni')!;
      setTimeout(() => {
        document.querySelector('#gradeInfoDialog')!.innerHTML =
          '<table><tr><th>Due</th><th>Assignment</th><th>Grade</th><th>Score(%)</th>' +
          `<th>Points Score</th><th>Missing</th></tr>${FAKE_PORTAL_SKYWARD_ASSIGNMENTS[cni] ?? ''}</table>`;
        wrap.style.display = 'block';
      }, 0);
    });
  }
}

describe('fakePortalM402 expected counts', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('matches runAeriesRecipe on M402SimAeriesDriver', async () => {
    const driver = new M402SimAeriesDriver(AERIES_ROOT);
    const result = await runAeriesRecipe(driver, AERIES_ROOT);

    expect(result.students.map((s) => s.name)).toEqual([...FAKE_PORTAL_AERIES_EXPECTED.studentNames]);
    const [ann, ben] = result.students;
    expect(ann!.courses).toHaveLength(FAKE_PORTAL_AERIES_EXPECTED.ann.courseCount);
    expect(
      ann!.courses.reduce((n, c) => n + c.assignments.length, 0)
    ).toBe(FAKE_PORTAL_AERIES_EXPECTED.ann.totalAssignments);
    expect(ann!.attendance).toHaveLength(FAKE_PORTAL_AERIES_EXPECTED.ann.attendanceCount);

    expect(ben!.courses).toHaveLength(FAKE_PORTAL_AERIES_EXPECTED.ben.courseCount);
    expect(
      ben!.courses.reduce((n, c) => n + c.assignments.length, 0)
    ).toBe(FAKE_PORTAL_AERIES_EXPECTED.ben.totalAssignments);
    expect(ben!.attendance).toHaveLength(FAKE_PORTAL_AERIES_EXPECTED.ben.attendanceCount);
  });

  it('matches runSkywardRecipe on M402 Skyward html', async () => {
    mountSkywardFixture();
    const extract = await runSkywardRecipe(new SkywardJsdomDriver(), 'https://skyward.example.test');

    expect(extract.courses).toHaveLength(FAKE_PORTAL_SKYWARD_EXPECTED.courseCount);
    expect(extract.assignments).toHaveLength(FAKE_PORTAL_SKYWARD_EXPECTED.assignmentRowCount);
    expect(extract.courses.map((c) => c.name).sort()).toEqual(
      [...FAKE_PORTAL_SKYWARD_EXPECTED.courseNames].sort()
    );
  });
});
