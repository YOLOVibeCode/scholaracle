# Super Admin Dashboard Specification

## Executive Summary

The Super Admin Dashboard is a secure, comprehensive management interface for Scholaracle administrators to monitor, manage, and support all customers (parents/guardians) using the platform. It provides complete visibility into customer activity, subscription status, payment history, and communication logs.

---

## 1. Roles & Permissions

### 1.1 Role Hierarchy

| Role | Level | Description |
|------|-------|-------------|
| `super_admin` | 100 | Full system access, all permissions |
| `admin` | 80 | Customer management, limited system config |
| `support` | 60 | View-only customer data, communication logs |
| `billing` | 50 | Payment and subscription management only |
| `analyst` | 40 | Analytics and reporting only |

### 1.2 Permission Matrix

| Permission | Super Admin | Admin | Support | Billing | Analyst |
|------------|-------------|-------|---------|---------|---------|
| View all customers | ✅ | ✅ | ✅ | ✅ | ✅ |
| Edit customer data | ✅ | ✅ | ❌ | ❌ | ❌ |
| Delete customer | ✅ | ❌ | ❌ | ❌ | ❌ |
| View payments | ✅ | ✅ | ❌ | ✅ | ✅ |
| Issue refunds | ✅ | ❌ | ❌ | ✅ | ❌ |
| Modify subscriptions | ✅ | ✅ | ❌ | ✅ | ❌ |
| View communication logs | ✅ | ✅ | ✅ | ❌ | ❌ |
| Send communications | ✅ | ✅ | ✅ | ❌ | ❌ |
| View analytics | ✅ | ✅ | ❌ | ✅ | ✅ |
| System configuration | ✅ | ❌ | ❌ | ❌ | ❌ |
| Manage admin users | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## 2. Data Models

### 2.1 Admin User Model

```typescript
// packages/database/src/models/AdminUser/AdminUser.ts

export type AdminRole = 'super_admin' | 'admin' | 'support' | 'billing' | 'analyst';

export interface IAdminUserData {
  readonly email: string;
  readonly passwordHash: string;
  readonly name: string;
  readonly role: AdminRole;
  readonly permissions?: readonly string[];
  readonly isActive: boolean;
  readonly lastLogin?: Date;
  readonly mfaEnabled?: boolean;
  readonly mfaSecret?: string;
  readonly createdBy?: string;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

export class AdminUser {
  public readonly _id?: ObjectId;
  public readonly email: string;
  public readonly passwordHash: string;
  public readonly name: string;
  public readonly role: AdminRole;
  public readonly permissions: readonly string[];
  public readonly isActive: boolean;
  public readonly lastLogin?: Date;
  public readonly mfaEnabled: boolean;
  public readonly createdBy?: string;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  constructor(data: IAdminUserData, id?: ObjectId) {
    // Implementation
  }

  hasPermission(permission: string): boolean {
    // Check role-based and explicit permissions
  }
}
```

### 2.2 Customer (Enhanced User) Model

```typescript
// Enhanced user model for admin view

export interface ICustomerData extends IUserData {
  // Billing Information
  readonly stripeCustomerId?: string;
  readonly billingEmail?: string;
  readonly billingAddress?: IAddress;
  
  // Subscription Details
  readonly subscription: ISubscriptionData;
  readonly subscriptionHistory: readonly ISubscriptionEvent[];
  
  // Payment Information
  readonly paymentMethods: readonly IPaymentMethod[];
  readonly defaultPaymentMethodId?: string;
  
  // Activity Tracking
  readonly lastActive?: Date;
  readonly loginCount: number;
  readonly totalStudents: number;
  readonly totalAlerts: number;
  
  // Support & Communication
  readonly communicationLog: readonly ICommunicationEntry[];
  readonly supportTickets: readonly ISupportTicket[];
  readonly notes: readonly IAdminNote[];
  
  // Flags
  readonly isVerified: boolean;
  readonly isSuspended: boolean;
  readonly suspendedReason?: string;
  readonly suspendedAt?: Date;
  readonly suspendedBy?: string;
}
```

### 2.3 Subscription Model

```typescript
// packages/database/src/models/Subscription/Subscription.ts

export type SubscriptionPlan = 'free' | 'starter' | 'premium' | 'family' | 'enterprise';
export type SubscriptionStatus = 'active' | 'past_due' | 'cancelled' | 'expired' | 'trialing';

export interface ISubscriptionData {
  readonly userId: string;
  readonly plan: SubscriptionPlan;
  readonly status: SubscriptionStatus;
  readonly priceId?: string;
  
  // Billing Cycle
  readonly currentPeriodStart: Date;
  readonly currentPeriodEnd: Date;
  readonly billingCycle: 'monthly' | 'annual';
  
  // Trial
  readonly trialStart?: Date;
  readonly trialEnd?: Date;
  
  // Cancellation
  readonly cancelAtPeriodEnd: boolean;
  readonly cancelledAt?: Date;
  readonly cancellationReason?: string;
  
  // Payment
  readonly lastPaymentDate?: Date;
  readonly lastPaymentAmount?: number;
  readonly nextPaymentDate?: Date;
  readonly nextPaymentAmount?: number;
  
  // Stripe Integration
  readonly stripeSubscriptionId?: string;
  readonly stripeInvoiceId?: string;
  
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ISubscriptionEvent {
  readonly type: 'created' | 'upgraded' | 'downgraded' | 'renewed' | 'cancelled' | 'expired' | 'reactivated';
  readonly fromPlan?: SubscriptionPlan;
  readonly toPlan?: SubscriptionPlan;
  readonly reason?: string;
  readonly performedBy?: string; // admin user ID if manual
  readonly metadata?: Record<string, unknown>;
  readonly timestamp: Date;
}
```

### 2.4 Payment Model

```typescript
// packages/database/src/models/Payment/Payment.ts

export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'refunded' | 'disputed';
export type PaymentMethod = 'card' | 'bank_transfer' | 'paypal';

export interface IPaymentData {
  readonly userId: string;
  readonly subscriptionId?: string;
  
  // Amount
  readonly amount: number;
  readonly currency: string;
  readonly amountRefunded?: number;
  
  // Status
  readonly status: PaymentStatus;
  readonly failureReason?: string;
  
  // Payment Details
  readonly paymentMethod: PaymentMethod;
  readonly last4?: string;
  readonly brand?: string;
  
  // Stripe Integration
  readonly stripePaymentIntentId?: string;
  readonly stripeChargeId?: string;
  readonly stripeInvoiceId?: string;
  
  // Receipt
  readonly receiptUrl?: string;
  readonly receiptNumber?: string;
  
  // Refund Details
  readonly refundedAt?: Date;
  readonly refundedBy?: string;
  readonly refundReason?: string;
  
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
```

### 2.5 Communication Log Model

```typescript
// packages/database/src/models/CommunicationLog/CommunicationLog.ts

export type CommunicationChannel = 'email' | 'sms' | 'push' | 'in_app' | 'phone' | 'support_ticket';
export type CommunicationType = 'notification' | 'marketing' | 'support' | 'billing' | 'system';

export interface ICommunicationLogData {
  readonly userId: string;
  readonly channel: CommunicationChannel;
  readonly type: CommunicationType;
  
  // Content
  readonly subject?: string;
  readonly content: string;
  readonly templateId?: string;
  
  // Delivery Status
  readonly status: 'pending' | 'sent' | 'delivered' | 'failed' | 'bounced' | 'opened' | 'clicked';
  readonly deliveredAt?: Date;
  readonly openedAt?: Date;
  readonly clickedAt?: Date;
  readonly failureReason?: string;
  
  // Metadata
  readonly triggeredBy: 'system' | 'admin' | 'user_action';
  readonly adminUserId?: string;
  readonly relatedEntityType?: string;
  readonly relatedEntityId?: string;
  
  // Provider Details
  readonly providerId?: string; // SendGrid message ID, Twilio SID, etc.
  
  readonly createdAt: Date;
}
```

### 2.6 Admin Note Model

```typescript
// packages/database/src/models/AdminNote/AdminNote.ts

export interface IAdminNoteData {
  readonly userId: string;
  readonly adminUserId: string;
  readonly content: string;
  readonly category: 'general' | 'billing' | 'support' | 'technical' | 'compliance';
  readonly isInternal: boolean; // Visible only to admins
  readonly isPinned: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
```

---

## 3. Dashboard Pages

### 3.1 Main Dashboard (`/admin`)

**Purpose:** Overview of key metrics and alerts

**Components:**
- **KPI Cards:**
  - Total Customers (with trend)
  - Active Subscribers (by plan)
  - Monthly Recurring Revenue (MRR)
  - Churn Rate
  - New Signups (today/week/month)
  
- **Charts:**
  - Subscription growth over time
  - Revenue by plan
  - Churn analysis
  - User activity heatmap

- **Recent Activity Feed:**
  - New registrations
  - Subscription changes
  - Payment events
  - Support tickets

- **Alerts:**
  - Failed payments
  - Expiring subscriptions
  - High-priority support tickets
  - System errors

### 3.2 Customer List (`/admin/customers`)

**Purpose:** Browse, search, and filter all customers

**Features:**
- **Search:** Email, name, phone, customer ID
- **Filters:**
  - Subscription plan
  - Subscription status
  - Registration date range
  - Last active date range
  - Payment status
  - Verification status

- **Columns (configurable):**
  - Customer name & email
  - Subscription plan/status
  - MRR contribution
  - Students count
  - Last active
  - Registration date
  - Actions dropdown

- **Bulk Actions:**
  - Export to CSV
  - Send email campaign
  - Update subscription
  - Suspend accounts

**Wireframe:**
```
┌─────────────────────────────────────────────────────────────────────────┐
│ Customers                                      [+ Add Customer] [Export]│
├─────────────────────────────────────────────────────────────────────────┤
│ 🔍 Search customers...          [Plan ▼] [Status ▼] [Date ▼] [More ▼] │
├─────────────────────────────────────────────────────────────────────────┤
│ □ Name/Email         Plan      Status    Students  Last Active  Actions│
├─────────────────────────────────────────────────────────────────────────┤
│ □ John Smith         Premium   Active    3         2 hours ago   [•••] │
│   john@example.com   $19/mo                                             │
├─────────────────────────────────────────────────────────────────────────┤
│ □ Jane Doe           Starter   Active    1         1 day ago     [•••] │
│   jane@example.com   $9/mo                                              │
├─────────────────────────────────────────────────────────────────────────┤
│ □ Bob Wilson         Free      -         2         1 week ago    [•••] │
│   bob@example.com    -                                                  │
└─────────────────────────────────────────────────────────────────────────┘
│ Showing 1-25 of 1,234 customers            [< Previous] [1] [2] [Next >]│
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Customer Detail (`/admin/customers/[id]`)

**Purpose:** Complete view of a single customer

**Tabs:**

#### Overview Tab
- Customer profile (name, email, phone, verification status)
- Account status (active, suspended)
- Quick actions (login as user, send email, suspend)
- Recent activity timeline

#### Subscription Tab
- Current plan details
- Billing cycle & next payment
- Plan change history
- Actions: Upgrade, Downgrade, Cancel, Extend trial

#### Payments Tab
- Payment history table
- Total lifetime value
- Refund history
- Actions: Issue refund, Add credit

#### Students Tab
- List of students under this account
- Student statistics
- Recent alerts per student

#### Communication Tab
- Communication log (all channels)
- Send new communication
- Template selector

#### Notes Tab
- Admin notes history
- Add new note
- Pin important notes

**Wireframe:**
```
┌─────────────────────────────────────────────────────────────────────────┐
│ ← Back to Customers                                                     │
├─────────────────────────────────────────────────────────────────────────┤
│ John Smith                                    [Login as User] [Suspend] │
│ john@example.com • Premium Plan • Active since Jan 2024                 │
├─────────────────────────────────────────────────────────────────────────┤
│ [Overview] [Subscription] [Payments] [Students] [Communication] [Notes] │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐│
│  │ Subscription       │  │ Lifetime Value     │  │ Students           ││
│  │ Premium - $19/mo   │  │ $247.00            │  │ 3 active           ││
│  │ Renews Mar 15      │  │ 13 payments        │  │ 42 alerts          ││
│  └────────────────────┘  └────────────────────┘  └────────────────────┘│
│                                                                         │
│  Recent Activity                                                        │
│  ─────────────────────────────────────────────────────────────────────  │
│  • Mar 10, 2:34 PM - Logged in                                         │
│  • Mar 10, 2:30 PM - Acknowledged alert "Math homework due"            │
│  • Mar 9, 8:15 AM - Added new student "Emma Smith"                     │
│  • Mar 8, 3:00 PM - Updated notification preferences                   │
│  • Mar 1, 12:00 PM - Payment $19.00 succeeded                          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.4 Payments & Billing (`/admin/payments`)

**Purpose:** Financial overview and payment management

**Sections:**
- **Summary Cards:**
  - Total Revenue (MTD/YTD)
  - MRR
  - Average Revenue Per User (ARPU)
  - Outstanding Invoices

- **Payment List:**
  - All transactions
  - Filter by status, date, amount
  - Quick refund action

- **Failed Payments:**
  - Retry payment
  - Contact customer
  - Automatic dunning status

### 3.5 Subscriptions (`/admin/subscriptions`)

**Purpose:** Subscription analytics and management

**Features:**
- Subscription by plan breakdown
- Trial conversions
- Churn analysis
- Upcoming renewals
- Expiring subscriptions

### 3.6 Communication Center (`/admin/communications`)

**Purpose:** Send and track communications

**Features:**
- Send individual or bulk emails
- SMS campaigns
- Template management
- Delivery tracking
- Open/click analytics

### 3.7 Reports & Analytics (`/admin/reports`)

**Purpose:** Business intelligence and reporting

**Reports:**
- Revenue reports
- Customer growth
- Churn analysis
- Feature usage
- Alert effectiveness
- Support metrics

### 3.8 System Settings (`/admin/settings`)

**Purpose:** Platform configuration (Super Admin only)

**Sections:**
- Admin user management
- Plan pricing configuration
- Email template management
- Integration settings
- Feature flags
- Audit logs

---

## 4. API Endpoints

### 4.1 Admin Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/auth/login` | Admin login with MFA |
| POST | `/api/admin/auth/logout` | Admin logout |
| POST | `/api/admin/auth/refresh` | Refresh token |
| POST | `/api/admin/auth/mfa/setup` | Setup MFA |
| POST | `/api/admin/auth/mfa/verify` | Verify MFA code |

### 4.2 Customer Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/customers` | List customers (paginated) |
| GET | `/api/admin/customers/:id` | Get customer details |
| PUT | `/api/admin/customers/:id` | Update customer |
| DELETE | `/api/admin/customers/:id` | Delete customer |
| POST | `/api/admin/customers/:id/suspend` | Suspend customer |
| POST | `/api/admin/customers/:id/unsuspend` | Unsuspend customer |
| POST | `/api/admin/customers/:id/impersonate` | Login as customer |

### 4.3 Subscription Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/subscriptions` | List all subscriptions |
| GET | `/api/admin/subscriptions/:id` | Get subscription details |
| PUT | `/api/admin/subscriptions/:id/plan` | Change plan |
| POST | `/api/admin/subscriptions/:id/cancel` | Cancel subscription |
| POST | `/api/admin/subscriptions/:id/reactivate` | Reactivate subscription |
| POST | `/api/admin/subscriptions/:id/extend-trial` | Extend trial period |

### 4.4 Payment Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/payments` | List payments |
| GET | `/api/admin/payments/:id` | Get payment details |
| POST | `/api/admin/payments/:id/refund` | Issue refund |
| POST | `/api/admin/payments/:id/retry` | Retry failed payment |
| GET | `/api/admin/invoices` | List invoices |
| POST | `/api/admin/invoices/:id/send` | Send invoice email |

### 4.5 Communication

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/communications` | List communications |
| POST | `/api/admin/communications/send` | Send communication |
| GET | `/api/admin/communications/templates` | List templates |
| POST | `/api/admin/communications/templates` | Create template |
| PUT | `/api/admin/communications/templates/:id` | Update template |

### 4.6 Admin Notes

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/customers/:id/notes` | List customer notes |
| POST | `/api/admin/customers/:id/notes` | Add note |
| PUT | `/api/admin/notes/:id` | Update note |
| DELETE | `/api/admin/notes/:id` | Delete note |

### 4.7 Reports & Analytics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/analytics/overview` | Dashboard stats |
| GET | `/api/admin/analytics/revenue` | Revenue metrics |
| GET | `/api/admin/analytics/customers` | Customer metrics |
| GET | `/api/admin/analytics/subscriptions` | Subscription metrics |
| GET | `/api/admin/reports/export` | Export reports |

### 4.8 System Administration

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/users` | List admin users |
| POST | `/api/admin/users` | Create admin user |
| PUT | `/api/admin/users/:id` | Update admin user |
| DELETE | `/api/admin/users/:id` | Delete admin user |
| GET | `/api/admin/audit-logs` | View audit logs |
| GET | `/api/admin/system/health` | System health check |

---

## 5. Security Requirements

### 5.1 Authentication
- Separate admin authentication from customer auth
- Mandatory Multi-Factor Authentication (MFA)
- Session timeout after 30 minutes of inactivity
- IP allowlisting option for admin access

### 5.2 Authorization
- Role-based access control (RBAC)
- Audit logging for all admin actions
- Separate admin JWT with elevated permissions
- Permission checks on every API call

### 5.3 Data Protection
- Mask sensitive data (full email, phone, card numbers)
- Customer impersonation requires MFA re-verification
- All admin actions logged with admin user ID
- Refund/deletion requires reason documentation

### 5.4 Audit Trail

Every admin action must be logged:

```typescript
interface IAuditLog {
  readonly adminUserId: string;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly changes?: Record<string, { old: unknown; new: unknown }>;
  readonly ipAddress: string;
  readonly userAgent: string;
  readonly timestamp: Date;
}
```

---

## 6. Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Admin user model and repository
- [ ] Admin authentication with MFA
- [ ] Role-based permission system
- [ ] Audit logging infrastructure
- [ ] Basic admin layout and navigation

### Phase 2: Customer Management (Week 3-4)
- [ ] Customer list page with search/filter
- [ ] Customer detail page
- [ ] Suspend/unsuspend functionality
- [ ] Admin notes system
- [ ] Customer impersonation

### Phase 3: Billing & Subscriptions (Week 5-6)
- [ ] Payment history integration
- [ ] Subscription management
- [ ] Refund processing
- [ ] Invoice generation
- [ ] Stripe webhook integration

### Phase 4: Communication (Week 7)
- [ ] Communication log viewer
- [ ] Send email/SMS to customer
- [ ] Template management
- [ ] Bulk communication

### Phase 5: Analytics & Reports (Week 8)
- [ ] Dashboard KPIs
- [ ] Revenue reports
- [ ] Customer analytics
- [ ] Export functionality

### Phase 6: Polish & Security (Week 9)
- [ ] Security audit
- [ ] Performance optimization
- [ ] Documentation
- [ ] E2E tests for admin flows

---

## 7. Technology Stack

### Frontend
- Next.js 14 (separate `/admin` route group)
- shadcn/ui components
- Tailwind CSS
- Recharts for analytics
- TanStack Table for data grids

### Backend
- Express.js API routes under `/api/admin`
- Separate admin auth middleware
- Rate limiting for admin APIs
- Redis for admin session caching

### Database
- MongoDB collections:
  - `admin_users`
  - `subscriptions`
  - `payments`
  - `communication_logs`
  - `admin_notes`
  - `audit_logs`

### Integrations
- Stripe for payment processing
- SendGrid for transactional email
- Twilio for SMS

---

## 8. Success Metrics

| Metric | Target |
|--------|--------|
| Admin page load time | < 2 seconds |
| Search response time | < 500ms |
| Export generation | < 30 seconds for 10k records |
| Audit log completeness | 100% of admin actions |
| MFA adoption | 100% of admin users |

---

## 9. Next Steps

1. **Review and approve specification**
2. **Create admin database models**
3. **Implement admin authentication**
4. **Build customer list page**
5. **Add billing integration**
6. **Deploy to staging environment**
7. **Security audit**
8. **Production deployment**

---

## Appendix A: UI Component Library

All admin pages will use these consistent components:

- `AdminLayout` - Main layout with sidebar
- `DataTable` - Paginated, sortable, filterable table
- `CustomerCard` - Customer summary card
- `StatCard` - KPI display card
- `ActivityTimeline` - Recent activity list
- `ActionMenu` - Dropdown with actions
- `SearchInput` - Global search component
- `FilterPanel` - Advanced filter sidebar
- `ConfirmDialog` - Action confirmation modal
- `NoteEditor` - Rich text note editor

## Appendix B: Sample Database Indexes

```javascript
// MongoDB indexes for admin queries
db.users.createIndex({ email: 1 });
db.users.createIndex({ "subscription.plan": 1, "subscription.status": 1 });
db.users.createIndex({ createdAt: -1 });
db.users.createIndex({ lastActive: -1 });
db.users.createIndex({ name: "text", email: "text" }); // Full-text search

db.payments.createIndex({ userId: 1, createdAt: -1 });
db.payments.createIndex({ status: 1, createdAt: -1 });

db.communication_logs.createIndex({ userId: 1, createdAt: -1 });
db.communication_logs.createIndex({ status: 1, channel: 1 });

db.audit_logs.createIndex({ adminUserId: 1, timestamp: -1 });
db.audit_logs.createIndex({ entityType: 1, entityId: 1 });
```


