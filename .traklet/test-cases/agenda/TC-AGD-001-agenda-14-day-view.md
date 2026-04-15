---
id: TC-AGD-001
title: "Agenda shows next 14 days of events for all students"
priority: critical
labels: [agenda, calendar, smoke]
depends: [TC-AUTH-001]
suite: agenda
---

{traklet:section:objective}
## Objective
Verify the agenda page shows upcoming assignments, tests, and deadlines grouped by date for all students.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- User is logged in with students who have upcoming assignments
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Login → `/dashboard`
2. Navigate to **Agenda** via sidebar → `/dashboard/agenda`
3. Observe the 14-day agenda view
4. Use AgendaFilterBar to filter by student, course, or type
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- AgendaDateGroup components render for each day with items
- Each AgendaCard shows assignment name, student, course, due time, type
- AgendaFilterBar allows filtering by student, course, priority, type
- Empty days are either skipped or shown with "No items" state
- Data comes from agendaApi.getRange for next 14 days
{/traklet:section:expected-result}
