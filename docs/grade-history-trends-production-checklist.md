# Grade History / Trends — Production Readiness Checklist

Use this before deploying the grade-history/trends feature to production.

## Feature scope

- **GET** `/api/students/:id/grade-history` — time-series grade snapshots per course (`from`, `to`, `term`, `course`).
- **DELETE** `/api/students/:id/grade-history` — archive records before a date (move to `slc_grade_history_archive`).
- **Web:** Student detail → Trends tab (risk cards, term selector, all-courses chart, archive with confirm dialog).
- **UX:** Error states + Retry, confirm before archive, active tab styling, `aria-controls` / tabpanel ids.

---

## Pre-deploy checklist

### API

- [ ] **Validation:** GET validates `from`/`to` (YYYY-MM-DD) and `from` ≤ `to`; invalid → 400.
- [ ] **Auth:** Both endpoints require auth; 401 without token.
- [ ] **Tests:** `pnpm --filter @scholaracle/api test -- --testPathPattern="students|gradeHistory"` passes.
- [ ] **Health:** `curl https://api.scholarmancy.com/api/health` returns 200 before/after deploy.

### Web

- [ ] **Confirm dialog:** Archive semester opens confirm dialog; archive only on Confirm.
- [ ] **Error + Retry:** Load failure shows message + Retry; Retry calls load again.
- [ ] **Active tab:** Student detail tabs show distinct active style (`bg-primary`).
- [ ] **Accessibility:** Tabs have `aria-controls`; tabpanels have `id` and `role="tabpanel"`.
- [ ] **Tests:** StudentTrendsTab, AllCoursesGradeTrend, and student detail page tests pass (see below).

### Data

- [ ] **Collections:** `slc_grade_history` and `slc_grade_history_archive` exist (created by ingest/API usage).
- [ ] **Ingest:** Grade history is populated via ingest `gradeSnapshot` ops (scrapers).

---

## Quick test commands (feature only)

```bash
# API (grade-history + validator + students route)
pnpm --filter @scholaracle/api test -- --testPathPattern="students\\.test|gradeHistoryQueryValidator"

# Web (trends tab, chart, student page)
pnpm --filter @scholaracle/web test -- --testPathPattern="StudentTrendsTab|AllCoursesGradeTrend|dashboard/students/\\\\[id\\\\]/page"
```

---

## Deploy to production

### Option A: Push to `main` (recommended)

1. Merge your branch into `main`.
2. GitHub Actions runs CI (lint, type-check, tests per package, build).
3. If CI passes, deploy workflow runs: **Deploy API**, **Deploy Workers**, **Deploy Web** (Railway).
4. Verify:  
   `curl https://api.scholarmancy.com/api/health`  
   Then open https://scholarmancy.com → Students → [a student] → **Trends** tab.

### Option B: Manual deploy (Railway CLI)

From repo root:

```bash
railway link   # if not already linked to project
railway up --service api
railway up --service web
railway up --service workers
```

Then verify health and the Trends tab as above.

---

## Post-deploy smoke check

1. **Health:** `curl https://api.scholarmancy.com/api/health` → `{"status":"ok",...}`.
2. **Login** to the app, open a student, go to **Trends** tab.
3. **Load:** If the student has grade history, chart and risk cards appear; if not, empty state.
4. **Term selector:** Choose a term (if available); **Archive semester** appears; click it → confirm dialog → Cancel (do not archive unless intended).
5. **Error path:** (Optional) Temporarily break API URL in dev and confirm error message + Retry appears.

---

## Rollback

- **Railway:** Dashboard → Deployments → select previous deployment → Redeploy.
- **Code:** Revert the merge to `main` and push; CI will deploy the previous commit.
