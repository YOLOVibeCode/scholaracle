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
    // Let the page's async dialog load run.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  onNewPage(): void {}
}

const ASSIGNMENTS: Record<string, string> = {
  '111':
    '<tr><td>09/02/2026</td><td>Quiz 1</td><td>95</td><td>95.00</td><td>19 out of 20</td><td></td></tr>',
  '222':
    '<tr><td>Major weighted at 60.00%</td></tr>' +
    '<tr><td>09/03/2026</td><td>Lab 1</td><td>91</td><td>91.00</td><td>91 out of 100</td><td></td></tr>',
};

function courseTable(sectionId: string, name: string, period: string): string {
  return (
    `<table id="classDesc_${sectionId}"><tr><td class="bld classDesc"><a href="#">${name}</a></td></tr>` +
    `<tr><td><label>Period</label> ${period} (8:00 AM - 8:50 AM)</td></tr></table>`
  );
}

/**
 * Two courses; their grade cells sit in the opposite order to the course list.
 * Clicking a cell loads its course into ONE reused #gradeInfoDialog after a
 * tick, as Skyward's AJAX dialog does. `silentCni` never loads a dialog.
 */
function mountGradebook(opts: { silentCni?: string; extraCourse?: boolean } = {}): void {
  document.body.innerHTML =
    `<nav><a href="#">Gradebook</a><a href="#">Attendance</a><a href="#">Schedule</a></nav>${courseTable(
      '1_111_0_0',
      'Algebra I',
      '1'
    )}${courseTable('1_222_0_0', 'Biology', '2')}${
      opts.extraCourse ? courseTable('1_333_0_0', 'Art', '3') : ''
    }<table id="grid_stuGradesGrid">` +
    '<tr><td><a id="showGradeInfo" data-cni="222" data-lit="1ST" href="#">88</a></td>' +
    '<td><a id="showGradeInfo" data-lit="PR2" data-cni="222" href="#"><span>91</span></a></td></tr>' +
    '<tr><td><a id="showGradeInfo" data-cni="111" data-lit="1ST" href="#">95</a></td>' +
    `<td><a id="showGradeInfo" data-cni="111" data-lit="PR2" href="#">X</a></td></tr>${
      opts.extraCourse
        ? '<tr><td><a id="showGradeInfo" data-cni="333" data-lit="1ST" href="#">100</a></td></tr>'
        : ''
    }</table>` +
    '<div class="sf_DialogWrap" style="display:none"><a class="sf_DialogClose" href="#">x</a>' +
    '<div id="gradeInfoDialog"></div></div>';

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
          `<th>Points Score</th><th>Missing</th></tr>${ASSIGNMENTS[cni] ?? ''}</table>`;
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
});

describe('grade dialog page functions', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('a closed dialog is marked read: not ready and not extracted again', () => {
    document.body.innerHTML =
      '<div class="sf_DialogWrap"><a title="Close" href="#">x</a><div id="gradeInfoDialog">' +
      `<table><tr><th>Due</th><th>Assignment</th></tr>${ASSIGNMENTS['111']}</table></div></div>`;
    expect(isSkywardGradeInfoReady()).toBe(true);
    expect(extractSkywardCourseAssignments({ courseName: 'A', coursePeriod: '1' })).toHaveLength(1);
    expect(closeSkywardDialogs()).toBe(1);
    expect(isSkywardGradeInfoReady()).toBe(false);
    expect(extractSkywardCourseAssignments({ courseName: 'B', coursePeriod: '2' })).toEqual([]);
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
