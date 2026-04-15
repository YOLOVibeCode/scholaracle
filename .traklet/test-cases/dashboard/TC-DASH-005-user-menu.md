---
id: TC-DASH-005
title: "User menu dropdown shows profile and logout"
priority: medium
labels: [dashboard, navigation, user-menu]
depends: [TC-AUTH-001]
suite: dashboard
---

{traklet:section:objective}
## Objective
Verify the UserMenu dropdown in the dashboard header works correctly.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- User is logged in and on `/dashboard`
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Login → arrive at `/dashboard`
2. Click the UserMenu avatar/icon in the header
3. Observe the dropdown options
4. Click "Account" or "Settings" from the menu
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- Dropdown shows user name/email
- Links to Account, Settings, and Logout are present
- Each link navigates to the correct page
- Logout signs out the user (TC-AUTH-007)
{/traklet:section:expected-result}
