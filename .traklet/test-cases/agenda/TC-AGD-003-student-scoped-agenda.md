---
id: TC-AGD-003
title: "Student-scoped agenda in student view mode"
priority: medium
labels: [agenda, students, view-mode]
depends: [TC-AGD-001, TC-GRD-005]
suite: agenda
---

{traklet:section:objective}
## Objective
Verify the agenda within student view shows only items for that specific student.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- User is logged in with multiple students
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Navigate to `/dashboard/students/[id]/view/agenda`
2. Observe agenda items
3. Use filter bar within the scoped view
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- Only items for the selected student are displayed
- Filter bar still works within the student's items
- Snooze works the same as the global agenda
{/traklet:section:expected-result}
