/**
 * @jest-environment jsdom
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { runCanvasRecipe } from '../recipes/canvas-recipe';
import { countCanvasExtract } from './countExtracts';
import { JsdomFixtureReplayDriver } from './jsdomFixtureReplayDriver';
import { loadFixture } from './loadFixture';

const BASE = 'https://canvas.example.test';
const COURSE_API = `${BASE}/courses/10`;
const EXPECTED = JSON.parse(
  readFileSync(join(__dirname, 'canvas', 'replay.counts.json'), 'utf8')
) as ReturnType<typeof countCanvasExtract>;

function apiJson(name: string): unknown {
  return JSON.parse(loadFixture(join('canvas', 'api', name))) as unknown;
}

interface IFetchJsonResult {
  readonly ok: boolean;
  json(): Promise<unknown>;
}

function jsonResponse(data: unknown): IFetchJsonResult {
  return {
    ok: true,
    async json(): Promise<unknown> {
      return data;
    },
  };
}

class CanvasReplayDriver extends JsdomFixtureReplayDriver {
  override async sleep(_ms: number): Promise<void> {}
}

describe('canvas fixture replay (counts)', () => {
  let previousFetch: typeof fetch;

  beforeEach(() => {
    previousFetch = global.fetch;
    global.fetch = (async (input: RequestInfo | URL) => {
      const u = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const { pathname, search } = new URL(u, BASE);
      const map: Record<string, unknown> = {
        '/api/v1/courses': apiJson('courses.json'),
        '/api/v1/courses/10/assignments': apiJson('course-10-assignments.json'),
        '/api/v1/courses/10/users': apiJson('course-10-users.json'),
        '/api/v1/courses/10/modules': apiJson('course-10-modules.json'),
        '/api/v1/courses/10/files': apiJson('course-10-files.json'),
      };
      if (pathname === '/api/v1/courses' && search.includes('enrollment_state')) {
        return jsonResponse(map['/api/v1/courses']);
      }
      if (pathname === '/api/v1/announcements') {
        return jsonResponse(apiJson('announcements.json'));
      }
      const body = map[pathname];
      if (body === undefined) {
        return {
          ok: false,
          async json(): Promise<unknown> {
            return [];
          },
        };
      }
      return jsonResponse(body);
    }) as typeof fetch;
  });

  afterEach(() => {
    global.fetch = previousFetch;
  });

  it('matches golden entity counts', async () => {
    const driver = new CanvasReplayDriver({
      fixtures: {
        [BASE]: loadFixture('canvas/dashboard.html'),
        [COURSE_API]: '<html><body><main>course</main></body></html>',
      },
      initialUrl: BASE,
    });
    const extract = await runCanvasRecipe(driver, BASE);
    expect(countCanvasExtract(extract)).toEqual(EXPECTED);
  });

  it('fails assignment count when the course list API returns nothing', async () => {
    const driver = new CanvasReplayDriver({
      fixtures: {
        [BASE]: loadFixture('canvas/dashboard.html'),
      },
      initialUrl: BASE,
    });
    const prior = global.fetch;
    global.fetch = (async () => jsonResponse([])) as unknown as typeof fetch;
    const extract = await runCanvasRecipe(driver, BASE);
    global.fetch = prior;
    expect(() => {
      expect(countCanvasExtract(extract)).toEqual(EXPECTED);
    }).toThrow();
    expect(countCanvasExtract(extract).assignmentCount).toBe(0);
  });
});
