import { redact } from './redact';

export type DiagLevel = 'debug' | 'info' | 'warn' | 'error';
export type DiagTag = 'nav' | 'net' | 'auth' | 'update' | 'err' | 'console' | 'act' | 'sync';

export interface DiagEntry {
  seq: number;
  t: number;
  dt: number;
  level: DiagLevel;
  tag: DiagTag;
  msg: string;
  data?: Record<string, unknown>;
}

const CAP = 1000;
const boot = Date.now();
let seq = 0;
const entries: DiagEntry[] = [];
const listeners = new Set<(e: DiagEntry) => void>();

export function bootMs(): number {
  return boot;
}

export function log(
  level: DiagLevel,
  tag: DiagTag,
  msg: string,
  data?: Record<string, unknown>
): DiagEntry {
  seq += 1;
  const entry: DiagEntry = {
    seq,
    t: Date.now(),
    dt: Date.now() - boot,
    level,
    tag,
    msg: String(redact(msg)),
    ...(data ? { data: redact(data) as Record<string, unknown> } : {}),
  };
  entries.push(entry);
  if (entries.length > CAP) entries.shift();
  for (const fn of listeners) {
    try {
      fn(entry);
    } catch {
      // never let a subscriber crash the app
    }
  }
  return entry;
}

export function getEntries(tags?: DiagTag[]): DiagEntry[] {
  if (!tags || tags.length === 0) return entries.slice();
  const set = new Set(tags);
  return entries.filter((e) => set.has(e.tag));
}

export function subscribe(fn: (e: DiagEntry) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Copy-and-keep: returns all buffered entries without clearing. */
export function drain(): DiagEntry[] {
  return entries.slice();
}

export function resetDiagStoreForTests(): void {
  entries.length = 0;
  seq = 0;
  listeners.clear();
}
