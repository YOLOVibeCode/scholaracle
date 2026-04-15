---
id: TC-ADM-003
title: "Admin customers - searchable paginated list"
priority: high
labels: [admin, customers, list]
depends: [TC-ADM-001]
suite: admin
---

{traklet:section:objective}
## Objective
Verify the admin customers page shows a searchable, paginated table of all parent/customer accounts.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- Admin user is logged in
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Admin login → `/admin/dashboard`
2. Navigate to **Customers** in admin sidebar → `/admin/customers`
3. Search for a customer by name or email
4. Navigate through pages
5. Toggle column visibility
6. Click a customer row to view detail
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- DataTable renders all customers with name, email, subscription status, created date
- Search filters results in real-time (query param `?search=`)
- Pagination works (`?page=`)
- Column visibility toggles show/hide columns
- Clicking a row navigates to `/admin/customers/[id]`
{/traklet:section:expected-result}
