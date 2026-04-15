---
id: TC-ADM-008
title: "Admin coupons - CRUD operations"
priority: medium
labels: [admin, coupons, billing]
depends: [TC-ADM-001]
suite: admin
---

{traklet:section:objective}
## Objective
Verify admin can create, list, and manage coupon codes.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- Admin user is logged in
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Admin login → navigate to **Coupons** → `/admin/coupons`
2. Review existing coupons in the DataTable
3. Click **Create Coupon**
4. Enter code, discount type (percentage/fixed), amount, expiration, usage limits
5. Save the coupon
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- Coupon list shows code, discount, usage count, expiration, status
- Create form validates required fields
- New coupon appears in the list after creation
- Coupon can be used on the billing page (TC-BIL-002)
{/traklet:section:expected-result}
