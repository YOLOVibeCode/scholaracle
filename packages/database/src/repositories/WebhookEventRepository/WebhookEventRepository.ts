import type { Db, Collection } from 'mongodb';
import { MongoServerError } from 'mongodb';

/** Default TTL for recorded webhook events: 30 days. */
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface IWebhookEventDocument {
  readonly provider: string;
  readonly eventId: string;
  readonly processedAt: Date;
  readonly expiresAt: Date;
}

export interface IWebhookEventReader {
  hasBeenSeen(provider: string, eventId: string): Promise<boolean>;
}

export interface IWebhookEventWriter {
  /**
   * Atomically record a (provider, eventId) pair. Returns true if this is the
   * first time the pair has been recorded, false if it has been seen before.
   */
  recordIfNew(provider: string, eventId: string, ttlMs?: number): Promise<boolean>;
}

export interface IWebhookEventRepository extends IWebhookEventReader, IWebhookEventWriter {}

/**
 * Repository for webhook event idempotency. Closes DEF-001 (Square dedup keyed
 * on payment.id instead of event.id) and DEF-007 (no replay window) by giving
 * webhook handlers a single, atomic dedup gate keyed on the provider's own
 * event identifier.
 */
export class WebhookEventRepository implements IWebhookEventRepository {
  private readonly _collection: Collection<IWebhookEventDocument>;

  constructor(database: Db) {
    this._collection = database.collection<IWebhookEventDocument>('webhook_events');
  }

  /**
   * Create the unique compound index on (provider, eventId) and the TTL index
   * on expiresAt. Idempotent — safe to call on every server startup.
   */
  public async ensureIndexes(): Promise<void> {
    await this._collection.createIndex(
      { provider: 1, eventId: 1 },
      { unique: true, name: 'provider_eventId_unique' }
    );
    await this._collection.createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0, name: 'expiresAt_ttl' }
    );
  }

  public async recordIfNew(
    provider: string,
    eventId: string,
    ttlMs: number = DEFAULT_TTL_MS
  ): Promise<boolean> {
    const processedAt = new Date();
    const expiresAt = new Date(processedAt.getTime() + ttlMs);
    try {
      await this._collection.insertOne({ provider, eventId, processedAt, expiresAt });
      return true;
    } catch (err) {
      if (err instanceof MongoServerError && err.code === 11000) {
        return false;
      }
      throw err;
    }
  }

  public async hasBeenSeen(provider: string, eventId: string): Promise<boolean> {
    const doc = await this._collection.findOne({ provider, eventId });
    return doc !== null;
  }
}
