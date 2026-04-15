---
id: TC-EML-001
title: "Email history page with filters, preview, and resend"
priority: medium
labels: [email, history, notifications]
depends: [TC-AUTH-001]
suite: email-history
---

{traklet:section:objective}
## Objective
Verify the email history page shows sent emails with filtering, preview, resend, and delete capabilities.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- User is logged in
- At least one notification email has been sent
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Login → `/dashboard`
2. Navigate to **Email History** via sidebar → `/dashboard/email-history`
3. Browse the paginated email list
4. Use filters (date range, type, student)
5. Click an email to open the preview dialog
6. Click **Resend** on a specific email
7. Click **Delete All** to clear history
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- Paginated list of sent emails with subject, recipient, date, status
- Filters narrow results by criteria
- Preview dialog shows full email content (HTML rendered)
- Resend triggers emailHistoryApi.resend (if canResend is true)
- Delete all prompts confirmation before clearing via emailHistoryApi.deleteAll
{/traklet:section:expected-result}
