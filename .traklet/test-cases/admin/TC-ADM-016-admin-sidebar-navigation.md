---
id: TC-ADM-016
title: "Admin sidebar navigation links work correctly"
priority: high
labels: [admin, navigation, smoke]
depends: [TC-ADM-001]
suite: admin
---

{traklet:section:objective}
## Objective
Verify all admin sidebar navigation links route to the correct pages.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- Admin user is logged in
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Admin login → `/admin/dashboard`
2. Click each sidebar link and verify:
   - Dashboard → `/admin/dashboard`
   - Customers → `/admin/customers`
   - Subscriptions → `/admin/subscriptions`
   - Payments → `/admin/payments`
   - Coupons → `/admin/coupons`
   - Analytics → `/admin/analytics`
   - Reports → `/admin/reports`
   - Scrapers → `/admin/scrapers`
   - Communications → `/admin/communications`
   - Settings → `/admin/settings`
   - Audit Logs → `/admin/audit-logs`
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- Each link navigates correctly
- Page content loads without errors
- Active link is highlighted
- No unauthorized access errors for any admin page
{/traklet:section:expected-result}
