import { createLogger } from '@scholaracle/logger';

/** Shared workers logger. All worker modules import this instance. */
export const logger = createLogger('workers');
