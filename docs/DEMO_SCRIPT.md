# Scholarmancy Demo Script

Click-through script for a complete end-to-end demo. Covers the parent dashboard, student studio, guest-parent access, and confirms that mobile still uses password + wizard until native OAuth ships.

---

## Prerequisites

- Local or UAT web app running
- API running with `DEMO_ENABLED=true`
- Demo seed loaded (the "Try the demo" button does this automatically)

---

## 1. Parent demo — Sarah Mitchell

1. Open `https://scholarmancy.com` (or `http://localhost:2800`)
2. Click **Try the demo** in the nav or hero.
   - The button calls `POST /api/seed/demo` then logs in as `demo@scholarmancy.com / DemoPass123!`
   - Expected: redirect to `/dashboard`
3. On the dashboard confirm:
   - Two students listed: **Emma** (10th grade) and **Liam** (7th grade)
   - Alert board shows at least one grade alert
   - Grade trends panel shows recent course grades

### 1a. Grades deep-dive

4. Click **Emma** → Grades tab
   - Confirm AP Bio and Algebra II grades are present
5. Navigate back (breadcrumb or back button) → click **Liam** → Grades

### 1b. Sources / integrations

6. Click **Integrations** (or Sources) in the sidebar
   - Confirm at least one source is shown (Canvas or placeholder)

### 1c. Parent management

7. Click **Settings** → **Student Logins**
   - Confirm Emma and Liam rows appear
   - Click **Send login link** on Emma → choose Email → enter `emma.demo@scholarmancy.com` → **Send**
   - Toast / confirmation should appear

8. Navigate to **Dashboard** → **Parents** tab
   - Confirm Jessica (accepted), Ricky, Jennifer are listed
   - Click **Send login link** on Jessica → send via email → confirm success

---

## 2. Student demo — Emma

1. Open a private/incognito window
2. Navigate to `http://localhost:2800/login`
   - Email: `emma.demo@scholarmancy.com`
   - Password: `DemoPass123!`
   - Expected: redirect to `/studio`
3. Studio shows **Today's tasks** for Emma
   - At least one open task with a due date
   - Work-pack panel shows class materials (PDF/link)
4. Confirm the student cannot access `/dashboard` (should redirect back to `/studio`)

---

## 3. Student demo — Liam

1. Repeat steps above with `liam.demo@scholarmancy.com / DemoPass123!`
2. Expected: `/studio` shows Liam's tasks (7th-grade courses)

---

## 4. Guest parent — Jessica

1. Use the magic-link email sent in step 1c, or log in directly:
   - Log out, navigate to `/login`
   - Use Jessica's email (from seed: `jessica.demo@scholarmancy.com`) and `DemoPass123!`
   - Expected: redirect to `/dashboard` in read-only guest view
2. Confirm Jessica sees Emma + Liam grades but cannot edit settings

---

## 5. Mobile — current state (password + wizard only)

> **Note:** OAuth buttons do not appear on mobile until native Sign in with Apple / Google ships. This is intentional.

On the TestFlight build:

1. Open the app on iOS
2. On the welcome screen, choose **I'm a parent** → enter email/password credentials
   - Use `demo@scholarmancy.com / DemoPass123!`
3. Confirm the portal-connect wizard appears (Canvas / Skyward / Aeries picker)
4. Confirm student list loads after connecting

OAuth will be added in the `mobile-oauth` track once Apple certs exist.

---

## Post-demo checklist

| Step | Expected | Pass? |
|------|----------|-------|
| Try the demo button | Seeds + logs in as Sarah, lands on `/dashboard` | |
| Emma grades | `/dashboard` shows AP Bio, Algebra II | |
| Liam grades | `/dashboard` shows 7th-grade courses | |
| Send magic link to Emma | Toast / success message | |
| Send magic link to Jessica | Toast / success message | |
| Emma student login | `/studio` with today's tasks | |
| Liam student login | `/studio` with today's tasks | |
| Student cannot reach `/dashboard` | Redirected to `/studio` | |
| Jessica guest login | `/dashboard` read-only view | |
| Mobile: no OAuth buttons | Welcome screen shows email/password only | |
| Mobile: password login works | Dashboard + connector wizard loads | |
