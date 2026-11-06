/**
 * @jest-environment jsdom
 *
 * Skyward recipe against a simulated gradebook page. The driver runs each page
 * function directly against the jsdom document, the way a WebView runs it in
 * the portal page.
 */
import type { IPageDriver } from '../driver/IPageDriver';
import {
  runSkywardRecipe,
  parseSkywardGradeCells,
  pickSkywardCurrentGrade,
} from './skyward-recipe';
import {
  closeSkywardDialogs,
  extractSkywardCourseAssignments,
  isSkywardGradeInfoReady,
} from '../extractors/skyward/skyward-extractors';
import {
  FAKE_PORTAL_SKYWARD_ASSIGNMENTS,
  buildM402SkywardGradebookHtml,
  buildM402SkywardHomeHtml,
} from '../fixtures/fakePortalM402';
import { SKYWARD_SELECTORS_V1 } from '../selectors/skywardV1';

class DomPageDriver implements IPageDriver {
  readonly evaluated: string[] = [];
  async goto(): Promise<void> {}
  url(): string {
    return 'https://skyward.example.test/scripts/wsisa.dll/WService=x/sfgradebook001.w';
  }
  async evaluate<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => TResult | Promise<TResult>,
    ...args: TArgs
  ): Promise<TResult> {
    this.evaluated.push(fn.name);
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

/**
 * Starts on Skyward home (sfhome01); first Gradebook nav click loads gradebook markup.
 */
class HomeThenGradebookDriver implements IPageDriver {
  private _url = 'https://skyward.example.test/scripts/wsisa.dll/WService=x/sfhome01.w';

  readonly navigatedToGradebook: { value: boolean } = { value: false };

  async goto(url: string): Promise<void> {
    this._url = url;
  }

  url(): string {
    return this._url;
  }

  private attachGradebookDialogHooks(): void {
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

  async evaluate<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => TResult | Promise<TResult>,
    ...args: TArgs
  ): Promise<TResult> {
    const out = fn(...args);
    const result = out instanceof Promise ? await out : out;
    if (fn.name === 'clickSkywardNavLink' && /sfhome\d*\.w/i.test(this._url)) {
      this._url = 'https://skyward.example.test/scripts/wsisa.dll/WService=x/sfgradebook001.w';
      document.body.innerHTML = buildM402SkywardGradebookHtml();
      this.attachGradebookDialogHooks();
      this.navigatedToGradebook.value = true;
    }
    return result;
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

/**
 * Two courses; their grade cells sit in the opposite order to the course list.
 * Clicking a cell loads its course into ONE reused #gradeInfoDialog after a
 * tick, as Skyward's AJAX dialog does. `silentCni` never loads a dialog.
 */
function mountGradebook(opts: { silentCni?: string; extraCourse?: boolean } = {}): void {
  document.body.innerHTML = buildM402SkywardGradebookHtml({ extraCourse: opts.extraCourse });

  const wrap = document.querySelector('.sf_DialogWrap') as HTMLElement;
  wrap.querySelector('.sf_DialogClose')!.addEventListener('click', () => {
    wrap.style.display = 'none';
  });
  for (const cell of Array.from(document.querySelectorAll('a#showGradeInfo'))) {
    cell.addEventListener('click', () => {
      const cni = cell.getAttribute('data-cni')!;
      if (cni === opts.silentCni) return;
      setTimeout(() => {
        document.querySelector('#gradeInfoDialog')!.innerHTML =
          '<table><tr><th>Due</th><th>Assignment</th><th>Grade</th><th>Score(%)</th>' +
          `<th>Points Score</th><th>Missing</th></tr>${FAKE_PORTAL_SKYWARD_ASSIGNMENTS[cni] ?? ''}</table>`;
        wrap.style.display = 'block';
      }, 0);
    });
  }
}

describe('runSkywardRecipe (gradebook)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('matches grades to courses by section id, not row order', async () => {
    mountGradebook();
    const extract = await runSkywardRecipe(new DomPageDriver(), 'https://skyward.example.test');
    const byName = Object.fromEntries(extract.courses.map((c) => [c.name, c]));
    expect(byName['Algebra I']!.grades).toEqual({ '1ST': '95' });
    expect(byName['Algebra I']!.currentGrade).toBe('95');
    expect(byName['Biology']!.grades).toEqual({ '1ST': '88', PR2: '91' });
    expect(byName['Biology']!.currentGrade).toBe('91');
  });

  it('clicks each course grade cell and files each dialog under its own course', async () => {
    mountGradebook();
    const driver = new DomPageDriver();
    const extract = await runSkywardRecipe(driver, 'https://skyward.example.test');
    expect(extract.assignments.map((a) => [a.course, a.title, a.category])).toEqual([
      ['Algebra I', 'Quiz 1', ''],
      ['Biology', 'Lab 1', 'Major'],
    ]);
    expect(extract.assignments[0]).toMatchObject({
      pointsEarned: '19',
      pointsPossible: '20',
      status: 'graded',
    });
    expect(driver.evaluated.filter((n) => n === 'openSkywardGradeInfo')).toHaveLength(2);
  });

  it('skips a course whose dialog never loads, without copying the previous course', async () => {
    mountGradebook({ silentCni: '333', extraCourse: true });
    const extract = await runSkywardRecipe(new DomPageDriver(), 'https://skyward.example.test');
    expect(extract.assignments.map((a) => a.course)).toEqual(['Algebra I', 'Biology']);
    const art = extract.courses.find((c) => c.name === 'Art');
    expect(art?.grades).toEqual({ '1ST': '100' });
  });

  it('loads gradebook from home by clicking the Gradebook nav link (nested label)', async () => {
    document.body.innerHTML = buildM402SkywardHomeHtml();
    const driver = new HomeThenGradebookDriver();
    const extract = await runSkywardRecipe(driver, 'https://skyward.example.test');
    expect(driver.navigatedToGradebook.value).toBe(true);
    expect(driver.url()).toContain('sfgradebook');
    expect(extract.courses).toHaveLength(2);
    expect(extract.assignments.length).toBeGreaterThan(0);
  });
});

describe('grade dialog page functions', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('a closed dialog is marked read: not ready and not extracted again', () => {
    document.body.innerHTML =
      '<div class="sf_DialogWrap"><a title="Close" href="#">x</a><div id="gradeInfoDialog">' +
      `<table><tr><th>Due</th><th>Assignment</th></tr>${FAKE_PORTAL_SKYWARD_ASSIGNMENTS['111']}</table></div></div>`;
    expect(isSkywardGradeInfoReady(SKYWARD_SELECTORS_V1)).toBe(true);
    expect(
      extractSkywardCourseAssignments({
        selectors: SKYWARD_SELECTORS_V1,
        courseName: 'A',
        coursePeriod: '1',
      })
    ).toHaveLength(1);
    expect(closeSkywardDialogs(SKYWARD_SELECTORS_V1)).toBe(1);
    expect(isSkywardGradeInfoReady(SKYWARD_SELECTORS_V1)).toBe(false);
    expect(
      extractSkywardCourseAssignments({
        selectors: SKYWARD_SELECTORS_V1,
        courseName: 'B',
        coursePeriod: '2',
      })
    ).toEqual([]);
  });
});

describe('parseSkywardGradeCells', () => {
  it('keys grades by section id and the page’s own period literals', () => {
    const html =
      '<a id="showGradeInfo" data-cni="9" data-lit="T1">90</a>' +
      '<a data-lit="T2" class="x" id="showGradeInfo" data-cni="9">&nbsp;85&nbsp;</a>' +
      '<a id="showGradeInfo" data-cni="9" data-lit="T3">X</a>' +
      '<a id="showGradeInfo" data-cni="9" data-lit="T4"></a>' +
      '<a id="other" data-cni="9" data-lit="T5">70</a>';
    expect(parseSkywardGradeCells(html)).toEqual(new Map([['9', { T1: '90', T2: '85' }]]));
  });
});

describe('pickSkywardCurrentGrade', () => {
  it.each([
    [{ '1ST': '80', '2ND': '85', SM1: '83', '3RD': '90', '4TH': '99' }, '99'],
    [{ '1ST': '80', PR2: '82' }, '82'],
    [{ PR3: '77', '2ND': '85', SM1: '83' }, '77'],
    [{ T1: '90', T2: '85', SM1: '88', FIN: '87' }, '85'],
    [{ SM1: '88' }, '?'],
    [{}, '?'],
  ])('%j → %s', (grades, expected) => {
    expect(pickSkywardCurrentGrade(grades)).toBe(expected);
  });
});
