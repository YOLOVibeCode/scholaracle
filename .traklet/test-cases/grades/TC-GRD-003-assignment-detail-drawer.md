---
id: TC-GRD-003
title: "Assignment detail drawer shows full assignment info"
priority: high
labels: [grades, assignments, drawer]
depends: [TC-GRD-002]
suite: grades
---

{traklet:section:objective}
## Objective
Verify clicking an assignment opens the AssignmentDetailDrawer with full details.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- User is on the student grades page with assignments loaded
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Navigate to `/dashboard/students/[id]/grades`
2. Select a course from the sidebar
3. Click on an assignment row in the AssignmentTable
4. Observe the AssignmentDetailDrawer that opens
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- Drawer slides in with full assignment details
- Shows: title, due date, score, grade, submission status, category
- Attachment previews available (AttachmentPreviewDialog)
- Comment thread (CommentThread) shows existing notes
- URL updates to include `?assignment=` parameter for deep linking
- Drawer can be closed, returning to the table view
{/traklet:section:expected-result}
