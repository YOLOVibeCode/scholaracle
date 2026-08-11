/**
 * SyncOrchestrator unit tests — FakePageDriver + mocked ISP slices.
 */

import { FakePageDriver } from '@scholaracle/scraper-core';
import { runSyncPipeline, SyncError } from './SyncOrchestrator';
import type { IEnvelopeUploader, IRunRecorder } from '../api/interfaces';

jest.mock('@scholaracle/scraper-core', () => {
  const actual = jest.requireActual('@scholaracle/scraper-core');
  return {
    ...actual,
    runCanvasRecipe: jest.fn().mockResolvedValue({
      user: 'Test Student',
      courses: [],
      toDoItems: [],
      upcomingEvents: [],
      announcements: [],
      timestamp: new Date().toISOString(),
    }),
    transformCanvasExtract: jest.fn().mockReturnValue([]),
    validateEnvelope: jest.fn().mockReturnValue({ passed: true, errorCount: 0, warnings: [] }),
  };
});

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
    await runSyncPipeline(driver, config, uploader, 'token', recorder);
    expect(recorder.starts).toBe(1);
    expect(recorder.successes).toBe(1);
    expect(uploader.uploadEnvelope).toHaveBeenCalled();
  });

  it('should record failure when upload throws', async () => {
    const recorder = makeRecorder();
    const uploader = makeUploader(true);
    const driver = new FakePageDriver({ initialUrl: config.baseUrl });
    await expect(runSyncPipeline(driver, config, uploader, 'token', recorder)).rejects.toThrow(
      /Upload failed/
    );
    expect(recorder.fails).toBe(1);
  });

  it('should record failure and report when validation fails', async () => {
    const { validateEnvelope } = require('@scholaracle/scraper-core');
    validateEnvelope.mockReturnValueOnce({ passed: false, errorCount: 2, warnings: [] });
    const recorder = makeRecorder();
    const uploader = makeUploader();
    const driver = new FakePageDriver({ initialUrl: config.baseUrl });
    await expect(runSyncPipeline(driver, config, uploader, 'token', recorder)).rejects.toThrow(
      /validation failed/
    );
    expect(recorder.fails).toBe(1);
    expect(uploader.reportRunFailure).toHaveBeenCalled();
  });

  describe('SyncError phases', () => {
    async function captureError(
      uploader: IEnvelopeUploader,
      recorder: IRunRecorder
    ): Promise<unknown> {
      const driver = new FakePageDriver({ initialUrl: config.baseUrl });
      return runSyncPipeline(driver, config, uploader, 'token', recorder).then(
        () => {
          throw new Error('expected pipeline to reject');
        },
        (err: unknown) => err
      );
    }

    it('should tag scrape failures as phase "portal" and preserve the cause', async () => {
      const { runCanvasRecipe } = require('@scholaracle/scraper-core');
      const underlying = new Error('portal timed out');
      runCanvasRecipe.mockRejectedValueOnce(underlying);
      const err = await captureError(makeUploader(), makeRecorder());
      expect(err).toBeInstanceOf(SyncError);
      expect((err as SyncError).phase).toBe('portal');
      expect((err as SyncError).message).toBe('portal timed out');
      expect((err as SyncError).cause).toBe(underlying);
    });

    it('should tag transform failures as phase "local" and preserve the cause', async () => {
      const { transformCanvasExtract } = require('@scholaracle/scraper-core');
      const underlying = new Error('bad extract shape');
      transformCanvasExtract.mockImplementationOnce(() => {
        throw underlying;
      });
      const err = await captureError(makeUploader(), makeRecorder());
      expect(err).toBeInstanceOf(SyncError);
      expect((err as SyncError).phase).toBe('local');
      expect((err as SyncError).message).toBe('bad extract shape');
      expect((err as SyncError).cause).toBe(underlying);
    });

    it('should tag validation failures as phase "local"', async () => {
      const { validateEnvelope } = require('@scholaracle/scraper-core');
      validateEnvelope.mockReturnValueOnce({ passed: false, errorCount: 3, warnings: [] });
      const err = await captureError(makeUploader(), makeRecorder());
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
      const err = await captureError(uploader, makeRecorder());
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
        // Resolve on a later tick so an un-awaited addPhase would land
        // after the next pipeline step in the event log.
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
    await runSyncPipeline(driver, config, uploader, 'token', recorder);
    expect(events).toEqual([
      'startRun',
      'addPhase:extracting',
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
