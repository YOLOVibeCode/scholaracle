---
id: TC-STU-005
title: "Student detail page - Alerts tab"
priority: medium
labels: [students, detail, alerts]
depends: [TC-STU-002]
suite: students
---

{traklet:section:objective}
## Objective
Verify the student-specific Alerts tab shows alert preferences and configuration.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- User is logged in with at least one student
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Login → `/dashboard`
2. Navigate to **Students** → `/dashboard/students`
3. Click a student → `/dashboard/students/[id]?tab=alerts`
4. Click the **Alerts** tab
5. Review and modify alert preferences for this student
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- Alert preferences specific to this student are shown
- User can configure alert thresholds (grade drop %, missing assignments, etc.)
- Changes save successfully
{/traklet:section:expected-result}
