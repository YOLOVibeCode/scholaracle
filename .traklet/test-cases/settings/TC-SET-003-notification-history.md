---
id: TC-SET-003
title: "Settings - notification history"
priority: low
labels: [settings, notifications, history]
depends: [TC-SET-001]
suite: settings
---

{traklet:section:objective}
## Objective
Verify the notification history section in settings shows past notifications sent to the user.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- User is logged in with some notification history
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Navigate to `/dashboard/settings`
2. Scroll to the notification history section
3. Review past notifications
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- List of past notifications with type (push/email/SMS), timestamp, and content preview
- Loaded via settingsApi notification history endpoint
{/traklet:section:expected-result}
