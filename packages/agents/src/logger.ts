import { createLogger } from '@scholaracle/logger';

/** Shared agents logger. All agent modules import this instance. */
export const logger = createLogger('agents');
