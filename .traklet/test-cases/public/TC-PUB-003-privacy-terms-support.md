---
id: TC-PUB-003
title: "Privacy, Terms, and Support pages render correctly"
priority: low
labels: [public, legal, support]
suite: public
---

{traklet:section:objective}
## Objective
Verify the static legal and support pages render correctly without requiring authentication.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- No login required (all public routes)
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Navigate to `/privacy` → review privacy policy content
2. Navigate to `/terms` → review terms of service content
3. Navigate to `/support` → review support information and contact links
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- `/privacy`: Server-rendered privacy policy with proper metadata; content is readable
- `/terms`: Server-rendered terms of service with proper metadata
- `/support`: Support page with SMS help text, links to `/login` and `/` 
- All three pages are accessible without authentication
- Navigation links (home, login) work from each page
{/traklet:section:expected-result}
