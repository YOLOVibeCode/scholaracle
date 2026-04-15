---
id: TC-ALR-002
title: "Student-scoped alerts in student view mode"
priority: medium
labels: [alerts, students, view-mode]
depends: [TC-ALR-001, TC-GRD-005]
suite: alerts
---

{traklet:section:objective}
## Objective
Verify the alerts page within student view mode shows only alerts for that specific student.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- User is logged in with multiple students
- Multiple alerts exist across different students
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Login → `/dashboard`
2. Navigate to `/dashboard/students/[id]/view/alerts`
3. Compare alert list with the global `/dashboard/alerts` page
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- Only alerts for the selected student are shown
- Filters still work within the scoped set
- Acknowledge function works the same as global alerts
{/traklet:section:expected-result}
