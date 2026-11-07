/**
 * @jest-environment jsdom
 *
 * M4-08: broken assignment row class → gap → patch → replay passes on M4-02 substrate.
 */
import { runAeriesRecipe } from '../recipes/aeries-recipe';
import {
  FAKE_PORTAL_AERIES_EXPECTED,
  M402SimAeriesDriver,
  buildM402AeriesGradebook,
} from '../fixtures/fakePortalM402';
import { countAeriesExtract } from '../__fixtures__/countExtracts';
import { AERIES_SELECTORS_V1 } from '../selectors/aeriesV1';
import { mergeSelectorRecord } from '../selectors/mergeSelectorTables';
import { replaySelectorPatch } from './replaySelectorPatch';
import { computeRunCoverage } from '../pipeline/computeRunCoverage';
import { transformAeriesExtract } from '../transformers/aeries/aeries-transformer';

const ROOT = 'https://district.aeries.net/student/';

function brokenGradebookHtml(html: string): string {
  return html
    .replace(/\bTableView\b/g, 'TableViewBroken')
    .replace(/\bassignment-info\b/g, 'assignment-info-broken');
}

describe('fake portal selector patch M4-08', () => {
  const fixPatch = {
    gradebook_row_class_tableView: 'TableViewBroken',
    gradebook_row_class_assignment_info: 'assignment-info-broken',
  };

  it('broken row class yields zero assignments on fake portal driver', async () => {
    const driver = new M402SimAeriesDriver(ROOT, {
      gradebookHtmlForGn: (gn) => brokenGradebookHtml(buildM402AeriesGradebook(gn)),
    });
    const selectors = AERIES_SELECTORS_V1;
    const extract = await runAeriesRecipe(driver, ROOT, { selectors });
    const ann = extract.students.find((s) => s.studentId === '728001');
    const assignmentTotal = ann?.courses.reduce((n, c) => n + c.assignments.length, 0) ?? 0;
    expect(assignmentTotal).toBe(0);
  });

  it('replay with fix patch meets M4-02 golden counts on broken substrate', async () => {
    const fail = await replaySelectorPatch({
      recipeId: 'aeries',
      step: 'aeries.gradebook.assignments',
      selectorPatch: {},
      mutateGradebookHtml: brokenGradebookHtml,
    });
    expect(fail.ok).toBe(false);

    const pass = await replaySelectorPatch({
      recipeId: 'aeries',
      step: 'aeries.gradebook.assignments',
      selectorPatch: fixPatch,
      mutateGradebookHtml: brokenGradebookHtml,
    });
    expect(pass.ok).toBe(true);
  });

  it('served patch completes sync without assignment gap on fake portal', async () => {
    const driver = new M402SimAeriesDriver(ROOT, {
      gradebookHtmlForGn: (gn) => brokenGradebookHtml(buildM402AeriesGradebook(gn)),
    });
    const selectors = mergeSelectorRecord(AERIES_SELECTORS_V1, fixPatch);
    const extract = await runAeriesRecipe(driver, ROOT, { selectors });
    const ops = transformAeriesExtract(extract, {
      provider: 'aeries',
      adapterId: 'aeries',
      institutionExternalId: 'district.aeries.net',
      studentExternalId: '728001',
    });
    const coverage = computeRunCoverage(ops);
    const assignmentGaps = coverage.students.flatMap((s) =>
      s.gaps.filter((g) => g.kind === 'no_assignments' || g.kind === 'no_grade_no_assignments')
    );
    expect(assignmentGaps).toHaveLength(0);
    expect(countAeriesExtract(extract).assignmentCount).toBe(
      FAKE_PORTAL_AERIES_EXPECTED.ann.totalAssignments +
        FAKE_PORTAL_AERIES_EXPECTED.ben.totalAssignments
    );
  });
});
