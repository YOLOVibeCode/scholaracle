/**
 * SyncOrchestrator unit tests — FakePageDriver + mocked ISP slices.
 */

import { FakePageDriver } from '@scholaracle/scraper-core';
import { runSyncPipeline } from './SyncOrchestrator';
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
});
