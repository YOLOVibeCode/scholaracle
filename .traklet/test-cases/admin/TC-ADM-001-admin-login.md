---
id: TC-ADM-001
title: "Admin login with email/password and MFA"
priority: critical
labels: [admin, auth, login, mfa, smoke]
suite: admin
---

{traklet:section:objective}
## Objective
Verify an admin user can sign in via the dedicated admin login page, including MFA verification.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- An admin user account exists
- Admin login is separate from parent login
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Navigate to `/admin/login`
2. Enter admin email and password
3. Click **Sign In**
4. If MFA is enabled, enter the TOTP code from authenticator app
5. If MFA is not yet set up, the MFASetupWizard may appear for initial configuration
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- Valid credentials + MFA: redirect to `/admin/dashboard`
- Invalid credentials: error message, remain on login
- MFA setup wizard (if first time): QR code displayed, user scans with authenticator, enters verification code
- Admin session is established in localStorage via adminAuthApi
{/traklet:section:expected-result}
