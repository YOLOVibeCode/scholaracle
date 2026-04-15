---
id: TC-BIL-001
title: "Billing page shows subscription and invoices"
priority: high
labels: [billing, subscription, invoices]
depends: [TC-AUTH-001]
suite: billing
---

{traklet:section:objective}
## Objective
Verify the billing page displays current subscription status, checkout/upgrade flows, and invoice history.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- User is logged in
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Login → `/dashboard`
2. Navigate to **Billing** via sidebar → `/dashboard/billing`
3. Review current subscription plan and status
4. Review invoice history
5. Click **Upgrade** or **Change Plan** (if available)
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- Current subscription plan, status, and renewal date are shown
- Invoice list with date, amount, status, download link
- Upgrade button opens Stripe checkout (billingApi)
- Coupon field allows redeeming discount codes
- Query params `?upgrade=&cycle=&coupon=` from pricing page auto-trigger upgrade flow
{/traklet:section:expected-result}
