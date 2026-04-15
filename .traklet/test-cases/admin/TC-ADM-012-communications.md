---
id: TC-ADM-012
title: "Admin communications - send, templates, bulk send, logs"
priority: medium
labels: [admin, communications, email]
depends: [TC-ADM-001]
suite: admin
---

{traklet:section:objective}
## Objective
Verify admin can send communications, manage templates, perform bulk sends, and view logs.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- Admin user is logged in
- AdminStepUpSheet may be required for sensitive actions
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Admin login → navigate to **Communications** → `/admin/communications`
2. Review communication templates
3. Compose and send a new communication to a customer/group
4. Perform a bulk send
5. Review communication logs
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- Templates list available email/SMS templates
- Compose form allows selecting recipients, template, and customization
- Bulk send targets a group (all customers, active subscribers, etc.)
- Logs table shows sent communications with status, timestamp
- AdminStepUpSheet prompts for re-authentication before sensitive actions
{/traklet:section:expected-result}
