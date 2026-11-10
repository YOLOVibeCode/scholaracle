/**
 * Move the screen before the server answers, and put it back if the server
 * says no. Shared by the phone and the web studio so both roll back the same
 * way; a best-effort refetch after a failure is the caller's business.
 */
export interface ISubmitWithRollback<V, R> {
  /** What the screen shows now; null when nothing is loaded yet (then nothing moves). */
  readonly current: V | null;
  /** The optimistic view for the pick. */
  readonly optimistic: (view: V) => V;
  /** Pushes a view to the screen. */
  readonly set: (view: V) => void;
  /** The server call. Its result is handed back to the caller. */
  readonly submit: () => Promise<R>;
}

export async function submitWithRollback<V, R>(options: ISubmitWithRollback<V, R>): Promise<R> {
  const snapshot = options.current;
  if (snapshot !== null) options.set(options.optimistic(snapshot));
  try {
    return await options.submit();
  } catch (err: unknown) {
    if (snapshot !== null) options.set(snapshot);
    throw err;
  }
}
