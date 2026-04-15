---
id: TC-ADM-013
title: "Admin settings - admin user management with step-up auth"
priority: high
labels: [admin, settings, users, security]
depends: [TC-ADM-001]
suite: admin
---

{traklet:section:objective}
## Objective
Verify admin settings page allows managing admin user accounts with step-up authentication.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- Admin user is logged in with sufficient privileges
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Admin login → navigate to **Settings** → `/admin/settings`
2. Review the admin users list
3. Click **Create Admin User**
4. Enter email, name, role
5. AdminStepUpSheet prompts for re-authentication
6. Complete the step-up and submit
7. Edit an existing admin user's role
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- Admin users list shows all admin accounts with name, email, role, last login
- Create form validates required fields
- Step-up auth (AdminStepUpSheet) required before creating/editing users
- New admin user receives invitation
- Role changes take effect immediately
{/traklet:section:expected-result}
