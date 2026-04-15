---
id: TC-INT-001
title: "Integrations page lists connected providers"
priority: high
labels: [integrations, list, smoke]
depends: [TC-AUTH-001]
suite: integrations
---

{traklet:section:objective}
## Objective
Verify the Integrations page shows all connected data providers and allows adding new ones.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- User is logged in
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Login → `/dashboard`
2. Navigate to **Integrations** via sidebar → `/dashboard/integrations`
3. Observe the list of IntegrationCards
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- IntegrationCard for each connected provider (Canvas, Skyward, Google Classroom, OneRoster, etc.)
- Each card shows provider name, status, last sync time, linked student count
- "Add Integration" button opens ConnectProviderWizard
- ReconciliationCard and SelfHostedScraperCard render if applicable
{/traklet:section:expected-result}
