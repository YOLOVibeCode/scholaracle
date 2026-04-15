---
id: TC-DASH-001
title: "Dashboard home loads with stats and student data"
priority: critical
labels: [dashboard, smoke, home]
depends: [TC-AUTH-001]
suite: dashboard
---

{traklet:section:objective}
## Objective
Verify the main dashboard loads and displays stats, grade strips, alerts, and action board for the logged-in user.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- User is logged in (TC-AUTH-001)
- User has at least one student with grade data
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Login → `/login` with valid credentials
2. Arrive at `/dashboard`
3. Observe the page content
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- Stats section shows aggregate metrics (total students, alerts, upcoming items)
- StudentGradeStripRow renders for each enrolled student with current grades
- Recent alerts section shows latest alerts
- ActionBoard shows actionable items
- Sidebar navigation is visible with all dashboard links
- Grade display mode matches user settings (letter/percentage)
{/traklet:section:expected-result}
