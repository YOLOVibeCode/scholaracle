---
id: TC-ADM-002
title: "Admin dashboard - KPIs and revenue charts"
priority: high
labels: [admin, dashboard, analytics]
depends: [TC-ADM-001]
suite: admin
---

{traklet:section:objective}
## Objective
Verify the admin dashboard shows MRR, KPIs, and revenue charts (Recharts).
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- Admin user is logged in
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Login as admin → `/admin/login`
2. Arrive at `/admin/dashboard` (auto-redirect from `/admin`)
3. Review the dashboard metrics and charts
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- MRR (Monthly Recurring Revenue) displayed
- KPI cards show subscriber count, churn rate, etc.
- Recharts revenue and subscription charts render correctly
- Data loaded via adminAnalyticsApi (overview, revenue, subscriptions)
{/traklet:section:expected-result}
