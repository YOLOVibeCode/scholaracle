# Scholaracle Monetization Plan

## Conversion Strategy: Value-First

**Let users experience value before asking for money.** Every new account starts on Free. Users can add their first student, connect a data source, and see real grades/alerts flowing before any paywall appears. The moment they try to add a second student or access a gated feature, they see a clear upgrade prompt.

## Plans & Pricing

| Plan | Monthly | Annual | Students | Key Features |
|------|---------|--------|----------|-------------|
| **Free** | $0 | $0 | 1 | Email alerts, 7-day history |
| **Starter** | $9/mo | $90/yr | 2 | + SMS, 30-day history, LMS sync |
| **Premium** | $19/mo | $190/yr | 5 | + Analytics, priority support, unlimited history |
| **Family** | $29/mo | $290/yr | 10 | + Everything in Premium for larger families |
| **Enterprise** | $99/mo | $990/yr | Unlimited | + Dedicated support, custom integrations |

Annual = ~2 months free (16-17% discount).

## User Journey

```
Register → Free plan (auto)
  → Add first student ✅ (free)
  → Connect data source ✅ (free)
  → See grades & alerts ✅ (free)
  → Try to add 2nd student → "Upgrade to Starter" prompt
  → Try SMS alerts → "Upgrade to Starter" prompt
  → Try analytics → "Upgrade to Premium" prompt
```

## Feature Gates (What Triggers Upgrade)

| Gate | Free | Starter | Premium+ |
|------|------|---------|----------|
| Student count | 1 | 2 | 5/10/∞ |
| Email alerts | ✅ | ✅ | ✅ |
| SMS alerts | ❌ | ✅ | ✅ |
| Push notifications | ❌ | ✅ | ✅ |
| Data history | 7 days | 30 days | Unlimited |
| Advanced analytics | ❌ | ❌ | ✅ |
| Priority support | ❌ | ❌ | ✅ |

## Coupon Code System

### Types

| Type | Effect | Use Case |
|------|--------|----------|
| **trial_extension** | Extend free trial by N days on any paid plan | Beta testers, early adopters |
| **percent_off** | N% discount (recurring or one-time) | Promotions, referrals |
| **amount_off** | $N off (recurring or one-time) | Partner deals |
| **free_plan** | Grant a paid plan at $0 for N months or forever | Internal testing, VIP users |

### Coupon Fields

- `code` — Unique alphanumeric code (e.g. `BETA2026`, `FRIEND20`)
- `type` — trial_extension | percent_off | amount_off | free_plan
- `value` — Percentage, dollar amount, days, or months depending on type
- `plan` — Optional: restrict to specific plan (null = any plan)
- `duration` — `once` | `repeating` | `forever`
- `durationMonths` — For repeating: how many months
- `maxRedemptions` — Total uses allowed (null = unlimited)
- `redemptionCount` — Current usage count
- `expiresAt` — Hard expiry date (null = no expiry)
- `isActive` — Manual enable/disable toggle
- `createdBy` — Admin who created it

### Admin Capabilities

- Create coupon with all fields
- View all coupons with usage stats
- Disable/enable coupons
- See which users redeemed each coupon
- Quick-create presets: "Beta Tester (3 months free)", "20% Off First Year"

### User Flow

1. Pricing page or billing page shows "Have a coupon code?" input
2. User enters code → API validates (exists, active, not expired, not maxed out)
3. Valid: shows discount preview ("20% off — you'll pay $7.20/mo instead of $9/mo")
4. User proceeds to checkout with discount applied
5. Coupon recorded on subscription + payment metadata

## Admin Dashboard Additions

### Coupons Page (`/admin/coupons`)

- Table: Code, Type, Value, Plan, Redemptions/Max, Status, Expires, Created
- Actions: Create, Edit, Disable/Enable, View Redemptions
- Quick filters: Active, Expired, Exhausted

### Revenue Metrics (existing analytics page)

- Coupon redemption count and revenue impact
- MRR with/without discounts

## Implementation Order

1. **Coupon model + repository** (database)
2. **Coupon API** (validate, apply, admin CRUD)
3. **Admin coupons page** (UI)
4. **Checkout integration** (coupon input on pricing/billing pages)
5. **Plan enforcement middleware** (student count, feature gates)
6. **Fix pricing page** (align with DB prices, add coupon input)
