# Testing Alerts for Ava (Primary + Secondaries + Student Email)

This doc describes how to set up **Ava's account** with one primary and two secondaries, and have the **student** receive alert emails at `29alewis@ldisd.net`. All recipients (primary, secondaries, and student) receive the **same** alert content.

## Setup: Primary + Two Secondaries

- **Primary:** The account owner (the user who created the student). Their email/phone come from the User record; they receive alerts if `ownerAlertPrefs.receiveAlerts` is not false.
- **Secondaries:** Accepted contacts in `sharedWith` with `receiveAlerts: true`. Add them via **Dashboard → Student → Contacts** or **POST /api/students/:id/parents** (invite) then accept.

For Ava:

1. Create or select the student "Ava" (owner = primary).
2. Add two contacts (e.g. second parent, guardian), send invites, and have them accept (or set `status: 'accepted'` and `userId` in seed/DB).
3. Ensure all have `receiveAlerts: true` and desired `alertChannels` (e.g. `['email']`).

## Student Alert Email

So the **student** (Ava) also receives alert emails at `29alewis@ldisd.net`:

- Set the student’s **alert email** to `29alewis@ldisd.net`:
  - **API:** `PUT /api/students/:id` with body `{ "alertEmail": "29alewis@ldisd.net" }` (include other allowed fields if needed).
  - **DB:** Update the student document: `{ alertEmail: "29alewis@ldisd.net" }`.

The worker’s `resolveAllAlertRecipients` uses `Student.getAllAlertRecipients()`, which includes the owner, accepted contacts with `receiveAlerts`, and the student’s `alertEmail` when set. Everyone gets the same notification content.

## Sending Test Alerts

1. **Queue path (production / when DB exists):**  
   `POST /api/alerts` with body:
   ```json
   {
     "studentId": "<Ava's student _id from GET /api/students>",
     "type": "missing_assignment",
     "severity": "high",
     "relatedData": {
       "studentName": "Ava",
       "course": "Algebra I",
       "assignment": "Homework 5",
       "daysAgo": 1
     }
   }
   ```
   Response: **202 Accepted** with `{ jobId, message: "Notification queued" }`. The worker will resolve recipients (primary + 2 secondaries + `29alewis@ldisd.net`), generate notifications, enqueue deliver jobs, and send email to all four.

2. **Optional `userId`:** If you want to associate the alert with a specific parent user, include `"userId": "<owner or contact user id>"` in the body.

3. **Check delivery:** Use your email provider (or Mailpit at http://localhost:2804 when using SMTP locally) and confirm that primary, both secondaries, and `29alewis@ldisd.net` each receive the same alert email.

## Alert types

Use any of: `missing_assignment`, `deadline`, `grade_drop`, `test`, `workload`, `positive`, `recommendation`. All are sent to every recipient (primary, secondaries, student) with the same content.

---

## Production: Super Admin — Find user and set Ava’s alert email

The customer **rvegajr@noctusoft.com** or **rvegajr@darkware.net** should exist in production with two guests and student Ava. To verify and set the student’s alert email:

### 1. Log in as Super Admin

Use the admin dashboard and log in with your Super Admin account (MFA if required).

### 2. Find the customer

- **UI:** Go to **Customers** (or **Admin → Customers**). In the search box, enter **rvegajr** or **rvegajr@noctusoft.com** or **rvegajr@darkware.net**.
- **API:** `GET /api/admin/customers?search=rvegajr` (with admin Bearer token). Response includes `data[].id`, `data[].email`, `data[].name`. Use the `id` of the user whose email is rvegajr@noctusoft.com or rvegajr@darkware.net.

### 3. Confirm Ava and two guests

- **UI:** Open that customer’s detail. Check **Students** for a student named **Ava** and **Contacts** (or Parents) for that student: you should see two accepted guests (secondaries).
- **API:** With the customer’s user `id` from step 2:
  - `GET /api/admin/customers/:id/students` (if available) to list students, or
  - After impersonation (step 4), `GET /api/students` to list the owner’s students and pick Ava’s `id`.

### 4. Set Ava’s alert email to 29alewis@ldisd.net

**Option A — Impersonate and call parent API**

1. **Impersonate:** `POST /api/admin/customers/:customerId/impersonate` (with admin step-up token if required). Response includes a JWT for that customer.
2. With that JWT as `Authorization: Bearer <token>`:
   - `GET /api/students` → find the student with name **Ava**, note `id`.
   - `PUT /api/students/<ava-id>` with body `{ "alertEmail": "29alewis@ldisd.net" }`.

**Option B — UI (when implemented)**

If the student edit screen exposes **Alert email** (or **Student email for alerts**), open Ava’s profile, set it to **29alewis@ldisd.net**, and save.

After this, alerts for Ava will go to the primary, both secondaries, and **29alewis@ldisd.net** (same content for all).
