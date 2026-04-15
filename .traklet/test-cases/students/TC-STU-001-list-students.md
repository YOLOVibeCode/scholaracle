---
id: TC-STU-001
title: "Students list page displays all enrolled students"
priority: critical
labels: [students, list, smoke]
depends: [TC-AUTH-001]
suite: students
---

{traklet:section:objective}
## Objective
Verify the students list page shows all students with actions for edit, view, and delete.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- User is logged in
- User has at least one student
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Login → `/dashboard`
2. Navigate to **Students** via sidebar → `/dashboard/students`
3. Observe the student grid/list
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- All enrolled students are displayed in a grid/card layout
- Each student card shows name and basic info
- Actions available: edit (links to `/dashboard/students/[id]`), view-as-student, delete
- "Add Student" button is visible
{/traklet:section:expected-result}
