---
id: TC-ADM-009
title: "Admin analytics - detailed revenue and growth charts"
priority: medium
labels: [admin, analytics, charts]
depends: [TC-ADM-001]
suite: admin
---

{traklet:section:objective}
## Objective
Verify the admin analytics page shows deeper analytics with revenue, growth, and subscriber charts.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- Admin user is logged in
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Admin login → navigate to **Analytics** → `/admin/analytics`
2. Review overview, revenue, and growth chart sections
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- Recharts renders revenue trends, subscriber growth, churn analysis
- Multiple chart types (line, bar, area) display correctly
- Data loaded from adminAnalyticsApi endpoints
- Date range filters work if present
{/traklet:section:expected-result}
