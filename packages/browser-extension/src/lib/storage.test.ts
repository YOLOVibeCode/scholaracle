/**
 * Extension storage tests (chrome mock).
 */

import { resetChromeMock } from '../test/chrome-mock';
import {
  setConfig,
  getConfig,
  upsertCredential,
  getCredentials,
  appendRun,
  getRunLedger,
} from './storage';

describe('extension storage', () => {
  beforeEach(() => {
    resetChromeMock();
  });

  it('should round-trip config', async () => {
    await setConfig({
      connectorToken: 'tok',
      apiBaseUrl: 'https://api.example.com',
      scheduleHours: 6,
    });
    const cfg = await getConfig();
    expect(cfg?.connectorToken).toBe('tok');
    expect(cfg?.scheduleHours).toBe(6);
  });

  it('should upsert credentials by sourceId', async () => {
    await upsertCredential({
      provider: 'canvas',
      sourceId: 's1',
      studentExternalId: 'stu',
      institutionExternalId: 'inst',
      adapterId: 'com.instructure.canvas',
      baseUrl: 'https://a.instructure.com',
      adapterVersion: '0.1.0',
    });
    await upsertCredential({
      provider: 'canvas',
      sourceId: 's1',
      studentExternalId: 'stu',
      institutionExternalId: 'inst',
      adapterId: 'com.instructure.canvas',
      baseUrl: 'https://b.instructure.com',
      adapterVersion: '0.1.0',
    });
    const creds = await getCredentials();
    expect(creds).toHaveLength(1);
    expect(creds[0]?.baseUrl).toBe('https://b.instructure.com');
  });

  it('should cap run ledger at 30', async () => {
    for (let i = 0; i < 35; i++) {
      await appendRun({
        runId: `r-${i}`,
        provider: 'canvas',
        status: 'success',
        startedAt: new Date().toISOString(),
      });
    }
    expect(await getRunLedger()).toHaveLength(30);
  });
});
