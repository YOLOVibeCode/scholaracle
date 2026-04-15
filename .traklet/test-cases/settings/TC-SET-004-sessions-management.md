---
id: TC-SET-004
title: "Session management - view and revoke sessions"
priority: high
labels: [settings, sessions, security]
depends: [TC-AUTH-001]
suite: settings
---

{traklet:section:objective}
## Objective
Verify the sessions page shows active sessions and allows revoking individual or all other sessions.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- User is logged in (ideally from multiple devices to see multiple sessions)
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Login → `/dashboard`
2. Navigate to **Settings** → `/dashboard/settings`
3. Click the link to **Sessions** → `/dashboard/settings/sessions`
4. Observe the session list (SessionCard for each active session)
5. Click **Revoke** on a specific session
6. Click **Revoke All Other Sessions**
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- SessionCard shows device info, IP, last active time, current session indicator
- Revoking a session invalidates that session's tokens
- "Revoke All Other" invalidates everything except the current session
- Current session remains active; other sessions are logged out
{/traklet:section:expected-result}
