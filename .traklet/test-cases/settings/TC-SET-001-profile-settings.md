---
id: TC-SET-001
title: "Settings page - profile and notification preferences"
priority: high
labels: [settings, profile, notifications]
depends: [TC-AUTH-001]
suite: settings
---

{traklet:section:objective}
## Objective
Verify the settings page loads and allows editing profile, notification, digest, and alert rule preferences.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- User is logged in
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Login → `/dashboard`
2. Navigate to **Settings** via sidebar → `/dashboard/settings`
3. Review and edit profile information (name, email, phone)
4. Toggle notification preferences (push, email, SMS)
5. Configure digest schedule (daily/weekly summaries)
6. Set alert rules (grade threshold, missing assignment alerts)
7. Click **Save**
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- Profile fields populate from settingsApi.get
- Notification toggles reflect current state
- EditDigestSlotDialog opens for editing digest time slots
- Alert rules section shows configurable thresholds
- Save persists all changes via settingsApi.update
- Success confirmation appears
{/traklet:section:expected-result}
