---
id: TC-ADM-007
title: "Admin payments - list and issue refunds"
priority: high
labels: [admin, payments, refunds]
depends: [TC-ADM-001]
suite: admin
---

{traklet:section:objective}
## Objective
Verify admin can view all payments and issue refunds.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- Admin user is logged in
- Payments exist in the system
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Admin login → navigate to **Payments** → `/admin/payments`
2. Review the payments table
3. Select a payment and open PaymentRefundPanel
4. Enter refund amount and reason
5. Submit refund
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- Payments table shows all transactions with customer, amount, date, status
- PaymentRefundPanel allows full or partial refund
- Refund processes via adminPaymentsApi
- Payment status updates to "Refunded" or "Partially Refunded"
{/traklet:section:expected-result}
