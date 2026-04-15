---
id: TC-GRD-002
title: "Student grades page with course sidebar and assignment table"
priority: critical
labels: [grades, assignments, detail]
depends: [TC-AUTH-001, TC-STU-002]
suite: grades
---

{traklet:section:objective}
## Objective
Verify the full grades page for a student shows the course sidebar, assignment table, and AI overview.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- User is logged in
- Student has synced grade data from at least one source
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Login → `/dashboard`
2. Navigate to **Students** → `/dashboard/students`
3. Click a student → `/dashboard/students/[id]` → click **Grades** tab, or
4. Navigate directly to `/dashboard/students/[id]/grades`
5. Select a course from the GradeSidebar on the left
6. Observe the assignment table for the selected course
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- GradeSidebar lists all courses with current grade shown next to each
- Selecting a course populates the AssignmentTable with that course's assignments
- CourseGradeSummaryCard shows overall grade, category weights, and AI overview
- Each assignment row shows name, due date, score, grade, status
- Deep links work: `?course=X` selects the course, `?assignment=Y` opens the drawer
{/traklet:section:expected-result}
