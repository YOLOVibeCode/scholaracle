/**
 * RunLedger tests — mutation serialization and corrupted-store fallback.
 * AsyncStorage is the in-memory mock from jest.setup.ts.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { RunLedger, type IRunPhase } from './RunLedger';

const LEDGER_KEY = 'slc_run_ledger';

function makePhase(i: number): IRunPhase {
  return {
    phase: `phase-${i}`,
    message: `message ${i}`,
    timestamp: new Date().toISOString(),
    durationMs: i,
  };
}

describe('RunLedger', () => {
  let ledger: RunLedger;

  beforeEach(async () => {
    await AsyncStorage.clear();
    ledger = new RunLedger();
  });

  it('should start and complete a run', async () => {
    await ledger.startRun({ runId: 'r1', provider: 'canvas', studentExternalId: 's1' });
    await ledger.completeRun('r1', { status: 'success', opCount: 7 });
    const [entry] = await ledger.getAll();
    expect(entry?.status).toBe('success');
    expect(entry?.opCount).toBe(7);
    expect(entry?.completedAt).toBeDefined();
  });

  it('should lose no phases across N concurrent addPhase calls', async () => {
    await ledger.startRun({ runId: 'r1', provider: 'canvas', studentExternalId: 's1' });
    const phaseCount = 12;
    await Promise.all(
      Array.from({ length: phaseCount }, (_, i) => ledger.addPhase('r1', makePhase(i)))
    );
    const [entry] = await ledger.getAll();
    expect(entry?.phases).toHaveLength(phaseCount);
    // Every phase made it, in enqueue order.
    expect(entry?.phases.map((p) => p.phase)).toEqual(
      Array.from({ length: phaseCount }, (_, i) => `phase-${i}`)
    );
  });

  it('should end success when completeRun races concurrent addPhase calls', async () => {
    await ledger.startRun({ runId: 'r1', provider: 'skyward', studentExternalId: 's1' });
    // Fire the phases and the completion without awaiting in between —
    // an interleaved read-modify-write used to resurrect in_progress.
    await Promise.all([
      ledger.addPhase('r1', makePhase(0)),
      ledger.addPhase('r1', makePhase(1)),
      ledger.addPhase('r1', makePhase(2)),
      ledger.completeRun('r1', { status: 'success', opCount: 3 }),
    ]);
    const [entry] = await ledger.getAll();
    expect(entry?.status).toBe('success');
    expect(entry?.phases).toHaveLength(3);
  });

  it('should not resurrect in_progress when addPhase lands after completeRun', async () => {
    await ledger.startRun({ runId: 'r1', provider: 'aeries', studentExternalId: 's1' });
    await ledger.completeRun('r1', { status: 'success', opCount: 1 });
    await ledger.addPhase('r1', makePhase(99));
    const [entry] = await ledger.getAll();
    expect(entry?.status).toBe('success');
    expect(entry?.phases).toHaveLength(1);
  });

  it('should serialize runs across different runIds too', async () => {
    await Promise.all([
      ledger.startRun({ runId: 'a', provider: 'canvas', studentExternalId: 's1' }),
      ledger.startRun({ runId: 'b', provider: 'skyward', studentExternalId: 's2' }),
    ]);
    const entries = await ledger.getAll();
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.runId).sort()).toEqual(['a', 'b']);
  });

  it('should return [] when the stored ledger is corrupted', async () => {
    await AsyncStorage.setItem(LEDGER_KEY, '{definitely not json[');
    await expect(ledger.getAll()).resolves.toEqual([]);
  });

  it('should recover from a corrupted store on the next write', async () => {
    await AsyncStorage.setItem(LEDGER_KEY, '{{{');
    await ledger.startRun({ runId: 'r1', provider: 'canvas', studentExternalId: 's1' });
    const entries = await ledger.getAll();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.runId).toBe('r1');
  });

  it('should clear the ledger through the queue', async () => {
    await ledger.startRun({ runId: 'r1', provider: 'canvas', studentExternalId: 's1' });
    await Promise.all([ledger.addPhase('r1', makePhase(0)), ledger.clear()]);
    // clear was enqueued after addPhase, so the store ends empty.
    await expect(ledger.getAll()).resolves.toEqual([]);
  });

  it('should ignore addPhase/completeRun for unknown runIds', async () => {
    await ledger.startRun({ runId: 'r1', provider: 'canvas', studentExternalId: 's1' });
    await ledger.addPhase('nope', makePhase(0));
    await ledger.completeRun('nope', { status: 'failed', errorMessage: 'x' });
    const [entry] = await ledger.getAll();
    expect(entry?.runId).toBe('r1');
    expect(entry?.status).toBe('in_progress');
    expect(entry?.phases).toHaveLength(0);
  });
});
