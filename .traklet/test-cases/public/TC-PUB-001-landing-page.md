---
id: TC-PUB-001
title: "Landing page loads with demo access and auth links"
priority: critical
labels: [public, landing, smoke]
suite: public
---

{traklet:section:objective}
## Objective
Verify the public landing page loads correctly with product copy, demo access, and navigation links.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- No login required (public route)
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Navigate to `/` (root URL)
2. Observe the page content
3. Click **Sign in**
4. Click **Create account**
5. Click **Try the demo**
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- Product heading "Scholarmancy" is visible
- How it works explains connecting from the iOS/Android app or Chrome extension (credentials stay on device)
- Sign in → `/login`
- Create account → `/register`
- Try the demo → POST `/api/seed/demo`, then demo auto-login as `demo@scholarmancy.com`
- Footer links: Privacy, Terms, Support
{/traklet:section:expected-result}
