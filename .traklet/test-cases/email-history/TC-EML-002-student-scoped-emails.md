---
id: TC-EML-002
title: "Student-scoped email history in student view mode"
priority: low
labels: [email, students, view-mode]
depends: [TC-EML-001, TC-GRD-005]
suite: email-history
---

{traklet:section:objective}
## Objective
Verify email history within student view shows only emails related to that student.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- User is in student view mode
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Navigate to `/dashboard/students/[id]/view/emails`
2. Review the scoped email list
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- Only emails with matching studentId are shown
- Preview and resend work the same as global email history
- Resend gated by canResend flag
{/traklet:section:expected-result}
