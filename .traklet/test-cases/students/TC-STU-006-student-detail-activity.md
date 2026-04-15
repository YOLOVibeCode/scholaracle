---
id: TC-STU-006
title: "Student detail page - Activity tab"
priority: medium
labels: [students, detail, activity]
depends: [TC-STU-002]
suite: students
---

{traklet:section:objective}
## Objective
Verify the Activity tab shows a timeline of student events (grade changes, syncs, alerts).
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- User is logged in with a student that has some activity history
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Login → `/dashboard`
2. Navigate to **Students** → `/dashboard/students`
3. Click a student → `/dashboard/students/[id]?tab=activity`
4. Click the **Activity** tab
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- ActivityTimeline component renders chronological events
- Events include grade changes, sync completions, alert triggers
- Timeline is scrollable with proper date grouping
{/traklet:section:expected-result}
