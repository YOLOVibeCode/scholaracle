---
id: TC-DASH-004
title: "Demo banner displays for demo user and allows reset"
priority: medium
labels: [dashboard, demo]
depends: [TC-AUTH-001]
suite: dashboard
---

{traklet:section:objective}
## Objective
Verify the DemoBanner is visible for demo users and the reset function works.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- Logged in as demo user (demo@scholaracle.com / DemoPass123!)
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Login as demo user → `/dashboard`
2. Observe the DemoBanner at the top of the dashboard
3. Click "Reset demo environment" in the banner
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- DemoBanner is visible with demo-specific messaging
- Reset action calls POST to seed/demo/reset
- Dashboard refreshes with original demo data
- Banner is NOT visible for non-demo users
{/traklet:section:expected-result}
