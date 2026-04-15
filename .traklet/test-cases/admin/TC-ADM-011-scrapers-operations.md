---
id: TC-ADM-011
title: "Admin scrapers - cache management, jobs, and test runs"
priority: medium
labels: [admin, scrapers, operations]
depends: [TC-ADM-001]
suite: admin
---

{traklet:section:objective}
## Objective
Verify admin can manage scraper operations: view stats, manage caches, view jobs, run tests.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- Admin user is logged in
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Admin login → navigate to **Scrapers** → `/admin/scrapers`
2. Review scraper statistics
3. Navigate through tabs: caches, jobs, reports, test
4. Clear a cache entry
5. View job run details
6. Trigger a test scrape
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- Stats show active scrapers, last run times, error counts
- Caches tab shows cached data with clear action
- Jobs tab shows scheduled/running/completed jobs
- Reports tab shows scrape results and errors
- Test tab allows running a test scrape against a provider
- All data from adminScrapersApi
{/traklet:section:expected-result}
