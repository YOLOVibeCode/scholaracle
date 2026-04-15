---
id: TC-AGD-002
title: "Snooze an agenda item"
priority: medium
labels: [agenda, snooze]
depends: [TC-AGD-001]
suite: agenda
---

{traklet:section:objective}
## Objective
Verify a user can snooze an agenda item to temporarily hide it.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- User is on the agenda page with at least one visible item
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Navigate to `/dashboard/agenda`
2. Find an agenda item
3. Click the snooze action on the item
4. Select snooze duration (if applicable)
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- Item is snoozed via agendaApi.snooze
- Item disappears from the current view or shows snoozed state
- Item reappears after the snooze period expires
{/traklet:section:expected-result}
