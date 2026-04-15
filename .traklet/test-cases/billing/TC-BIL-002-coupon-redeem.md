---
id: TC-BIL-002
title: "Redeem a coupon code on billing page"
priority: medium
labels: [billing, coupons]
depends: [TC-BIL-001]
suite: billing
---

{traklet:section:objective}
## Objective
Verify a valid coupon code can be applied to a subscription via the billing page.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- User is logged in and on the billing page
- A valid coupon code exists in the system
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Navigate to `/dashboard/billing`
2. Enter a coupon code in the coupon field
3. Click **Apply** or **Validate**
4. Proceed with checkout
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- Valid coupon: discount amount/percentage shown, applied to checkout
- Invalid coupon: error message "Invalid or expired coupon"
- Coupon is validated via billingApi.validateCoupon before applying
{/traklet:section:expected-result}
