---
id: TC-PUB-005
title: "404 page for unknown routes"
priority: low
labels: [public, error, 404]
suite: public
---

{traklet:section:objective}
## Objective
Verify that navigating to a non-existent route shows the custom 404 page.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- None
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Navigate to a URL that doesn't exist, e.g., `/this-page-does-not-exist`
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- Custom not-found.tsx page renders
- Shows a 404 message with a link back to `/`
- No server error or blank page
{/traklet:section:expected-result}
