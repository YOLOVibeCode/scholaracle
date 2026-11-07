import request from 'supertest';
import type { Express } from 'express';
import type { Db } from 'mongodb';
import {
  AdminUserRepository,
  CouponRepository,
  PaymentRepository,
  SubscriptionRepository,
  UserRepository,
} from '@scholaracle/database';
import { getStepUpToken } from '../test-utils/admin-test-helper';
import type { INoctusoftStoreClient } from '../services/noctusoft-store/NoctusoftStoreClient';

export interface IAdminAuditSweepContext {
  readonly app: Express;
  readonly database: Db;
  readonly adminToken: string;
  readonly adminMfaSecret: string;
  readonly adminEmail: string;
  readonly storeClient: jest.Mocked<INoctusoftStoreClient>;
}

export type AdminMutationAuditRunner = (ctx: IAdminAuditSweepContext) => Promise<void>;

async function createCustomer(
  ctx: IAdminAuditSweepContext,
  emailPrefix: string
): Promise<Awaited<ReturnType<UserRepository['create']>>> {
  const passwordHash = await UserRepository.hashPassword('TestPass123!');
  return new UserRepository(ctx.database).create({
    email: `${emailPrefix}-${Date.now()}@audit-sweep.test`,
    passwordHash,
    name: 'Audit Sweep User',
  });
}

async function stepUpHeader(ctx: IAdminAuditSweepContext): Promise<string> {
  return getStepUpToken(ctx.app, ctx.adminToken, ctx.adminMfaSecret);
}

export function buildAdminMutationAuditRunners(): Record<string, AdminMutationAuditRunner> {
  const runners: Record<string, AdminMutationAuditRunner> = {};

  runners['customer:suspend'] = async (ctx): Promise<void> => {
    const customer = await createCustomer(ctx, 'suspend');
    await request(ctx.app)
      .post(`/api/admin/customers/${customer._id!.toString()}/suspend`)
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({ reason: 'Sweep suspend' });
  };

  runners['customer:unsuspend'] = async (ctx): Promise<void> => {
    const userRepo = new UserRepository(ctx.database);
    const customer = await createCustomer(ctx, 'unsuspend');
    await userRepo.suspendUser(customer._id!.toString(), 'pre');
    await request(ctx.app)
      .post(`/api/admin/customers/${customer._id!.toString()}/unsuspend`)
      .set('Authorization', `Bearer ${ctx.adminToken}`);
  };

  runners['customer:edit'] = async (ctx): Promise<void> => {
    const customer = await createCustomer(ctx, 'edit');
    await request(ctx.app)
      .put(`/api/admin/customers/${customer._id!.toString()}`)
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({ name: 'Edited Name' });
  };

  runners['customer:delete'] = async (ctx): Promise<void> => {
    const customer = await createCustomer(ctx, 'delete');
    await request(ctx.app)
      .delete(`/api/admin/customers/${customer._id!.toString()}`)
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({ reason: 'Sweep delete' });
  };

  runners['customer:impersonate'] = async (ctx): Promise<void> => {
    const stepUp = await stepUpHeader(ctx);
    const customer = await createCustomer(ctx, 'impersonate');
    await request(ctx.app)
      .post(`/api/admin/customers/${customer._id!.toString()}/impersonate`)
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .set('x-admin-stepup', stepUp)
      .send({ reason: 'Sweep impersonate' });
  };

  runners['customer:set_password'] = async (ctx): Promise<void> => {
    const stepUp = await stepUpHeader(ctx);
    const customer = await createCustomer(ctx, 'setpw');
    await request(ctx.app)
      .post(`/api/admin/customers/${customer._id!.toString()}/set-password`)
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .set('x-admin-stepup', stepUp)
      .send({ password: 'NewPass123!', reason: 'Sweep set password' });
  };

  runners['customer:send_reset'] = async (ctx): Promise<void> => {
    const stepUp = await stepUpHeader(ctx);
    const customer = await createCustomer(ctx, 'sendreset');
    await request(ctx.app)
      .post(`/api/admin/customers/${customer._id!.toString()}/send-reset`)
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .set('x-admin-stepup', stepUp)
      .send({ reason: 'Sweep send reset' });
  };

  runners['customer:force_reset'] = async (ctx): Promise<void> => {
    const stepUp = await stepUpHeader(ctx);
    const customer = await createCustomer(ctx, 'forcereset');
    await request(ctx.app)
      .post(`/api/admin/customers/${customer._id!.toString()}/force-reset`)
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .set('x-admin-stepup', stepUp)
      .send({ reason: 'Sweep force reset' });
  };

  runners['customer:bulk_suspend'] = async (ctx): Promise<void> => {
    const customer = await createCustomer(ctx, 'bulksuspend');
    await request(ctx.app)
      .post('/api/admin/customers/bulk-action')
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({
        action: 'suspend',
        customerIds: [customer._id!.toString()],
        reason: 'Sweep bulk suspend',
      });
  };

  runners['customer:bulk_unsuspend'] = async (ctx): Promise<void> => {
    const userRepo = new UserRepository(ctx.database);
    const customer = await createCustomer(ctx, 'bulkunsuspend');
    await userRepo.suspendUser(customer._id!.toString(), 'pre');
    await request(ctx.app)
      .post('/api/admin/customers/bulk-action')
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({
        action: 'unsuspend',
        customerIds: [customer._id!.toString()],
      });
  };

  runners['customer:bulk_change_plan'] = async (ctx): Promise<void> => {
    const customer = await createCustomer(ctx, 'bulkplan');
    const userId = customer._id!.toString();
    await new SubscriptionRepository(ctx.database).create({
      userId,
      plan: 'starter',
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      billingCycle: 'monthly',
    });
    await request(ctx.app)
      .post('/api/admin/customers/bulk-action')
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({
        action: 'change_plan',
        customerIds: [userId],
        plan: 'premium',
      });
  };

  runners['admin:create'] = async (ctx): Promise<void> => {
    const stepUp = await stepUpHeader(ctx);
    await request(ctx.app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .set('x-admin-stepup', stepUp)
      .send({
        email: `sweep-admin-${Date.now()}@test.com`,
        name: 'Sweep Admin',
        role: 'admin',
        password: 'NewAdminPass123!',
      });
  };

  runners['admin:edit'] = async (ctx): Promise<void> => {
    const stepUp = await stepUpHeader(ctx);
    const adminRepo = new AdminUserRepository(ctx.database);
    const created = await adminRepo.create({
      email: `sweep-edit-${Date.now()}@test.com`,
      passwordHash: await AdminUserRepository.hashPassword('EditPass123!'),
      name: 'Sweep Edit Target',
      role: 'admin',
    });
    await request(ctx.app)
      .put(`/api/admin/users/${created._id!.toString()}`)
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .set('x-admin-stepup', stepUp)
      .send({ name: 'Sweep Edited Name' });
  };

  runners['coupon:create'] = async (ctx): Promise<void> => {
    await request(ctx.app)
      .post('/api/admin/coupons')
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({
        code: `SWEEP${Date.now()}`,
        type: 'percent_off',
        value: 10,
        duration: 'once',
      });
  };

  runners['coupon:update'] = async (ctx): Promise<void> => {
    const coupon = await new CouponRepository(ctx.database).create({
      code: `UPD${Date.now()}`,
      type: 'percent_off',
      value: 5,
      duration: 'once',
      isActive: true,
      redemptionCount: 0,
      redemptions: [],
    });
    await request(ctx.app)
      .put(`/api/admin/coupons/${coupon.id}`)
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({ name: 'After Update' });
  };

  runners['coupon:enable'] = async (ctx): Promise<void> => {
    const coupon = await new CouponRepository(ctx.database).create({
      code: `EN${Date.now()}`,
      type: 'percent_off',
      value: 5,
      duration: 'once',
      isActive: false,
      redemptionCount: 0,
      redemptions: [],
    });
    await request(ctx.app)
      .post(`/api/admin/coupons/${coupon.id}/toggle`)
      .set('Authorization', `Bearer ${ctx.adminToken}`);
  };

  runners['coupon:disable'] = async (ctx): Promise<void> => {
    const coupon = await new CouponRepository(ctx.database).create({
      code: `DIS${Date.now()}`,
      type: 'percent_off',
      value: 5,
      duration: 'once',
      isActive: true,
      redemptionCount: 0,
      redemptions: [],
    });
    await request(ctx.app)
      .post(`/api/admin/coupons/${coupon.id}/toggle`)
      .set('Authorization', `Bearer ${ctx.adminToken}`);
  };

  runners['payment:refund'] = async (ctx): Promise<void> => {
    const stepUp = await stepUpHeader(ctx);
    ctx.storeClient.refundPayment.mockResolvedValue({
      refundRef: 'ns_ref_sweep',
      status: 'succeeded',
      amountCents: 1900,
    });
    const payment = await new PaymentRepository(ctx.database).create({
      userId: '507f1f77bcf86cd799439011',
      amount: 1900,
      currency: 'usd',
      status: 'succeeded',
      paymentMethod: 'card',
      storePaymentId: 'ns_pay_sweep',
    });
    await request(ctx.app)
      .post(`/api/admin/payments/${payment._id!.toString()}/refund`)
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .set('x-admin-stepup', stepUp)
      .send({ amount: 19, reason: 'Sweep refund' });
  };

  runners['payment:retry'] = async (ctx): Promise<void> => {
    const payment = await new PaymentRepository(ctx.database).create({
      userId: '507f1f77bcf86cd799439011',
      amount: 1900,
      currency: 'usd',
      status: 'failed',
      paymentMethod: 'card',
    });
    await request(ctx.app)
      .post(`/api/admin/payments/${payment._id!.toString()}/retry`)
      .set('Authorization', `Bearer ${ctx.adminToken}`);
  };

  runners['subscription:upgrade'] = async (ctx): Promise<void> => {
    const customer = await createCustomer(ctx, 'subupgrade');
    const userId = customer._id!.toString();
    await new SubscriptionRepository(ctx.database).create({
      userId,
      plan: 'starter',
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      billingCycle: 'monthly',
    });
    await request(ctx.app)
      .put(`/api/admin/subscriptions/${userId}/plan`)
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({ plan: 'premium' });
  };

  runners['subscription:cancel'] = async (ctx): Promise<void> => {
    const customer = await createCustomer(ctx, 'subcancel');
    const userId = customer._id!.toString();
    await new SubscriptionRepository(ctx.database).create({
      userId,
      plan: 'premium',
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      billingCycle: 'monthly',
    });
    await request(ctx.app)
      .post(`/api/admin/subscriptions/${userId}/cancel`)
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({ reason: 'Sweep cancel' });
  };

  runners['subscription:reactivate'] = async (ctx): Promise<void> => {
    const customer = await createCustomer(ctx, 'subreact');
    const userId = customer._id!.toString();
    await new SubscriptionRepository(ctx.database).create({
      userId,
      plan: 'premium',
      status: 'cancelled',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      billingCycle: 'monthly',
      cancelledAt: new Date(),
    });
    await request(ctx.app)
      .post(`/api/admin/subscriptions/${userId}/reactivate`)
      .set('Authorization', `Bearer ${ctx.adminToken}`);
  };

  runners['subscription:extend_trial'] = async (ctx): Promise<void> => {
    const customer = await createCustomer(ctx, 'subtrial');
    const userId = customer._id!.toString();
    await new SubscriptionRepository(ctx.database).create({
      userId,
      plan: 'starter',
      status: 'trialing',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      billingCycle: 'monthly',
    });
    await request(ctx.app)
      .post(`/api/admin/subscriptions/${userId}/extend-trial`)
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({ days: 7, reason: 'Sweep extend' });
  };

  runners['communication:send'] = async (ctx): Promise<void> => {
    const customer = await createCustomer(ctx, 'commsend');
    await request(ctx.app)
      .post('/api/admin/communications/send')
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({
        recipientEmail: customer.email,
        subject: 'Sweep',
        content: 'Sweep body',
      });
  };

  runners['communication:bulk_send'] = async (ctx): Promise<void> => {
    const stepUp = await stepUpHeader(ctx);
    const customer = await createCustomer(ctx, 'commbulk');
    await request(ctx.app)
      .post('/api/admin/communications/bulk-send')
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .set('x-admin-stepup', stepUp)
      .send({
        criteria: { emails: [customer.email] },
        subject: 'Bulk sweep',
        content: 'Bulk sweep content',
      });
  };

  runners['system:config_change'] = async (ctx): Promise<void> => {
    await request(ctx.app)
      .post('/api/admin/communications/templates')
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .send({
        name: `SweepTpl${Date.now()}`,
        channel: 'email',
        type: 'support',
        subject: 'Tpl',
        content: 'Tpl body',
      });
  };

  runners['system:export'] = async (ctx): Promise<void> => {
    const stepUp = await stepUpHeader(ctx);
    await request(ctx.app)
      .get('/api/admin/audit-logs/export')
      .set('Authorization', `Bearer ${ctx.adminToken}`)
      .set('x-admin-stepup', stepUp);
  };

  return runners;
}
