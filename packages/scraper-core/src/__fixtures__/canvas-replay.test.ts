/**
 * @jest-environment jsdom
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { runCanvasRecipe } from '../recipes/canvas-recipe';
import { transformCanvasExtract } from '../transformers/canvas/canvas-transformer';
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
      if (pathname === '/api/v1/planner/items') {
        return jsonResponse(apiJson('planner-items.json'));
      }
      if (pathname === '/api/v1/users/self/observees') {
        return jsonResponse(apiJson('observees.json'));
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

describe('canvas fixture replay (observer parent)', () => {
  let previousFetch: typeof fetch;

  beforeEach(() => {
    previousFetch = global.fetch;
    global.fetch = (async (input: RequestInfo | URL) => {
      const u = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const { pathname, search } = new URL(u, BASE);
      const map: Record<string, unknown> = {
        '/api/v1/courses': apiJson('courses-self-empty.json'),
        '/api/v1/courses/10/assignments': apiJson('course-10-assignments.json'),
        '/api/v1/courses/10/users': apiJson('course-10-users.json'),
        '/api/v1/courses/10/modules': apiJson('course-10-modules.json'),
        '/api/v1/courses/10/files': apiJson('course-10-files.json'),
        '/api/v1/users/42/courses': apiJson('courses-observee-student.json'),
      };
      if (pathname === '/api/v1/courses' && search.includes('enrollment_state')) {
        return jsonResponse(map['/api/v1/courses']);
      }
      if (pathname === '/api/v1/planner/items') {
        return jsonResponse(apiJson('planner-items.json'));
      }
      if (pathname === '/api/v1/users/self/observees') {
        return jsonResponse(apiJson('observees-one.json'));
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

  it('includes observee student courses when self list is empty', async () => {
    const driver = new CanvasReplayDriver({
      fixtures: {
        [BASE]: loadFixture('canvas/dashboard.html'),
        [COURSE_API]: '<html><body><main>course</main></body></html>',
      },
      initialUrl: BASE,
    });
    const extract = await runCanvasRecipe(driver, BASE);
    expect(extract.courses.length).toBeGreaterThan(0);
    expect(countCanvasExtract(extract)).toEqual(EXPECTED);
  });
});

describe('canvas fixture replay (the status each assignment is recorded with)', () => {
  /** What Canvas's API sends for the student's own submission: one assignment for each state. */
  const ASSIGNMENTS = [
    {
      id: 1,
      name: 'Not handed in yet',
      due_at: '2026-09-20T23:59:59Z',
      submission: { missing: false, late: false, workflow_state: 'unsubmitted' },
    },
    {
      id: 2,
      name: 'Handed in',
      due_at: '2026-09-20T23:59:59Z',
      submission: { missing: false, late: false, workflow_state: 'submitted' },
    },
    {
      id: 3,
      name: 'Handed in, waiting for the teacher to mark it',
      due_at: '2026-09-20T23:59:59Z',
      submission: { missing: false, late: false, workflow_state: 'pending_review' },
    },
    {
      id: 4,
      name: 'Graded',
      due_at: '2026-09-04T23:59:59Z',
      submission: { missing: false, late: false, workflow_state: 'graded' },
    },
    {
      id: 5,
      name: 'Past due and not handed in',
      due_at: '2026-09-10T23:59:59Z',
      submission: { missing: true, late: false, workflow_state: 'unsubmitted' },
    },
    {
      id: 6,
      name: 'Handed in after the deadline',
      due_at: '2026-09-10T23:59:59Z',
      submission: { missing: false, late: true, workflow_state: 'submitted' },
    },
    { id: 7, name: 'Nothing to hand in', due_at: '2026-09-20T23:59:59Z' },
  ];

  let previousFetch: typeof fetch;

  beforeEach(() => {
    previousFetch = global.fetch;
    const routes: Record<string, unknown> = {
      '/api/v1/courses': apiJson('courses.json'),
      '/api/v1/courses/10/assignments': ASSIGNMENTS,
      '/api/v1/courses/10/users': apiJson('course-10-users.json'),
      '/api/v1/courses/10/modules': apiJson('course-10-modules.json'),
      '/api/v1/courses/10/files': apiJson('course-10-files.json'),
      '/api/v1/planner/items': apiJson('planner-items.json'),
      '/api/v1/users/self/observees': apiJson('observees.json'),
      '/api/v1/announcements': apiJson('announcements.json'),
    };
    global.fetch = (async (input: RequestInfo | URL) => {
      const u = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const body = routes[new URL(u, BASE).pathname];
      return body === undefined ? { ok: false, json: async () => [] } : jsonResponse(body);
    }) as typeof fetch;
  });

  afterEach(() => {
    global.fetch = previousFetch;
  });

  it('records work that is not handed in yet as not started, and handed-in work as submitted', async () => {
    const driver = new CanvasReplayDriver({
      fixtures: {
        [BASE]: loadFixture('canvas/dashboard.html'),
        [COURSE_API]: '<html><body><main>course</main></body></html>',
      },
      initialUrl: BASE,
    });

    const extract = await runCanvasRecipe(driver, BASE);
    const ops = transformCanvasExtract(extract, {
      provider: 'canvas',
      adapterId: 'com.instructure.canvas',
      studentExternalId: 'stu-emma',
      institutionExternalId: 'inst-test',
    });

    const recorded = ops
      .filter((op) => op.key.externalId.startsWith('canvas-assignment-'))
      .map((op) => [op.record?.['title'], op.record?.['status']]);
    expect(recorded).toEqual([
      // Canvas calls this "unsubmitted". The word holds the letters of "submitted" and was
      // read as that, so all the work still to do was recorded as turned in.
      ['Not handed in yet', 'not_started'],
      ['Handed in', 'submitted'],
      ['Handed in, waiting for the teacher to mark it', 'submitted'],
      ['Graded', 'graded'],
      ['Past due and not handed in', 'missing'],
      ['Handed in after the deadline', 'late'],
      ['Nothing to hand in', undefined],
    ]);
  });
});
