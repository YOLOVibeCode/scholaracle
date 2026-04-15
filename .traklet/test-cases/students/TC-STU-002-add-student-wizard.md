---
id: TC-STU-002
title: "Add a new student via wizard"
priority: critical
labels: [students, create, wizard]
depends: [TC-AUTH-001]
suite: students
---

{traklet:section:objective}
## Objective
Verify a parent can add a new student using the AddStudentWizard.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- User is logged in
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Login → `/dashboard`
2. Navigate to **Students** → `/dashboard/students`
3. Click **Add Student** button (or use wizard on dashboard if no students)
4. Enter student first name and last name
5. Enter grade level
6. Complete the wizard steps
7. Click **Save** / **Create**
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- Student is created via studentsApi.create
- Student appears in the students list
- User is prompted to connect a data source for the new student
- Sidebar may update to show the new student
{/traklet:section:expected-result}
