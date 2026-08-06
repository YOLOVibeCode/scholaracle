/**
 * Companion E2E harness — FakePageDriver → real transform+validate → mock ingest.
 *
 * Does NOT mock validateEnvelope / transformCanvasExtract.
 * Stubs only the browser recipe (portal HTML) so the pipeline stays CI-safe.
 */

import type { ICanvasBrowserExtract } from '@scholaracle/scraper-core';
import { FakePageDriver, validateEnvelope } from '@scholaracle/scraper-core';
import { runSyncPipeline, type ISyncOrchestratorConfig } from './SyncOrchestrator';
import type { IEnvelopeUploader, IRunRecorder } from '../api/interfaces';

const REALISTIC_EXTRACT: ICanvasBrowserExtract = {
  user: 'Emma Lewis',
  timestamp: '2026-08-04T12:00:00.000Z',
  toDoItems: [],
  upcomingEvents: [],
  announcements: [
    {
      title: 'Welcome',
      course: 'Algebra I',
      date: '2026-08-01T09:00:00.000Z',
    },
  ],
  courses: [
    {
      id: '101',
      name: 'Algebra I',
      courseCode: 'ALG-1',
      url: 'https://school.instructure.com/courses/101',
      teachers: [{ id: 't1', name: 'Ms. Rivera' }],
      teacher: 'Ms. Rivera',
      grade: '92%',
      assignments: [
        {
          id: 'a1',
          name: 'Homework 1',
          dueDate: '2026-09-15T23:59:00.000Z',
          points: '10',
          status: 'graded',
        },
      ],
      modules: [],
      files: [
        {
          id: 'f1',
          name: 'Syllabus.pdf',
          url: 'https://school.instructure.com/files/1',
          contentType: 'application/pdf',
        },
      ],
    },
  ],
};

jest.mock('@scholaracle/scraper-core', () => {
  const actual = jest.requireActual(
    '@scholaracle/scraper-core'
  ) as typeof import('@scholaracle/scraper-core');
  return {
    ...actual,
    runCanvasRecipe: jest.fn(async () => REALISTIC_EXTRACT),
  };
});

describe('Companion E2E: FakePageDriver → validate → mock ingest', () => {
  const config: ISyncOrchestratorConfig = {
    provider: 'canvas',
    adapterId: 'com.instructure.canvas',
    baseUrl: 'https://school.instructure.com',
    studentExternalId: 'stu-emma',
    institutionExternalId: 'school.instructure.com',
    sourceId: 'src-canvas-1',
    adapterVersion: '0.1.0-test',
    coreVersion: '0.1.0',
  };

  function makeRecorder(): IRunRecorder & {
    readonly starts: number;
    readonly successes: number;
    readonly fails: number;
  } {
    const r = {
      starts: 0,
      successes: 0,
      fails: 0,
      startRun: jest.fn(async () => {
        r.starts += 1;
      }),
      addPhase: jest.fn(async () => undefined),
      completeRun: jest.fn(async (_id, result) => {
        if (result.status === 'failed') r.fails += 1;
        if (result.status === 'success') r.successes += 1;
      }),
    };
    return r;
  }

  function makeUploader(): IEnvelopeUploader & {
    readonly uploaded: unknown[];
  } {
    const uploaded: unknown[] = [];
    return {
      uploaded,
      uploadEnvelope: jest.fn(async (envelope) => {
        uploaded.push(envelope);
      }),
      reportRunFailure: jest.fn(async () => undefined),
    };
  }

  it('should produce a valid envelope and mock-ingest it', async () => {
    const recorder = makeRecorder();
    const uploader = makeUploader();
    const driver = new FakePageDriver({
      initialUrl: config.baseUrl,
      fixtures: {
        [config.baseUrl]: { html: '<html><body>dashboard</body></html>' },
      },
    });

    const phases: string[] = [];
    const envelope = await runSyncPipeline(
      driver,
      config,
      uploader,
      'connector-token-test',
      recorder,
      (p) => {
        phases.push(p.phase);
      }
    );

    // Real validator (not mocked)
    const report = validateEnvelope(envelope);
    expect(report.passed).toBe(true);
    expect(report.errorCount).toBe(0);
    expect(envelope.ops.length).toBeGreaterThan(0);
    expect(report.entityCounts['course']).toBeGreaterThanOrEqual(1);
    expect(report.entityCounts['assignment']).toBeGreaterThanOrEqual(1);

    expect(envelope.schemaVersion).toBe('slc.ingest.v1');
    expect(envelope.run.provider).toBe('canvas');
    expect(envelope.run.meta).toMatchObject({
      clientType: 'mobile',
      adapterVersion: '0.1.0-test',
    });
    expect(envelope.source.sourceId).toBe(config.sourceId);

    expect(uploader.uploadEnvelope).toHaveBeenCalledTimes(1);
    expect(uploader.uploadEnvelope).toHaveBeenCalledWith(envelope, 'connector-token-test');
    expect(uploader.uploaded).toHaveLength(1);
    expect(recorder.starts).toBe(1);
    expect(recorder.successes).toBe(1);
    expect(recorder.fails).toBe(0);
    expect(phases).toEqual(
      expect.arrayContaining(['extracting', 'transforming', 'validating', 'uploading', 'complete'])
    );
  });

  it('should fail validation (real validator) when transform yields bad ops', async () => {
    const scraperCore =
      require('@scholaracle/scraper-core') as typeof import('@scholaracle/scraper-core');
    (scraperCore.runCanvasRecipe as jest.Mock).mockResolvedValueOnce({
      user: 'Broken',
      courses: [
        {
          id: '',
          name: '', // empty title → transform may still emit; force empty course id path
          courseCode: '',
          url: 'https://school.instructure.com/courses/x',
          teachers: [],
          assignments: [
            { id: 'bad', name: '', dueDate: undefined, points: undefined, status: undefined },
          ],
          modules: [],
          files: [],
        },
      ],
      toDoItems: [],
      upcomingEvents: [],
      announcements: [],
      timestamp: '2026-08-04T12:00:00.000Z',
    } satisfies ICanvasBrowserExtract);

    // Spy transform to return explicitly invalid ops for this case
    const transformSpy = jest.spyOn(scraperCore, 'transformCanvasExtract').mockReturnValueOnce([
      {
        op: 'upsert',
        entity: 'course',
        key: {
          provider: 'canvas',
          adapterId: 'com.instructure.canvas',
          externalId: 'c-1',
        },
        observedAt: '2026-08-04T12:00:00.000Z',
        record: {}, // missing required title
      },
    ]);

    const recorder = makeRecorder();
    const uploader = makeUploader();
    const driver = new FakePageDriver({ initialUrl: config.baseUrl });

    await expect(runSyncPipeline(driver, config, uploader, 'token', recorder)).rejects.toThrow(
      /validation failed/
    );

    expect(recorder.fails).toBe(1);
    expect(uploader.uploadEnvelope).not.toHaveBeenCalled();
    expect(uploader.reportRunFailure).toHaveBeenCalled();
    transformSpy.mockRestore();
  });
});
