import { AsyncLocalStorage } from 'node:async_hooks';

interface IRequestContext {
  readonly requestId: string;
}

const storage = new AsyncLocalStorage<IRequestContext>();

/**
 * Run `fn` with the given request ID bound to the async context. Every log
 * line emitted (directly or transitively) inside `fn` carries the ID via the
 * logger's mixin.
 */
export function runWithRequestId<T>(requestId: string, fn: () => T): T {
  return storage.run({ requestId }, fn);
}

/** The request ID bound to the current async context, if any. */
export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}
