# Scholaracle App Specification (Authoritative)

**Status:** Active (v1)  
**Scope:** Defines the **currently implemented** Scholaracle user + admin experiences and the acceptance criteria that must remain green in E2E.  

This document is the authoritative source for “what Scholaracle should do” **today**. Future/aspirational features are explicitly listed under **Out of Scope / Future** and are not required for green E2E runs.

---

## 1. Product Surfaces

### 1.1 Parent (Customer) Web App

**Routes**
- Public:
  - `/` (marketing/landing)
  - `/login`
  - `/register`
- Authenticated:
  - `/dashboard`
  - `/dashboard/students`
  - `/dashboard/students/new`
  - `/dashboard/students/[id]`
  - `/dashboard/alerts`
  - `/dashboard/courses`
  - `/dashboard/settings`
  - `/dashboard/students/[id]/view` (student view home)
  - `/dashboard/students/[id]/view/agenda`
  - `/dashboard/students/[id]/view/alerts`
  - `/dashboard/students/[id]/view/courses`

**Core behaviors (acceptance criteria)**
- **Authentication**
  - Users can register and then land on `/dashboard`.
  - Users can login and logout.
  - Auth guard prevents access to `/dashboard/**` without auth.
- **Dashboard**
  - Dashboard renders key KPI cards (Students, Courses, Alerts, Avg GPA) and sections.
  - Student count is visible via `data-testid="student-count"`.
- **Courses**
  - `/dashboard/courses` route renders (placeholder UI is acceptable in v1).
- **Students**
  - Create student (name required; grade optional; school optional).
  - Read student list and student detail.
  - Update student.
  - Delete student.
- **Alerts**
  - Alerts list renders (may be empty).
  - Alerts can be acknowledged (when present).
  - Severity filters render (when present).
- **Settings**
  - Notification toggles (push/email/sms) and alert thresholds are editable.
  - Saving settings shows a toast (`data-testid="toast"`) and persists on reload.

**E2E coverage**
- Parent dashboard rendering: `DASH-P-001` … `DASH-P-008`
- Parent navigation: `NAV-P-001` … `NAV-P-015`
- Parent features: `FEAT-P-001` … `FEAT-P-010`
- Parent onboarding workflow: `INT-001`
- Alert workflow: `INT-004`
- Multi-student workflow: `INT-005`
- Error handling: `ERR-001` … `ERR-006`

---

### 1.2 Admin Dashboard

**Routes**
- Public:
  - `/admin/login`
- Admin-authenticated:
  - `/admin` (alias/redirect to dashboard in navigation)
  - `/admin/dashboard`
  - `/admin/customers`
  - `/admin/customers/[id]`
  - `/admin/subscriptions`
  - `/admin/payments`
  - `/admin/analytics`
  - `/admin/reports`
  - `/admin/communications`
  - `/admin/settings`
  - `/admin/audit-logs`

**Roles**
- The system has one admin role: `admin`. All admins have full access to all admin routes and features.
- The three user types are: `admin`, `parent`, and `student`.

**Core behaviors (acceptance criteria)**
- **Admin auth**
  - Admins can login via `/admin/login` and land on `/admin/dashboard`.
  - All authenticated admins have full access to every admin page.
- **Customers**
  - Customer list renders and supports search + pagination.
  - Customer detail page renders and shows basic tabs navigation.
  - Admins can suspend/unsuspend customers.
  - Admin notes can be created/updated/deleted.
  - Admins can send a communication to a customer (logs recorded server-side).
- **Subscriptions & payments**
  - Admins can view and take actions (plan change, cancel, refund) where supported.
- **Analytics & reports**
  - Admins can access analytics/reports pages (may be placeholder UI but route must render).
- **System pages**
  - Settings and audit logs are accessible to all admins.

**E2E coverage**
- Admin dashboard rendering: `DASH-A-001` … `DASH-A-010`
- Admin navigation: `NAV-A-001` … `NAV-A-015`
- Admin features: `FEAT-A-001` … `FEAT-A-015`
- Admin-parent workflow: `INT-002`
- Subscription lifecycle workflow: `INT-003`

---

## 2. Out of Scope / Future (Not Required for Green E2E)

These items may exist in earlier docs as aspirational features. They are **not implemented** in the current UI and therefore are **not part of E2E acceptance** until implemented.

- **Data source configuration UI**
  - Adding Canvas/Skyward/Google Classroom credentials
  - “Test connection” flows
- **Advanced AI Insights UI**
  - Predictive analytics panels
  - Natural-language summaries
- **Cross-browser / mobile E2E**
  - The E2E suite is intentionally **Chromium-only** for reliability and speed.

When any of the above moves into active scope, this specification will be updated and new E2E tests will be added as acceptance criteria.


