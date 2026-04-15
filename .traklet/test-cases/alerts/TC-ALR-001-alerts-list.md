---
id: TC-ALR-001
title: "Alerts page shows all alerts with severity filters"
priority: critical
labels: [alerts, list, smoke]
depends: [TC-AUTH-001]
suite: alerts
---

{traklet:section:objective}
## Objective
Verify the alerts page displays all alerts with filtering by severity and acknowledge functionality.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- User is logged in
- Alerts exist in the system (grade drops, missing assignments, etc.)
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Login → `/dashboard`
2. Navigate to **Alerts** via sidebar → `/dashboard/alerts`
3. Observe the alerts list
4. Use severity filter buttons (critical, warning, info)
5. Click **Acknowledge** on an alert
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- All alerts listed with severity icon, student name, description, timestamp
- Severity filters narrow the list to selected level(s)
- Acknowledging an alert marks it as read (via alertsApi.acknowledge)
- Alert count in sidebar/header updates after acknowledgement
{/traklet:section:expected-result}
