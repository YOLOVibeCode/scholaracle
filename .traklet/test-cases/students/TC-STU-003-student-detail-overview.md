---
id: TC-STU-003
title: "Student detail page - Overview tab"
priority: high
labels: [students, detail, overview]
depends: [TC-STU-002]
suite: students
---

{traklet:section:objective}
## Objective
Verify the student detail Overview tab displays and allows editing student information.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- User is logged in
- At least one student exists
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Login → `/dashboard`
2. Navigate to **Students** → `/dashboard/students`
3. Click a student name or edit icon → `/dashboard/students/[id]`
4. The Overview tab should be active by default (or navigate via `?tab=overview`)
5. Edit student name or grade level
6. Click **Save**
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- Student details are displayed: name, grade, enrollment info
- Form allows editing student fields
- Save persists changes via studentsApi.update
- Success message confirms the update
{/traklet:section:expected-result}
