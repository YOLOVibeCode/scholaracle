---
id: TC-DASH-003
title: "Sidebar navigation links work correctly"
priority: critical
labels: [dashboard, navigation, smoke]
depends: [TC-AUTH-001]
suite: dashboard
---

{traklet:section:objective}
## Objective
Verify all sidebar navigation links route to the correct pages without errors.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- User is logged in and on `/dashboard`
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Login → arrive at `/dashboard`
2. Click each sidebar link and verify the page loads:
   - Dashboard (home) → `/dashboard`
   - Students → `/dashboard/students`
   - Courses → `/dashboard/courses`
   - Alerts → `/dashboard/alerts`
   - Agenda → `/dashboard/agenda`
   - Integrations → `/dashboard/integrations`
   - Settings → `/dashboard/settings`
   - Billing → `/dashboard/billing`
   - Email History → `/dashboard/email-history`
   - Account → `/dashboard/account`
3. Verify sidebar toggle (SidebarTrigger) collapses/expands the sidebar
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- Each link navigates to the correct route
- Page content loads without errors
- Active link is visually highlighted in the sidebar
- Sidebar collapse/expand works and persists state
{/traklet:section:expected-result}
