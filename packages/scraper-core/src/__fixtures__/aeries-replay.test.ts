/**
 * @jest-environment jsdom
 *
 * Golden replay: entity counts from synthetic fixtures vs replay.counts.json.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { runAeriesRecipe } from '../recipes/aeries-recipe';
import { countAeriesExtract } from './countExtracts';
import { JsdomFixtureReplayDriver } from './jsdomFixtureReplayDriver';
import { loadFixture } from './loadFixture';

const ROOT = 'https://district.example.test/student/';
const EXPECTED = JSON.parse(
  readFileSync(join(__dirname, 'aeries', 'replay.counts.json'), 'utf8')
) as ReturnType<typeof countAeriesExtract>;

function buildAeriesFixtures(): Record<string, string> {
  return {
    [`${ROOT}Dashboard.aspx`]: loadFixture('aeries/dashboard.html'),
    [`${ROOT}Classes.aspx`]: loadFixture('aeries/classes.html'),
    [`${ROOT}Attendance.aspx`]: loadFixture('aeries/attendance.html'),
    [`${ROOT}Widgets/ClassSummary/RedirectToGradebook?GradebookNumber=111&Term=FQT2&CDS=1&SC=5`]:
      loadFixture('aeries/gradebook-111.html'),
    [`${ROOT}Widgets/ClassSummary/RedirectToGradebook?GradebookNumber=222&Term=FQT2&CDS=1&SC=5`]:
      loadFixture('aeries/gradebook-222.html'),
  };
}

describe('aeries fixture replay (counts)', () => {
  it('matches golden entity counts', async () => {
    const driver = new JsdomFixtureReplayDriver({
      fixtures: buildAeriesFixtures(),
      initialUrl: `${ROOT}Dashboard.aspx`,
    });
    const extract = await runAeriesRecipe(driver, ROOT);
    expect(countAeriesExtract(extract)).toEqual(EXPECTED);
  });

  it('fails attendance count when the attendance grid selector breaks', async () => {
    let html = loadFixture('aeries/attendance.html');
    html = html.replace('tblNewFlex', 'tblNewFlexBroken');
    const driver = new JsdomFixtureReplayDriver({
      fixtures: {
        ...buildAeriesFixtures(),
        [`${ROOT}Attendance.aspx`]: html,
      },
      initialUrl: `${ROOT}Dashboard.aspx`,
    });
    const extract = await runAeriesRecipe(driver, ROOT);
    expect(() => {
      expect(countAeriesExtract(extract)).toEqual(EXPECTED);
    }).toThrow();
    expect(countAeriesExtract(extract).attendanceCount).toBe(0);
  }, 25000);
});
