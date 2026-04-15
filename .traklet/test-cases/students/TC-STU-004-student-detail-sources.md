---
id: TC-STU-004
title: "Student detail page - Data Sources tab"
priority: high
labels: [students, detail, sources, integrations]
depends: [TC-STU-002]
suite: students
---

{traklet:section:objective}
## Objective
Verify the Sources tab shows connected data sources and allows connecting new ones via the wizard.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- User is logged in
- At least one student exists
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Login → `/dashboard`
2. Navigate to **Students** → `/dashboard/students`
3. Click a student → `/dashboard/students/[id]?tab=sources`
4. Click the **Sources** tab
5. Observe connected sources list
6. Click **Connect Source** to launch ConnectSourceWizard
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- Tab shows list of linked data sources (Canvas, Skyward, etc.) or "No sources connected"
- ConnectSourceWizard launches when adding a new source
- Credentials can be managed via SourceCredentialsSheet
- Sync history is accessible via SyncHistorySheet
{/traklet:section:expected-result}
