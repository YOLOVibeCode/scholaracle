---
id: TC-INT-003
title: "Integration detail page with linked students and sync controls"
priority: high
labels: [integrations, detail, sync]
depends: [TC-INT-002]
suite: integrations
---

{traklet:section:objective}
## Objective
Verify the integration detail page shows linked students, credentials, sync history, and manual sync controls.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- User is logged in
- At least one integration is connected
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Navigate to `/dashboard/integrations`
2. Click on an integration card → `/dashboard/integrations/[id]`
3. Review the integration detail sections:
   a. Linked students table
   b. Assign new student button
   c. Credentials management
   d. Sync history / run logs
   e. Manual sync trigger
   f. Unlink student / delete integration
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- DataTable shows all students linked to this integration
- AssignStudentSheet allows linking additional students
- Credentials section allows updating (via ConnectToIntegrationSheet)
- Sync history shows past runs with status, duration, record counts
- "Trigger Sync" button starts a manual sync
- Unlink student removes the association without deleting the student
{/traklet:section:expected-result}
