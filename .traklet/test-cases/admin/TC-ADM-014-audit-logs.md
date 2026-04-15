---
id: TC-ADM-014
title: "Admin audit logs - filterable list with export"
priority: medium
labels: [admin, audit, security, compliance]
depends: [TC-ADM-001]
suite: admin
---

{traklet:section:objective}
## Objective
Verify the audit log page shows all admin actions with filtering, detail view, and export.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- Admin user is logged in
- Admin actions have been performed (creating users, impersonating, etc.)
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Admin login → navigate to **Audit Logs** → `/admin/audit-logs`
2. Review the paginated audit log table
3. Use filters (date range, admin user, action type)
4. Click a log entry to open AuditLogDetailSheet
5. Click **Export** (requires step-up auth)
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- Table shows action, admin user, target, timestamp, IP address
- Filters narrow results by criteria
- AuditLogDetailSheet shows full event details (request/response data)
- Export downloads CSV after step-up re-authentication
- All data from adminAuditLogsApi
{/traklet:section:expected-result}
