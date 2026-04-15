---
id: TC-GRD-001
title: "Courses page shows student grade panels"
priority: high
labels: [grades, courses, smoke]
depends: [TC-AUTH-001]
suite: grades
---

{traklet:section:objective}
## Objective
Verify the Courses page displays grade panels for each student with grade display mode sync.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- User is logged in with at least one student who has grade data
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Login → `/dashboard`
2. Navigate to **Courses** via sidebar → `/dashboard/courses`
3. Select a student from the StudentStrip at the top
4. Observe the StudentGradePanel for the selected student
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- StudentStrip shows all students; clicking one selects it
- StudentGradePanel shows current grades for all enrolled courses
- Grade display mode (letter/percentage) matches user settings
- Each course card links to the full grades view
{/traklet:section:expected-result}
