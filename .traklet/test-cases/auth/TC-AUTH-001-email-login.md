---
id: TC-AUTH-001
title: "Login with email and password"
priority: critical
labels: [auth, smoke, login]
suite: auth
---

{traklet:section:objective}
## Objective
Verify a registered user can sign in with valid email/password credentials and land on the dashboard.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- A registered user account exists (e.g. demo@scholaracle.com / DemoPass123!)
- User is not currently logged in
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Navigate to `/login`
2. Enter email in the "Email" field
3. Enter password in the "Password" field
4. Optionally check "Remember me"
5. Click **Sign In**
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- User is redirected to `/dashboard`
- Dashboard loads with student data (or onboarding wizard if no students)
- `auth_token` cookie is set
- User menu in header shows the user's name/email
{/traklet:section:expected-result}
