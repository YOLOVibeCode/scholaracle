import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IAeriesReplayCounts } from '../__fixtures__/countExtracts';

const AERIES_ROOT = 'https://district.aeries.net/student/';

function fixtureRoot(): string {
  const adjacent = join(__dirname, '..', '__fixtures__');
  if (existsSync(join(adjacent, 'aeries', 'dashboard.html'))) {
    return adjacent;
  }
  return join(__dirname, '..', '..', 'src', '__fixtures__');
}

function readAeriesFixture(name: string): string {
  return readFileSync(join(fixtureRoot(), 'aeries', name), 'utf8');
}

function aeriesReplayFixtures(): Record<string, string> {
  return {
    [`${AERIES_ROOT}Dashboard.aspx`]: readAeriesFixture('dashboard.html'),
    [`${AERIES_ROOT}Classes.aspx`]: readAeriesFixture('classes.html'),
    [`${AERIES_ROOT}Attendance.aspx`]: readAeriesFixture('attendance.html'),
    [`${AERIES_ROOT}Widgets/ClassSummary/RedirectToGradebook?GradebookNumber=111&Term=FQT2&CDS=1&SC=5`]:
      readAeriesFixture('gradebook-111.html'),
    [`${AERIES_ROOT}Widgets/ClassSummary/RedirectToGradebook?GradebookNumber=222&Term=FQT2&CDS=1&SC=5`]:
      readAeriesFixture('gradebook-222.html'),
  };
}

/**
 * Step-keyed jsdom replay substrate (M4-02 fixtures). Skeleton hash is logged only.
 */
export function replaySubstrateForStep(
  recipeId: string,
  step: string,
  mutateGradebookHtml?: (html: string) => string
): { readonly baseUrl: string; readonly fixtures: Record<string, string> } | null {
  if (recipeId !== 'aeries') return null;
  if (step === 'aeries.gradebook.assignments' || step === 'aeries.extract') {
    let fixtures = aeriesReplayFixtures();
    if (mutateGradebookHtml) {
      const next = { ...fixtures };
      for (const key of Object.keys(next)) {
        if (key.includes('RedirectToGradebook')) {
          next[key] = mutateGradebookHtml(next[key] ?? '');
        }
      }
      fixtures = next;
    }
    return { baseUrl: AERIES_ROOT, fixtures };
  }
  return null;
}

export function loadAeriesReplayCountStandard(): IAeriesReplayCounts {
  const raw = readFileSync(join(fixtureRoot(), 'aeries', 'replay.counts.json'), 'utf8');
  return JSON.parse(raw) as IAeriesReplayCounts;
}
