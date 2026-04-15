---
id: TC-AUTH-004
title: "Register a new account"
priority: critical
labels: [auth, registration, smoke]
suite: auth
---

{traklet:section:objective}
## Objective
Verify a new user can create an account with email, password, name, and optional phone number.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- No existing account with the test email
- User is not logged in
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Navigate to `/register`
2. Enter first name and last name
3. Enter a valid email address
4. Enter a password meeting strength requirements
5. Confirm the password
6. Optionally enter a phone number and check SMS consent
7. Check Terms of Service and Privacy Policy checkboxes
8. Click **Create Account**
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- Account is created successfully
- User is redirected to `/dashboard`
- Dashboard shows onboarding wizard (no students yet)
- `auth_token` cookie is set
{/traklet:section:expected-result}
