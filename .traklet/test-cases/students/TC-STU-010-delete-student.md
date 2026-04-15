---
id: TC-STU-010
title: "Delete a student with confirmation dialog"
priority: high
labels: [students, delete, destructive]
depends: [TC-STU-002]
suite: students
---

{traklet:section:objective}
## Objective
Verify a student can be deleted with a confirmation dialog, removing all associated data.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- User is logged in with at least one student
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Login → `/dashboard`
2. Navigate to **Students** → `/dashboard/students`
3. Click the delete icon/button on a student card
4. ConfirmDialog appears asking to confirm deletion
5. Click **Confirm** / **Delete**
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- ConfirmDialog is shown with student name and warning about data loss
- On confirm: student is removed via studentsApi.delete
- Student disappears from the list
- On cancel: nothing changes
{/traklet:section:expected-result}
