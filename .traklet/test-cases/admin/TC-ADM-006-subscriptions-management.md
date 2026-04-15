---
id: TC-ADM-006
title: "Admin subscriptions - list, cancel, extend trial, change plan"
priority: high
labels: [admin, subscriptions, billing]
depends: [TC-ADM-001]
suite: admin
---

{traklet:section:objective}
## Objective
Verify admin can manage all subscriptions: view, cancel, extend trials, and change plans.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- Admin user is logged in
- Subscriptions exist in the system
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Admin login → navigate to **Subscriptions** → `/admin/subscriptions`
2. Review the subscriptions table
3. Open SubscriptionCancelPanel → cancel a subscription
4. Open SubscriptionExtendTrialPanel → extend a trial period
5. Open SubscriptionPlanChangePanel → change a customer's plan
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- Table shows all subscriptions with customer, plan, status, dates
- Cancel: confirmation dialog, subscription marked cancelled
- Extend trial: new trial end date set
- Plan change: new plan applied with prorated billing
- All actions persist via adminSubscriptionsApi
{/traklet:section:expected-result}
