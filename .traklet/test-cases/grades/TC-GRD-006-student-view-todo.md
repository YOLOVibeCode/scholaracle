---
id: TC-GRD-006
title: "Student view - Todo page with assignment status updates"
priority: medium
labels: [students, view-mode, todo, workflow]
depends: [TC-GRD-005]
suite: grades
---

{traklet:section:objective}
## Objective
Verify the student-view todo page shows grouped assignments with status update controls and deep-link highlight.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- User is in student view mode for a student with assignments
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Navigate to `/dashboard/students/[id]/view/todo`
2. Observe the todo sections (grouped by due date or status)
3. Change an assignment's status using the status dropdown
4. Navigate with `?highlight=<assignmentId>` to auto-scroll to a specific item
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- Assignments grouped into sections (overdue, today, upcoming, completed)
- Each TodoCard shows assignment name, course, due date, current status
- Status dropdown allows changing status (via updateAssignmentStatus API)
- `?highlight=` query parameter scrolls to and highlights the target assignment
{/traklet:section:expected-result}
