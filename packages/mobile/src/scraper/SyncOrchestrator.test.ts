/**
 * SyncOrchestrator unit tests — stub IScraperResolver (ISP). Package-level
 * mocks of runCanvasRecipe cannot reach runClientScrape's internal imports.
 */

import type { ISlcDeltaOp } from '@scholaracle/contracts';
import {
  FakePageDriver,
  type IScraperResolver,
  type IScraperModule,
} from '@scholaracle/scraper-core';
import { runSyncPipeline, SyncError } from './SyncOrchestrator';
import type { IEnvelopeUploader, IRunRecorder } from '../api/interfaces';

const NOW = '2026-01-15T10:00:00.000Z';

function courseOp(): ISlcDeltaOp {
  return {
    op: 'upsert',
    entity: 'course',
    key: {
      provider: 'canvas',
      adapterId: 'com.instructure.canvas',
      studentExternalId: 'stu-1',
      institutionExternalId: 'school.instructure.com',
      externalId: 'canvas-course-101',
    },
    observedAt: NOW,
    record: { title: 'Algebra 1', teacherName: 'Chang', period: '4' },
  };
}

function stubResolver(opts: {
  scrape?: () => Promise<Record<string, unknown>>;
  transform?: () => ISlcDeltaOp[];
}): IScraperResolver {
  const module: IScraperModule = {
    metadata: {
      id: 'canvas',
      name: 'Canvas',
      adapterId: 'com.instructure.canvas',
      version: '0.1.0',
      hosts: ['*.instructure.com'],
      entities: ['course'],
      entry: 'builtin:canvas',
      publisher: 'scholaracle',
    },
    scrape: opts.scrape ?? (async () => ({ user: 'Test Student', courses: [], timestamp: NOW })),
    transform: opts.transform ?? (() => [courseOp()]),
  };
  return {
    async resolve() {
      return { module, canRun: true, checkErrors: [] };
    },
  };
}

describe('runSyncPipeline', () => {
  const config = {
    provider: 'canvas' as const,
    adapterId: 'com.instructure.canvas',
    baseUrl: 'https://school.instructure.com',
    studentExternalId: 'stu-1',
    institutionExternalId: 'school.instructure.com',
    sourceId: 'src-1',
    adapterVersion: '0.1.0',
  };

  function makeRecorder(): IRunRecorder & { starts: number; fails: number; successes: number } {
    const r = {
      starts: 0,
      fails: 0,
      successes: 0,
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

  function makeUploader(failUpload = false): IEnvelopeUploader {
    return {
      uploadEnvelope: jest.fn(async () => {
        if (failUpload) throw new Error('Upload failed');
      }),
      reportRunFailure: jest.fn(async () => undefined),
    };
  }

  it('should complete a happy-path canvas sync', async () => {
    const recorder = makeRecorder();
    const uploader = makeUploader();
    const driver = new FakePageDriver({ initialUrl: config.baseUrl });
    await runSyncPipeline(driver, config, uploader, 'token', recorder, undefined, {
      resolver: stubResolver({}),
    });
    expect(recorder.starts).toBe(1);
    expect(recorder.successes).toBe(1);
    expect(uploader.uploadEnvelope).toHaveBeenCalled();
  });

  it('should record failure when upload throws', async () => {
    const recorder = makeRecorder();
    const uploader = makeUploader(true);
    const driver = new FakePageDriver({ initialUrl: config.baseUrl });
    await expect(
      runSyncPipeline(driver, config, uploader, 'token', recorder, undefined, {
        resolver: stubResolver({}),
      })
    ).rejects.toThrow(/Upload failed/);
    expect(recorder.fails).toBe(1);
  });

  it('should record failure when validation fails', async () => {
    const recorder = makeRecorder();
    const uploader = makeUploader();
    const driver = new FakePageDriver({ initialUrl: config.baseUrl });
    await expect(
      runSyncPipeline(driver, config, uploader, 'token', recorder, undefined, {
        resolver: stubResolver({
          transform: () => [
            {
              op: 'upsert',
              entity: 'assignment',
              key: {
                provider: 'canvas',
                adapterId: 'com.instructure.canvas',
                externalId: 'bad',
              },
              observedAt: NOW,
              record: {},
            },
          ],
        }),
      })
    ).rejects.toThrow(/validation failed/);
    expect(recorder.fails).toBe(1);
  });

  describe('SyncError phases', () => {
    async function captureError(
      uploader: IEnvelopeUploader,
      recorder: IRunRecorder,
      resolver: IScraperResolver
    ): Promise<unknown> {
      const driver = new FakePageDriver({ initialUrl: config.baseUrl });
      return runSyncPipeline(driver, config, uploader, 'token', recorder, undefined, {
        resolver,
      }).then(
        () => {
          throw new Error('expected pipeline to reject');
        },
        (err: unknown) => err
      );
    }

    it('should tag scrape failures as phase "portal" and preserve the cause', async () => {
      const underlying = new Error('portal timed out');
      const err = await captureError(
        makeUploader(),
        makeRecorder(),
        stubResolver({
          scrape: async () => {
            throw underlying;
          },
        })
      );
      expect(err).toBeInstanceOf(SyncError);
      expect((err as SyncError).phase).toBe('portal');
      expect((err as SyncError).message).toBe('portal timed out');
      expect((err as SyncError).cause).toBe(underlying);
    });

    it('should tag transform failures as phase "local" and preserve the cause', async () => {
      const underlying = new Error('bad extract shape');
      const err = await captureError(
        makeUploader(),
        makeRecorder(),
        stubResolver({
          transform: () => {
            throw underlying;
          },
        })
      );
      expect(err).toBeInstanceOf(SyncError);
      expect((err as SyncError).phase).toBe('local');
      expect((err as SyncError).message).toBe('bad extract shape');
      expect((err as SyncError).cause).toBe(underlying);
    });

    it('should tag validation failures as phase "local"', async () => {
      const err = await captureError(
        makeUploader(),
        makeRecorder(),
        stubResolver({
          transform: () => [
            {
              op: 'upsert',
              entity: 'assignment',
              key: {
                provider: 'canvas',
                adapterId: 'com.instructure.canvas',
                externalId: 'bad',
              },
              observedAt: NOW,
              record: {},
            },
          ],
        })
      );
      expect(err).toBeInstanceOf(SyncError);
      expect((err as SyncError).phase).toBe('local');
      expect((err as SyncError).message).toMatch(/validation failed/);
    });

    it('should tag upload failures as phase "upload" and preserve the cause', async () => {
      const underlying = new Error('HTTP 503');
      const uploader: IEnvelopeUploader = {
        uploadEnvelope: jest.fn(async () => {
          throw underlying;
        }),
        reportRunFailure: jest.fn(async () => undefined),
      };
      const err = await captureError(uploader, makeRecorder(), stubResolver({}));
      expect(err).toBeInstanceOf(SyncError);
      expect((err as SyncError).phase).toBe('upload');
      expect((err as SyncError).message).toBe('HTTP 503');
      expect((err as SyncError).cause).toBe(underlying);
    });
  });

  it('should resolve addPhase before the next pipeline step runs', async () => {
    const events: string[] = [];
    const recorder: IRunRecorder = {
      startRun: jest.fn(async () => {
        events.push('startRun');
      }),
      addPhase: jest.fn(async (_runId: string, phase: { phase: string }) => {
        await new Promise((resolve) => setTimeout(resolve, 2));
        events.push(`addPhase:${phase.phase}`);
      }),
      completeRun: jest.fn(async (_runId, result) => {
        events.push(`completeRun:${result.status}`);
      }),
    };
    const uploader: IEnvelopeUploader = {
      uploadEnvelope: jest.fn(async () => {
        events.push('uploadEnvelope');
      }),
      reportRunFailure: jest.fn(async () => undefined),
    };
    const driver = new FakePageDriver({ initialUrl: config.baseUrl });
    await runSyncPipeline(driver, config, uploader, 'token', recorder, undefined, {
      resolver: stubResolver({}),
    });
    expect(events).toEqual([
      'startRun',
      'addPhase:extracting',
      'addPhase:transforming',
      'addPhase:transforming',
      'addPhase:transforming',
      'addPhase:validating',
      'addPhase:uploading',
      'uploadEnvelope',
      'completeRun:success',
      'addPhase:complete',
    ]);
  });
});
