import { createLogger } from '@scholaracle/logger';

/** Shared API logger. All API modules import this instance. */
export const logger = createLogger('api');
