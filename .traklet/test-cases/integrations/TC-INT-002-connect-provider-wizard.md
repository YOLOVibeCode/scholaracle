---
id: TC-INT-002
title: "Connect a new data provider via wizard"
priority: critical
labels: [integrations, wizard, connect]
depends: [TC-INT-001]
suite: integrations
---

{traklet:section:objective}
## Objective
Verify a user can connect a new LMS/data provider through the ConnectProviderWizard.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- User is logged in
- At least one student exists
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Navigate to `/dashboard/integrations`
2. Click **Add Integration** / **Connect Provider**
3. ConnectProviderWizard opens
4. Select a provider type (Canvas, Skyward, Google Classroom, etc.)
5. Enter required credentials (URL, API key, username/password depending on provider)
6. Select which student(s) to link
7. Complete the wizard
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- Wizard walks through provider selection, credential entry, and student linking
- Credentials are encrypted via CREDENTIALS_ENCRYPTION_KEY
- Integration is created and appears in the integrations list
- Initial sync is triggered or scheduled
{/traklet:section:expected-result}
