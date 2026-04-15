---
id: TC-ADM-005
title: "Admin impersonate customer"
priority: high
labels: [admin, impersonate, security]
depends: [TC-ADM-003]
suite: admin
---

{traklet:section:objective}
## Objective
Verify an admin can impersonate a customer to view their dashboard as that user.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- Admin user is logged in
- Target customer exists
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Navigate to `/admin/customers/[id]` or find the impersonate link
2. Click **Impersonate** for the target customer
3. Page navigates to `/admin/impersonate/[id]`
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- adminCustomersApi.impersonate exchanges admin token for customer JWT
- Customer JWT is set in cookie, localStorage, and apiClient
- Redirect to `/dashboard` showing the customer's actual dashboard
- ViewingAsBanner indicates admin is impersonating
- Admin can return to admin panel when done
{/traklet:section:expected-result}
