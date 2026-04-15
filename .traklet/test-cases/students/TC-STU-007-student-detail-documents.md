---
id: TC-STU-007
title: "Student detail page - Documents tab"
priority: low
labels: [students, detail, documents]
depends: [TC-STU-002]
suite: students
---

{traklet:section:objective}
## Objective
Verify the Documents tab shows and manages student-related documents.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- User is logged in with at least one student
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Login → `/dashboard`
2. Navigate to **Students** → `/dashboard/students`
3. Click a student → `/dashboard/students/[id]?tab=documents`
4. Click the **Documents** tab
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- StudentDocumentsTab renders
- Documents list shows any uploaded/linked documents
- Upload and management functionality works if available
{/traklet:section:expected-result}
