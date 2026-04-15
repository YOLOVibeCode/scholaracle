---
id: TC-PUB-002
title: "Pricing page with plan cards and coupon validation"
priority: high
labels: [public, pricing, billing]
suite: public
---

{traklet:section:objective}
## Objective
Verify the pricing page displays plan options with monthly/annual toggle and coupon validation.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- No login required (public route)
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Navigate to `/pricing`
2. Review the pricing plan cards
3. Toggle between monthly and annual billing
4. Enter a coupon code and validate
5. Click a **Get Started** / **Upgrade** button on a plan
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- Plan cards show features, price, and billing cycle
- Monthly/annual toggle updates displayed prices
- Coupon validates via billingApi.validateCoupon; valid coupon shows discount
- Clicking a plan button navigates to `/dashboard/billing?upgrade=<plan>&cycle=<cycle>&coupon=<code>`
- If not logged in, user is directed to login first
{/traklet:section:expected-result}
