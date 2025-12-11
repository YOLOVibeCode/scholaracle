# Super Admin Dashboard - Implementation Checklist

## Overview

This checklist provides a detailed, step-by-step guide to building the Super Admin Dashboard for Scholaracle. Follow the TDD approach: write tests first, then implement.

**Estimated Total Time:** 8-10 weeks  
**Priority:** High  
**Dependencies:** Core user system, authentication, database models

---

## Phase 1: Foundation & Authentication (Week 1-2)

### 1.1 Admin Database Setup

- [ ] **1.1.1** Create `admin_users` collection indexes
  ```javascript
  db.admin_users.createIndex({ email: 1 }, { unique: true });
  db.admin_users.createIndex({ role: 1 });
  db.admin_users.createIndex({ isActive: 1 });
  ```

- [ ] **1.1.2** Create `audit_logs` collection indexes
  ```javascript
  db.audit_logs.createIndex({ adminUserId: 1, timestamp: -1 });
  db.audit_logs.createIndex({ action: 1, timestamp: -1 });
  db.audit_logs.createIndex({ entityType: 1, entityId: 1 });
  ```

- [ ] **1.1.3** Create `subscriptions` collection indexes
  ```javascript
  db.subscriptions.createIndex({ userId: 1 }, { unique: true });
  db.subscriptions.createIndex({ status: 1 });
  db.subscriptions.createIndex({ plan: 1 });
  db.subscriptions.createIndex({ currentPeriodEnd: 1 });
  ```

- [ ] **1.1.4** Create `payments` collection indexes
  ```javascript
  db.payments.createIndex({ userId: 1, createdAt: -1 });
  db.payments.createIndex({ status: 1 });
  db.payments.createIndex({ stripePaymentIntentId: 1 });
  ```

- [ ] **1.1.5** Create `communication_logs` collection indexes
  ```javascript
  db.communication_logs.createIndex({ userId: 1, createdAt: -1 });
  db.communication_logs.createIndex({ channel: 1, status: 1 });
  ```

### 1.2 Admin Repositories (TDD)

- [ ] **1.2.1** Write `AdminUserRepository.test.ts`
  - [ ] Test: `should create admin user`
  - [ ] Test: `should find admin by email`
  - [ ] Test: `should find admin by id`
  - [ ] Test: `should update admin user`
  - [ ] Test: `should deactivate admin user`
  - [ ] Test: `should list all admins`
  - [ ] Test: `should update last login`

- [ ] **1.2.2** Implement `AdminUserRepository.ts`
  ```
  packages/database/src/repositories/AdminUserRepository/
  ├── AdminUserRepository.ts
  ├── AdminUserRepository.test.ts
  └── index.ts
  ```

- [ ] **1.2.3** Write `AuditLogRepository.test.ts`
  - [ ] Test: `should create audit log entry`
  - [ ] Test: `should find logs by admin user`
  - [ ] Test: `should find logs by entity`
  - [ ] Test: `should find logs by action type`
  - [ ] Test: `should find logs in date range`
  - [ ] Test: `should paginate results`

- [ ] **1.2.4** Implement `AuditLogRepository.ts`
  ```
  packages/database/src/repositories/AuditLogRepository/
  ├── AuditLogRepository.ts
  ├── AuditLogRepository.test.ts
  └── index.ts
  ```

### 1.3 Admin Authentication (TDD)

- [ ] **1.3.1** Write `AdminAuthService.test.ts`
  - [ ] Test: `should register new admin (super_admin only)`
  - [ ] Test: `should reject registration without super_admin`
  - [ ] Test: `should login with valid credentials`
  - [ ] Test: `should reject invalid credentials`
  - [ ] Test: `should require MFA after setup`
  - [ ] Test: `should verify MFA code`
  - [ ] Test: `should reject invalid MFA code`
  - [ ] Test: `should generate admin JWT with role`
  - [ ] Test: `should refresh admin token`
  - [ ] Test: `should logout and invalidate session`
  - [ ] Test: `should reject inactive admin`

- [ ] **1.3.2** Implement `AdminAuthService.ts`
  ```
  packages/auth/src/
  ├── AdminAuthService.ts
  ├── AdminAuthService.test.ts
  └── index.ts (update exports)
  ```

- [ ] **1.3.3** Write `adminAuthMiddleware.test.ts`
  - [ ] Test: `should allow request with valid admin token`
  - [ ] Test: `should reject request without token`
  - [ ] Test: `should reject request with invalid token`
  - [ ] Test: `should reject request with user token (not admin)`
  - [ ] Test: `should attach admin info to request`

- [ ] **1.3.4** Implement `adminAuthMiddleware.ts`
  ```
  packages/api/src/middleware/
  ├── adminAuth.ts
  └── adminAuth.test.ts
  ```

### 1.4 MFA Implementation

- [ ] **1.4.1** Install TOTP dependencies
  ```bash
  pnpm --filter @scholaracle/auth add speakeasy qrcode
  pnpm --filter @scholaracle/auth add -D @types/speakeasy @types/qrcode
  ```

- [ ] **1.4.2** Write `MFAService.test.ts`
  - [ ] Test: `should generate MFA secret`
  - [ ] Test: `should generate QR code`
  - [ ] Test: `should verify valid TOTP code`
  - [ ] Test: `should reject invalid TOTP code`
  - [ ] Test: `should reject expired TOTP code`

- [ ] **1.4.3** Implement `MFAService.ts`
  ```
  packages/auth/src/
  ├── MFAService.ts
  └── MFAService.test.ts
  ```

### 1.5 Admin Auth API Routes (TDD)

- [ ] **1.5.1** Write `admin-auth.test.ts`
  - [ ] Test: `POST /api/admin/auth/login - success`
  - [ ] Test: `POST /api/admin/auth/login - invalid credentials`
  - [ ] Test: `POST /api/admin/auth/login - requires MFA`
  - [ ] Test: `POST /api/admin/auth/mfa/verify - success`
  - [ ] Test: `POST /api/admin/auth/mfa/verify - invalid code`
  - [ ] Test: `POST /api/admin/auth/mfa/setup - generate secret`
  - [ ] Test: `POST /api/admin/auth/mfa/setup - enable MFA`
  - [ ] Test: `POST /api/admin/auth/logout - success`
  - [ ] Test: `POST /api/admin/auth/refresh - success`

- [ ] **1.5.2** Implement admin auth routes
  ```
  packages/api/src/routes/admin/
  ├── auth/
  │   ├── auth.ts
  │   ├── auth.test.ts
  │   └── index.ts
  └── index.ts
  ```

- [ ] **1.5.3** Register admin routes in server.ts
  ```typescript
  app.use('/api/admin/auth', adminAuthRouter(config));
  ```

---

## Phase 2: Customer Management (Week 3-4)

### 2.1 Customer Repository Extensions

- [ ] **2.1.1** Write additional `UserRepository` tests
  - [ ] Test: `should find users with pagination`
  - [ ] Test: `should search users by email/name`
  - [ ] Test: `should filter users by subscription plan`
  - [ ] Test: `should filter users by status`
  - [ ] Test: `should filter users by date range`
  - [ ] Test: `should get user statistics`
  - [ ] Test: `should suspend user`
  - [ ] Test: `should unsuspend user`

- [ ] **2.1.2** Extend `UserRepository.ts` with admin methods
  ```typescript
  // Add these methods
  findWithPagination(options: IUserQueryOptions): Promise<IPaginatedResult<User>>;
  searchUsers(query: string): Promise<User[]>;
  suspendUser(userId: string, reason: string): Promise<boolean>;
  unsuspendUser(userId: string): Promise<boolean>;
  getUserStatistics(): Promise<IUserStatistics>;
  ```

### 2.2 Customer API Routes (TDD)

- [ ] **2.2.1** Write `admin-customers.test.ts`
  - [ ] Test: `GET /api/admin/customers - list customers`
  - [ ] Test: `GET /api/admin/customers - with pagination`
  - [ ] Test: `GET /api/admin/customers - with search`
  - [ ] Test: `GET /api/admin/customers - with filters`
  - [ ] Test: `GET /api/admin/customers/:id - get customer`
  - [ ] Test: `GET /api/admin/customers/:id - not found`
  - [ ] Test: `PUT /api/admin/customers/:id - update customer`
  - [ ] Test: `DELETE /api/admin/customers/:id - delete customer`
  - [ ] Test: `DELETE /api/admin/customers/:id - requires super_admin`
  - [ ] Test: `POST /api/admin/customers/:id/suspend - suspend`
  - [ ] Test: `POST /api/admin/customers/:id/unsuspend - unsuspend`
  - [ ] Test: `POST /api/admin/customers/:id/impersonate - login as user`
  - [ ] Test: `All routes - require admin auth`
  - [ ] Test: `All routes - create audit log`

- [ ] **2.2.2** Implement customer routes
  ```
  packages/api/src/routes/admin/
  └── customers/
      ├── customers.ts
      ├── customers.test.ts
      └── index.ts
  ```

### 2.3 Admin Notes (TDD)

- [ ] **2.3.1** Write `AdminNoteRepository.test.ts`
  - [ ] Test: `should create note`
  - [ ] Test: `should find notes by user id`
  - [ ] Test: `should update note`
  - [ ] Test: `should delete note`
  - [ ] Test: `should pin/unpin note`

- [ ] **2.3.2** Implement `AdminNoteRepository.ts`

- [ ] **2.3.3** Write `admin-notes.test.ts`
  - [ ] Test: `GET /api/admin/customers/:id/notes - list notes`
  - [ ] Test: `POST /api/admin/customers/:id/notes - create note`
  - [ ] Test: `PUT /api/admin/notes/:id - update note`
  - [ ] Test: `DELETE /api/admin/notes/:id - delete note`
  - [ ] Test: `POST /api/admin/notes/:id/pin - pin note`

- [ ] **2.3.4** Implement notes routes

---

## Phase 3: Subscriptions & Billing (Week 5-6)

### 3.1 Subscription Repository (TDD)

- [ ] **3.1.1** Write `SubscriptionRepository.test.ts`
  - [ ] Test: `should create subscription`
  - [ ] Test: `should find subscription by user id`
  - [ ] Test: `should update subscription`
  - [ ] Test: `should change plan`
  - [ ] Test: `should cancel subscription`
  - [ ] Test: `should reactivate subscription`
  - [ ] Test: `should extend trial`
  - [ ] Test: `should add subscription event`
  - [ ] Test: `should get expiring subscriptions`
  - [ ] Test: `should get MRR calculation`

- [ ] **3.1.2** Implement `SubscriptionRepository.ts`
  ```
  packages/database/src/repositories/SubscriptionRepository/
  ├── SubscriptionRepository.ts
  ├── SubscriptionRepository.test.ts
  └── index.ts
  ```

### 3.2 Payment Repository (TDD)

- [ ] **3.2.1** Write `PaymentRepository.test.ts`
  - [ ] Test: `should create payment`
  - [ ] Test: `should find payments by user id`
  - [ ] Test: `should find payment by stripe id`
  - [ ] Test: `should update payment status`
  - [ ] Test: `should record refund`
  - [ ] Test: `should get payment statistics`
  - [ ] Test: `should get revenue by period`

- [ ] **3.2.2** Implement `PaymentRepository.ts`
  ```
  packages/database/src/repositories/PaymentRepository/
  ├── PaymentRepository.ts
  ├── PaymentRepository.test.ts
  └── index.ts
  ```

### 3.3 Stripe Integration

- [ ] **3.3.1** Install Stripe SDK
  ```bash
  pnpm --filter @scholaracle/api add stripe
  pnpm --filter @scholaracle/api add -D @types/stripe
  ```

- [ ] **3.3.2** Write `StripeService.test.ts`
  - [ ] Test: `should create customer`
  - [ ] Test: `should create subscription`
  - [ ] Test: `should cancel subscription`
  - [ ] Test: `should create payment intent`
  - [ ] Test: `should process refund`
  - [ ] Test: `should handle webhook events`

- [ ] **3.3.3** Implement `StripeService.ts`
  ```
  packages/api/src/services/
  ├── StripeService.ts
  └── StripeService.test.ts
  ```

### 3.4 Subscription API Routes (TDD)

- [ ] **3.4.1** Write `admin-subscriptions.test.ts`
  - [ ] Test: `GET /api/admin/subscriptions - list all`
  - [ ] Test: `GET /api/admin/subscriptions - with filters`
  - [ ] Test: `GET /api/admin/subscriptions/:id - get details`
  - [ ] Test: `PUT /api/admin/subscriptions/:id/plan - change plan`
  - [ ] Test: `POST /api/admin/subscriptions/:id/cancel - cancel`
  - [ ] Test: `POST /api/admin/subscriptions/:id/reactivate - reactivate`
  - [ ] Test: `POST /api/admin/subscriptions/:id/extend-trial - extend`
  - [ ] Test: `All routes - require billing permission`

- [ ] **3.4.2** Implement subscription routes
  ```
  packages/api/src/routes/admin/
  └── subscriptions/
      ├── subscriptions.ts
      ├── subscriptions.test.ts
      └── index.ts
  ```

### 3.5 Payment API Routes (TDD)

- [ ] **3.5.1** Write `admin-payments.test.ts`
  - [ ] Test: `GET /api/admin/payments - list payments`
  - [ ] Test: `GET /api/admin/payments - with filters`
  - [ ] Test: `GET /api/admin/payments/:id - get details`
  - [ ] Test: `POST /api/admin/payments/:id/refund - full refund`
  - [ ] Test: `POST /api/admin/payments/:id/refund - partial refund`
  - [ ] Test: `POST /api/admin/payments/:id/retry - retry failed`
  - [ ] Test: `All routes - require payment permission`

- [ ] **3.5.2** Implement payment routes
  ```
  packages/api/src/routes/admin/
  └── payments/
      ├── payments.ts
      ├── payments.test.ts
      └── index.ts
  ```

### 3.6 Stripe Webhooks

- [ ] **3.6.1** Write `stripe-webhooks.test.ts`
  - [ ] Test: `should handle payment_intent.succeeded`
  - [ ] Test: `should handle payment_intent.failed`
  - [ ] Test: `should handle customer.subscription.updated`
  - [ ] Test: `should handle customer.subscription.deleted`
  - [ ] Test: `should handle invoice.paid`
  - [ ] Test: `should handle invoice.payment_failed`
  - [ ] Test: `should verify webhook signature`

- [ ] **3.6.2** Implement webhook handler
  ```
  packages/api/src/routes/webhooks/
  └── stripe.ts
  ```

---

## Phase 4: Communication System (Week 7)

### 4.1 Communication Log Repository (TDD)

- [ ] **4.1.1** Write `CommunicationLogRepository.test.ts`
  - [ ] Test: `should create log entry`
  - [ ] Test: `should find logs by user id`
  - [ ] Test: `should update delivery status`
  - [ ] Test: `should filter by channel`
  - [ ] Test: `should filter by type`
  - [ ] Test: `should get delivery statistics`

- [ ] **4.1.2** Implement `CommunicationLogRepository.ts`
  ```
  packages/database/src/repositories/CommunicationLogRepository/
  ├── CommunicationLogRepository.ts
  ├── CommunicationLogRepository.test.ts
  └── index.ts
  ```

### 4.2 Email Template System

- [ ] **4.2.1** Create email template model
  ```
  packages/database/src/models/EmailTemplate/
  ├── EmailTemplate.ts
  └── index.ts
  ```

- [ ] **4.2.2** Write `EmailTemplateRepository.test.ts`
  - [ ] Test: `should create template`
  - [ ] Test: `should find template by id`
  - [ ] Test: `should list templates`
  - [ ] Test: `should update template`
  - [ ] Test: `should delete template`

- [ ] **4.2.3** Implement `EmailTemplateRepository.ts`

### 4.3 Communication API Routes (TDD)

- [ ] **4.3.1** Write `admin-communications.test.ts`
  - [ ] Test: `GET /api/admin/communications - list logs`
  - [ ] Test: `GET /api/admin/communications - with filters`
  - [ ] Test: `POST /api/admin/communications/send - send email`
  - [ ] Test: `POST /api/admin/communications/send - send SMS`
  - [ ] Test: `POST /api/admin/communications/bulk - bulk send`
  - [ ] Test: `GET /api/admin/communications/templates - list templates`
  - [ ] Test: `POST /api/admin/communications/templates - create template`
  - [ ] Test: `PUT /api/admin/communications/templates/:id - update`
  - [ ] Test: `DELETE /api/admin/communications/templates/:id - delete`

- [ ] **4.3.2** Implement communication routes
  ```
  packages/api/src/routes/admin/
  └── communications/
      ├── communications.ts
      ├── communications.test.ts
      └── index.ts
  ```

---

## Phase 5: Analytics & Reporting (Week 8)

### 5.1 Analytics Service (TDD)

- [ ] **5.1.1** Write `AnalyticsService.test.ts`
  - [ ] Test: `should calculate MRR`
  - [ ] Test: `should calculate churn rate`
  - [ ] Test: `should calculate ARPU`
  - [ ] Test: `should get revenue by period`
  - [ ] Test: `should get subscription growth`
  - [ ] Test: `should get customer growth`
  - [ ] Test: `should get feature usage stats`

- [ ] **5.1.2** Implement `AnalyticsService.ts`
  ```
  packages/api/src/services/
  ├── AnalyticsService.ts
  └── AnalyticsService.test.ts
  ```

### 5.2 Analytics API Routes (TDD)

- [ ] **5.2.1** Write `admin-analytics.test.ts`
  - [ ] Test: `GET /api/admin/analytics/overview - dashboard KPIs`
  - [ ] Test: `GET /api/admin/analytics/revenue - revenue metrics`
  - [ ] Test: `GET /api/admin/analytics/customers - customer metrics`
  - [ ] Test: `GET /api/admin/analytics/subscriptions - sub metrics`
  - [ ] Test: `GET /api/admin/analytics/churn - churn analysis`
  - [ ] Test: `All routes - require analyst permission`

- [ ] **5.2.2** Implement analytics routes
  ```
  packages/api/src/routes/admin/
  └── analytics/
      ├── analytics.ts
      ├── analytics.test.ts
      └── index.ts
  ```

### 5.3 Export System

- [ ] **5.3.1** Write `ExportService.test.ts`
  - [ ] Test: `should export customers to CSV`
  - [ ] Test: `should export payments to CSV`
  - [ ] Test: `should export with date filters`
  - [ ] Test: `should handle large exports`

- [ ] **5.3.2** Implement `ExportService.ts`

- [ ] **5.3.3** Write export routes
  - [ ] `GET /api/admin/reports/export/customers`
  - [ ] `GET /api/admin/reports/export/payments`
  - [ ] `GET /api/admin/reports/export/subscriptions`

---

## Phase 6: Admin Dashboard Frontend (Week 9-10)

### 6.1 Admin Layout & Navigation

- [ ] **6.1.1** Create admin route group
  ```
  packages/web/app/admin/
  ├── layout.tsx
  ├── page.tsx (dashboard)
  └── ...
  ```

- [ ] **6.1.2** Build admin sidebar component
  - [ ] Dashboard link
  - [ ] Customers link
  - [ ] Payments link
  - [ ] Subscriptions link
  - [ ] Communications link
  - [ ] Reports link
  - [ ] Settings link (super_admin only)

- [ ] **6.1.3** Build admin header component
  - [ ] Admin user info
  - [ ] Role badge
  - [ ] Logout button
  - [ ] Notifications dropdown

### 6.2 Admin Login Page

- [ ] **6.2.1** Build admin login form
  - [ ] Email input
  - [ ] Password input
  - [ ] Remember me checkbox
  - [ ] Login button
  - [ ] Error display

- [ ] **6.2.2** Build MFA verification step
  - [ ] 6-digit code input
  - [ ] Verify button
  - [ ] Resend option
  - [ ] Countdown timer

### 6.3 Dashboard Overview Page

- [ ] **6.3.1** Build KPI cards
  - [ ] Total Customers (with trend)
  - [ ] Active Subscribers
  - [ ] MRR
  - [ ] Churn Rate
  - [ ] New Signups

- [ ] **6.3.2** Build revenue chart
  - [ ] Line chart (last 30 days)
  - [ ] Period selector

- [ ] **6.3.3** Build recent activity feed
  - [ ] New registrations
  - [ ] Subscription changes
  - [ ] Payments
  - [ ] Support tickets

- [ ] **6.3.4** Build alerts panel
  - [ ] Failed payments
  - [ ] Expiring subscriptions
  - [ ] High-priority tickets

### 6.4 Customer List Page

- [ ] **6.4.1** Build customer data table
  - [ ] Sortable columns
  - [ ] Row selection
  - [ ] Pagination
  - [ ] Loading state

- [ ] **6.4.2** Build search & filters
  - [ ] Search input
  - [ ] Plan filter
  - [ ] Status filter
  - [ ] Date range filter
  - [ ] Clear filters button

- [ ] **6.4.3** Build bulk actions
  - [ ] Export selected
  - [ ] Email selected
  - [ ] Suspend selected

### 6.5 Customer Detail Page

- [ ] **6.5.1** Build customer header
  - [ ] Name, email, avatar
  - [ ] Status badge
  - [ ] Quick actions dropdown

- [ ] **6.5.2** Build tabs
  - [ ] Overview tab
  - [ ] Subscription tab
  - [ ] Payments tab
  - [ ] Students tab
  - [ ] Communications tab
  - [ ] Notes tab

- [ ] **6.5.3** Build each tab content
  - [ ] Overview: Profile, stats, recent activity
  - [ ] Subscription: Plan details, history, actions
  - [ ] Payments: Payment history, refund action
  - [ ] Students: Student list, alerts
  - [ ] Communications: Log viewer, send form
  - [ ] Notes: Notes list, add note form

### 6.6 Payments Page

- [ ] **6.6.1** Build payments table
  - [ ] Customer link
  - [ ] Amount
  - [ ] Status badge
  - [ ] Payment method
  - [ ] Date
  - [ ] Actions

- [ ] **6.6.2** Build refund modal
  - [ ] Full/partial refund options
  - [ ] Reason input
  - [ ] Confirmation

### 6.7 Subscriptions Page

- [ ] **6.7.1** Build subscriptions table
  - [ ] Customer link
  - [ ] Plan badge
  - [ ] Status badge
  - [ ] MRR contribution
  - [ ] Renewal date
  - [ ] Actions

- [ ] **6.7.2** Build plan breakdown chart
  - [ ] Pie chart by plan
  - [ ] Active vs cancelled

### 6.8 Reports Page

- [ ] **6.8.1** Build report generator
  - [ ] Report type selector
  - [ ] Date range picker
  - [ ] Generate button
  - [ ] Download options (CSV, PDF)

- [ ] **6.8.2** Build pre-built reports
  - [ ] Revenue summary
  - [ ] Customer growth
  - [ ] Churn analysis
  - [ ] Plan distribution

### 6.9 Admin Settings Page (Super Admin Only)

- [ ] **6.9.1** Build admin user management
  - [ ] Admin list table
  - [ ] Add admin form
  - [ ] Edit admin form
  - [ ] Deactivate admin

- [ ] **6.9.2** Build system settings
  - [ ] Plan pricing configuration
  - [ ] Feature flags
  - [ ] Email settings

- [ ] **6.9.3** Build audit log viewer
  - [ ] Action filter
  - [ ] Date filter
  - [ ] Admin filter
  - [ ] Export option

---

## Phase 7: Testing & Security (Week 11)

### 7.1 E2E Tests for Admin

- [ ] **7.1.1** Admin login flow
- [ ] **7.1.2** MFA setup and verification
- [ ] **7.1.3** Customer list and search
- [ ] **7.1.4** Customer detail view
- [ ] **7.1.5** Subscription management
- [ ] **7.1.6** Payment refund flow
- [ ] **7.1.7** Report generation

### 7.2 Security Audit

- [ ] **7.2.1** Permission check on every route
- [ ] **7.2.2** Audit logging completeness
- [ ] **7.2.3** Token expiration handling
- [ ] **7.2.4** Rate limiting on admin endpoints
- [ ] **7.2.5** Input validation
- [ ] **7.2.6** SQL/NoSQL injection prevention
- [ ] **7.2.7** XSS prevention

### 7.3 Performance

- [ ] **7.3.1** Database query optimization
- [ ] **7.3.2** Pagination on all lists
- [ ] **7.3.3** Caching strategy
- [ ] **7.3.4** Large export handling

---

## Phase 8: Documentation & Deployment (Week 12)

### 8.1 Documentation

- [ ] **8.1.1** API documentation (OpenAPI/Swagger)
- [ ] **8.1.2** Admin user guide
- [ ] **8.1.3** Role & permission guide
- [ ] **8.1.4** Deployment guide

### 8.2 Seed Data

- [ ] **8.2.1** Create super admin seed script
- [ ] **8.2.2** Create test data seed script

### 8.3 Deployment

- [ ] **8.3.1** Environment variables documentation
- [ ] **8.3.2** Database migration scripts
- [ ] **8.3.3** CI/CD pipeline updates
- [ ] **8.3.4** Staging deployment
- [ ] **8.3.5** Production deployment

---

## Quick Reference: API Endpoints

### Authentication
| Method | Endpoint | Permission |
|--------|----------|------------|
| POST | `/api/admin/auth/login` | Public |
| POST | `/api/admin/auth/logout` | Authenticated |
| POST | `/api/admin/auth/refresh` | Authenticated |
| POST | `/api/admin/auth/mfa/setup` | Authenticated |
| POST | `/api/admin/auth/mfa/verify` | Authenticated |

### Customers
| Method | Endpoint | Permission |
|--------|----------|------------|
| GET | `/api/admin/customers` | customers:view |
| GET | `/api/admin/customers/:id` | customers:view |
| PUT | `/api/admin/customers/:id` | customers:edit |
| DELETE | `/api/admin/customers/:id` | customers:delete |
| POST | `/api/admin/customers/:id/suspend` | customers:edit |
| POST | `/api/admin/customers/:id/unsuspend` | customers:edit |
| POST | `/api/admin/customers/:id/impersonate` | customers:impersonate |

### Subscriptions
| Method | Endpoint | Permission |
|--------|----------|------------|
| GET | `/api/admin/subscriptions` | subscriptions:view |
| GET | `/api/admin/subscriptions/:id` | subscriptions:view |
| PUT | `/api/admin/subscriptions/:id/plan` | subscriptions:modify |
| POST | `/api/admin/subscriptions/:id/cancel` | subscriptions:modify |
| POST | `/api/admin/subscriptions/:id/reactivate` | subscriptions:modify |

### Payments
| Method | Endpoint | Permission |
|--------|----------|------------|
| GET | `/api/admin/payments` | payments:view |
| GET | `/api/admin/payments/:id` | payments:view |
| POST | `/api/admin/payments/:id/refund` | payments:refund |
| POST | `/api/admin/payments/:id/retry` | payments:refund |

### Analytics
| Method | Endpoint | Permission |
|--------|----------|------------|
| GET | `/api/admin/analytics/overview` | analytics:view |
| GET | `/api/admin/analytics/revenue` | analytics:view |
| GET | `/api/admin/analytics/customers` | analytics:view |
| GET | `/api/admin/analytics/subscriptions` | analytics:view |

---

## Progress Tracker

| Phase | Status | Started | Completed |
|-------|--------|---------|-----------|
| 1. Foundation | ⬜ Not Started | | |
| 2. Customer Management | ⬜ Not Started | | |
| 3. Subscriptions & Billing | ⬜ Not Started | | |
| 4. Communication System | ⬜ Not Started | | |
| 5. Analytics & Reporting | ⬜ Not Started | | |
| 6. Admin Frontend | ⬜ Not Started | | |
| 7. Testing & Security | ⬜ Not Started | | |
| 8. Documentation & Deploy | ⬜ Not Started | | |

---

## Notes

- Always follow TDD: Write tests first, then implement
- Create audit log entries for every admin action
- Check permissions on every API endpoint
- Use transactions for multi-step operations
- Add error handling and logging
- Keep the UI responsive with loading states
- Mobile-friendly admin interface (optional but nice)

