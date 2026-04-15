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
3. Click **Sign In** link
4. Click **Create Account** link
5. Click **Explore Demo** button
6. Click **Reset demo environment** button
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- Product heading "Scholaracle" and description are visible
- "How to use it" section with 3 steps
- Sign In → navigates to `/login`
- Create Account → navigates to `/register`
- Explore Demo → seeds demo data (POST to seed/demo), then demo auto-login
- Reset demo → calls seed/demo/reset, restores original demo data
- Demo credentials displayed: demo@scholaracle.com / DemoPass123!
- Footer links: Privacy, Terms, Support
{/traklet:section:expected-result}
