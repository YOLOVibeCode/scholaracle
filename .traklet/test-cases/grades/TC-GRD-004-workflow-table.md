---
id: TC-GRD-004
title: "Assignment workflow table with filters and status updates"
priority: high
labels: [grades, workflow, assignments]
depends: [TC-AUTH-001, TC-STU-002]
suite: grades
---

{traklet:section:objective}
## Objective
Verify the workflow page shows all assignments with filters, status tracking, and detail drawer.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- User is logged in with a student who has assignments
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Login → `/dashboard`
2. Navigate to `/dashboard/students/[id]/workflow`
3. Observe the AssignmentWorkflowTable
4. Use WorkflowFilterBar to filter by status, course, or date range
5. Click an assignment row to open AssignmentWorkflowDetail
6. Update assignment status or add notes
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- WorkflowFilterBar allows filtering by status (not started, in progress, submitted, graded), course, and date
- Summary chips show counts per status
- AssignmentWorkflowTable lists assignments matching current filters
- Clicking a row opens detail with notes/status update capability
- Status changes persist via API
{/traklet:section:expected-result}
