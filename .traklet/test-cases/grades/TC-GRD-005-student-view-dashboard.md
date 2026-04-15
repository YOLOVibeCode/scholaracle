---
id: TC-GRD-005
title: "Student view mode - per-student dashboard"
priority: high
labels: [students, view-mode, dashboard]
depends: [TC-AUTH-001, TC-STU-002]
suite: grades
---

{traklet:section:objective}
## Objective
Verify the "student view" mode shows a per-student dashboard with action board, filtered alerts, and agenda.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- User is logged in with at least one student
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Login → `/dashboard`
2. Navigate to `/dashboard/students/[id]/view`
3. Observe the student-scoped dashboard
4. Navigate sub-sections via student view navigation:
   - `/dashboard/students/[id]/view` (action board)
   - `/dashboard/students/[id]/view/alerts` (student alerts)
   - `/dashboard/students/[id]/view/agenda` (student agenda)
   - `/dashboard/students/[id]/view/emails` (student emails)
   - `/dashboard/students/[id]/view/todo` (student to-do)
   - `/dashboard/students/[id]/view/courses` (courses stub)
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- ViewingAsBanner shows which student is selected
- ActionBoard shows action items scoped to this student
- Each sub-page filters data by StudentViewContext to only this student
- Alerts page shows only alerts for this student
- Agenda shows only this student's upcoming items
- Email history is scoped to this student's ID
- Todo page shows workflow assignments with status update controls
{/traklet:section:expected-result}
