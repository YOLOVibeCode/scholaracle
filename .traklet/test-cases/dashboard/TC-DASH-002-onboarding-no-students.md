---
id: TC-DASH-002
title: "Dashboard shows onboarding wizard when no students exist"
priority: high
labels: [dashboard, onboarding]
depends: [TC-AUTH-001]
suite: dashboard
---

{traklet:section:objective}
## Objective
Verify that a new user with no students sees the onboarding flow with the Add Student wizard.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- User is logged in
- User has zero students
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Login with a new account that has no students
2. Arrive at `/dashboard`
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- Instead of stats/grade strips, the AddStudentWizard is displayed
- Wizard prompts the user to add their first student
- No empty-state errors are shown
{/traklet:section:expected-result}
