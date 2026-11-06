/**
 * @jest-environment jsdom
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { runSkywardRecipe } from '../recipes/skyward-recipe';
import { countSkywardExtract } from './countExtracts';
import { loadFixture } from './loadFixture';
import { SkywardNavReplayDriver } from './skywardNavReplayDriver';

const BASE = 'https://skyward.example.test/home';
const EXPECTED = JSON.parse(
  readFileSync(join(__dirname, 'skyward', 'replay.counts.json'), 'utf8')
) as ReturnType<typeof countSkywardExtract>;

describe('skyward fixture replay (counts)', () => {
  it('matches golden entity counts', async () => {
    const driver = new SkywardNavReplayDriver({
      fixtures: {
        [BASE]: loadFixture('skyward/home-and-gradebook.html'),
        [`${BASE}#att`]: loadFixture('skyward/attendance.html'),
        [`${BASE}#sched`]: loadFixture('skyward/schedule.html'),
      },
      initialUrl: BASE,
      sectionUrls: {
        Attendance: `${BASE}#att`,
        Schedule: `${BASE}#sched`,
      },
    });
    const extract = await runSkywardRecipe(driver, BASE);
    expect(countSkywardExtract(extract)).toEqual(EXPECTED);
  });

  it('fails course count when class description table ids break', async () => {
    let html = loadFixture('skyward/home-and-gradebook.html');
    html = html.replace(/classDesc_1_111_0_0/g, 'classDesc_BROKEN_111');
    html = html.replace(/classDesc_1_222_0_0/g, 'classDesc_BROKEN_222');
    const driver = new SkywardNavReplayDriver({
      fixtures: {
        [BASE]: html,
        [`${BASE}#att`]: loadFixture('skyward/attendance.html'),
        [`${BASE}#sched`]: loadFixture('skyward/schedule.html'),
      },
      initialUrl: BASE,
      sectionUrls: {
        Attendance: `${BASE}#att`,
        Schedule: `${BASE}#sched`,
      },
    });
    const extract = await runSkywardRecipe(driver, BASE);
    expect(() => {
      expect(countSkywardExtract(extract)).toEqual(EXPECTED);
    }).toThrow();
    expect(countSkywardExtract(extract).courseCount).toBe(0);
  });
});
