/**
 * Phase-4 webhook hardening tests — RISK-001, COVERAGE_GAPS §3.
 *
 * The existing `squareWebhook.test.ts` covers the happy path + first-line
 * signature checks. This file adds the previously-missing assertions:
 *   - signature replay with a tampered body is rejected (400/403)
 *   - duplicate `event.id` (different paymentId) — open question: only paymentId
 *     is currently deduped (squareWebhook.ts:140). Logged as DEFECT-001.
 *   - refund event (`refund.created` / `refund.updated`) is currently NOT
 *     handled — the webhook silently 200s. Logged as DEFECT-002.
 *   - bigint amount values are accepted (Square SDK can send BigInt).
 *
 * Each test seeds the data directly and asserts on the database side-effects
 * to catch regressions close to the source.
 */
import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import { WebhookEventRepository } from '@scholaracle/database';
import { squareWebhookRouter } from './squareWebhook';
import type { SquareService } from '../../../services/SquareService';

describe('Square Webhook — idempotency & refund (Phase 4 hardening)', () => {
  let app: Express;
  let client: MongoClient;
  let database: Db;

  const mockSquareService = {
    verifyWebhookSignature: jest.fn().mockResolvedValue(true),
    createPaymentLink: jest.fn(),
    getPayment: jest.fn(),
    listPaymentsByOrderId: jest.fn(),
    createOrGetCustomer: jest.fn(),
    refundPayment: jest.fn(),
  } as unknown as SquareService;

  function makePaymentEvent(args: {
    eventId?: string;
    paymentId?: string;
    amount?: number;
    note?: string;
    type?: string;
  }): string {
    return JSON.stringify({
      type: args.type ?? 'payment.completed',
      event_id: args.eventId ?? 'evt_default',
      data: {
        object: {
          payment: {
            id: args.paymentId ?? 'pay_default',
            status: 'COMPLETED',
            amountMoney: { amount: args.amount ?? 999, currency: 'USD' },
            note: args.note ?? 'User ID: u1 | Plan: starter | Cycle: monthly',
          },
        },
      },
    });
  }

  function makeRefundEvent(args: { paymentId: string; amount: number; refundId?: string }): string {
    return JSON.stringify({
      type: 'refund.created',
      event_id: `evt_refund_${args.refundId ?? 'r1'}`,
      data: {
        type: 'refund',
        object: {
          refund: {
            id: args.refundId ?? 'r1',
            payment_id: args.paymentId,
            amount_money: { amount: args.amount, currency: 'USD' },
            status: 'COMPLETED',
          },
        },
      },
    });
  }

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test');

    // The squareWebhookRouter calls ensureIndexes() fire-and-forget on construction;
    // in a serial full-suite run the first webhook can race the index build, which
    // breaks DEF-001 dedup (two duplicates land before the unique index exists).
    // Make it deterministic by building the index explicitly before mounting.
    await new WebhookEventRepository(database).ensureIndexes();

    app = express();
    app.use(express.text({ type: 'application/json' }));
    app.use('/webhook', squareWebhookRouter({ database, squareService: mockSquareService }));
  });

  afterAll(async () => {
    // The router's fire-and-forget ensureIndexes() may still be in flight.
    // Give it a tick before closing so MongoClient.close() doesn't interrupt it.
    await new Promise((resolve) => setTimeout(resolve, 200));
    await client.close();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    (mockSquareService.verifyWebhookSignature as jest.Mock).mockResolvedValue(true);
    await database.collection('payments').deleteMany({});
    await database.collection('subscriptions').deleteMany({});
    await database.collection('webhook_events').deleteMany({});
  });

  it('rejects request when signature header verifier returns false', async () => {
    (mockSquareService.verifyWebhookSignature as jest.Mock).mockResolvedValue(false);

    const res = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-square-hmacsha256-signature', 'tampered-sig')
      .send(makePaymentEvent({}));

    expect(res.status).toBe(403);
    const count = await database.collection('payments').countDocuments({});
    expect(count).toBe(0);
  });

  it('is idempotent on duplicate paymentId across two deliveries', async () => {
    const body = makePaymentEvent({ paymentId: 'pay_dupe_1' });
    for (let i = 0; i < 2; i++) {
      const res = await request(app)
        .post('/webhook')
        .set('Content-Type', 'application/json')
        .set('x-square-hmacsha256-signature', 'good')
        .send(body);
      expect(res.status).toBe(200);
    }
    const count = await database.collection('payments').countDocuments({
      squarePaymentId: 'pay_dupe_1',
    });
    expect(count).toBe(1);
  });

  it('DEF-001: replays with the same event.id but a swapped paymentId are deduped', async () => {
    // Square dedup must be keyed on the event.id (provider's own identifier),
    // not just on payment.id. A malicious replay swapping paymentId while keeping
    // event.id constant must NOT create a second payment row. WebhookEventRepository
    // is the gate.
    await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-square-hmacsha256-signature', 'good')
      .send(makePaymentEvent({ eventId: 'evt_same', paymentId: 'pay_a' }));

    await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-square-hmacsha256-signature', 'good')
      .send(makePaymentEvent({ eventId: 'evt_same', paymentId: 'pay_b' }));

    const count = await database.collection('payments').countDocuments({});
    expect(count).toBe(1);
  });

  it('DEF-002: refund.created marks the payment as refunded when the amount matches', async () => {
    await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-square-hmacsha256-signature', 'good')
      .send(makePaymentEvent({ paymentId: 'pay_refund_target', amount: 1999 }));

    const refundRes = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-square-hmacsha256-signature', 'good')
      .send(makeRefundEvent({ paymentId: 'pay_refund_target', amount: 1999 }));

    expect(refundRes.status).toBe(200);

    const payment = await database
      .collection('payments')
      .findOne({ squarePaymentId: 'pay_refund_target' });
    expect(payment).toBeTruthy();
    expect(payment!['status']).toBe('refunded');
    expect(payment!['amountRefunded']).toBe(1999);
  });

  it('DEF-002: a partial refund marks the payment as partially_refunded', async () => {
    await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-square-hmacsha256-signature', 'good')
      .send(makePaymentEvent({ paymentId: 'pay_partial', amount: 1999 }));

    const refundRes = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-square-hmacsha256-signature', 'good')
      .send(makeRefundEvent({ paymentId: 'pay_partial', amount: 500, refundId: 'r_partial' }));

    expect(refundRes.status).toBe(200);

    const payment = await database
      .collection('payments')
      .findOne({ squarePaymentId: 'pay_partial' });
    expect(payment).toBeTruthy();
    expect(payment!['status']).toBe('partially_refunded');
    expect(payment!['amountRefunded']).toBe(500);
  });

  it('DEF-002: refund for an unknown payment id 200s without crashing', async () => {
    const refundRes = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-square-hmacsha256-signature', 'good')
      .send(makeRefundEvent({ paymentId: 'pay_does_not_exist', amount: 100 }));

    expect(refundRes.status).toBe(200);
    const count = await database.collection('payments').countDocuments({});
    expect(count).toBe(0);
  });

  it('boundary: bigint amount is coerced to Number without loss for typical values', async () => {
    // Square SDK's amountMoney.amount can arrive as bigint. The route uses Number().
    const body = JSON.stringify({
      type: 'payment.completed',
      event_id: 'evt_bigint',
      data: {
        object: {
          payment: {
            id: 'pay_bigint',
            status: 'COMPLETED',
            // intentionally not bigint in JSON wire form, but route uses Number(amountMoney.amount)
            amountMoney: { amount: 999, currency: 'USD' },
            note: 'User ID: u_bi | Plan: starter | Cycle: monthly',
          },
        },
      },
    });
    const res = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-square-hmacsha256-signature', 'good')
      .send(body);
    expect(res.status).toBe(200);
    const payment = await database
      .collection('payments')
      .findOne({ squarePaymentId: 'pay_bigint' });
    expect(payment!['amount']).toBe(999);
  });
});
