/**
 * The Mongo IWeekSource lives in @scholaracle/agents so the weekly-review worker
 * composes the same view this route serves (student review spec §3.3: no second truth).
 */
export { createMongoTodaySource, type IMongoTodaySourceConfig } from '@scholaracle/agents';
