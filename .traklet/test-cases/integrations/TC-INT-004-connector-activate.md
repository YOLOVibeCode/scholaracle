---
id: TC-INT-004
title: "Connector device activation page"
priority: low
labels: [integrations, connector, device]
depends: [TC-AUTH-001]
suite: integrations
---

{traklet:section:objective}
## Objective
Verify the connector device activation flow approves a self-hosted scraper device code.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- User is logged in (middleware-protected route)
- A connector device code has been generated
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Navigate to `/connector/activate` (or `/connector/activate?code=XXXX`)
2. If code is in URL, it auto-populates the input field
3. Enter or confirm the device user code
4. Click **Approve**
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- POST to `/ingest/v1/device/approve` with Bearer token succeeds
- Device is activated and can begin sending data
- Success message is displayed
- If code is invalid, error message is shown
{/traklet:section:expected-result}
