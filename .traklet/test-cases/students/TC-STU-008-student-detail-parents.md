---
id: TC-STU-008
title: "Student detail page - Parents tab (manage co-parents)"
priority: medium
labels: [students, detail, parents, sharing]
depends: [TC-STU-002]
suite: students
---

{traklet:section:objective}
## Objective
Verify the Parents tab allows managing co-parents who can view this student's data.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- User is logged in with at least one student
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Login → `/dashboard`
2. Navigate to **Students** → `/dashboard/students`
3. Click a student → `/dashboard/students/[id]?tab=parents`
4. Click the **Parents** tab
5. Add or remove a co-parent via ManageParentsCard
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- ManageParentsCard shows current parent/guardian list
- User can invite a co-parent by email
- User can remove a co-parent
- Changes persist and the co-parent gains/loses access
{/traklet:section:expected-result}
