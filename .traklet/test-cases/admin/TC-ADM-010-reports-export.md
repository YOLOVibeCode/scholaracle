---
id: TC-ADM-010
title: "Admin reports - date range selection and CSV export"
priority: medium
labels: [admin, reports, export]
depends: [TC-ADM-001]
suite: admin
---

{traklet:section:objective}
## Objective
Verify admin can select date ranges and export reports as CSV.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- Admin user is logged in
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Admin login → navigate to **Reports** → `/admin/reports`
2. Select a date range (start and end date)
3. Click an export button (e.g., "Export Customers CSV", "Export Revenue CSV")
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- Date inputs accept valid ranges
- CSV download triggers via adminReportsApi
- Downloaded file contains correct columns and data for the date range
- Multiple report types available (customers, revenue, subscriptions)
{/traklet:section:expected-result}
