---
id: TC-ADM-004
title: "Admin customer detail - tabs (overview, subscription, payments, students, notes)"
priority: high
labels: [admin, customers, detail]
depends: [TC-ADM-003]
suite: admin
---

{traklet:section:objective}
## Objective
Verify the admin customer detail page shows all tabs with correct data and actions.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- Admin user is logged in
- At least one customer exists
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Navigate to `/admin/customers/[id]`
2. Review each tab:
   a. **Overview** (CustomerOverviewTab): name, email, status, registration date
   b. **Subscription** (CustomerSubscriptionTab): plan, billing cycle, status
   c. **Payments** (CustomerPaymentsTab): payment history, refund options
   d. **Students** (CustomerStudentsTab): students linked to this customer
   e. **Notes** (CustomerNotesTab): admin notes and activity
3. Test available actions:
   - Password reset for customer
   - Suspend/unsuspend customer (CustomerSuspendPanel)
   - Activity timeline (CustomerActivityTimeline)
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- Each tab loads correct data from adminCustomersApi.getById + getActivity
- Overview shows read-only customer profile
- Subscription tab shows plan details with change/cancel actions
- Payments tab shows transaction history
- Students tab lists the customer's enrolled students
- Notes tab allows adding admin notes
- Password reset sends email to customer
- Suspend disables customer access; unsuspend restores it
{/traklet:section:expected-result}
