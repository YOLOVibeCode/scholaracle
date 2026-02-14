# Alert Audience: Student vs Parent

This document defines which alert types are sent to **students** vs **parents**, and how recipient resolution works for delivery (email/SMS).

## Alert Types

Alerts are defined in `packages/contracts/src/enums/AlertType.ts`:

- `missing_assignment`
- `deadline`
- `grade_drop`
- `test`
- `workload`
- `positive`
- `recommendation`

## Audience Matrix

| Alert type         | Student | Parent | Notes |
| ------------------ | ------- | ------ | ----- |
| missing_assignment | Yes     | Yes    | Both need to know; student to act, parent to support. |
| deadline           | Yes     | Yes*   | Primarily student; parent may want "due soon" in digest. (*Optional: can be parent-only in future.) |
| grade_drop         | Yes     | Yes    | Both; often parent-heavy but student should see. |
| test               | Yes     | Yes    | Study reminder for student; awareness for parent. |
| workload           | Yes     | Yes    | Both benefit from "heavy week" awareness. |
| positive           | Yes     | Yes    | Encouragement for student; good news for parent. |
| recommendation     | Yes*    | Yes    | Usually parent/guardian; student if actionable. (*Optional: can be parent-only in future.) |

Implementation uses a config-driven matrix (`alertAudience`) in code; the default is **both student and parent** for all types (current behavior). Optional/overrides can be added later via per-student or per-household preferences.

## Recipient Resolution (Delivery)

Delivery services (Email, SMS) need a **delivery address** (email or phone). Alerts store `userId` (parent's internal id) and `studentId` (student/internal id), not raw email/phone.

### Parent notifications

- **Requirement:** Parent notifications must be sent to the parent's email (for EMAIL channel) or phone (for SMS channel).
- **Resolution:** Before delivery, resolve parent `userId` to the parent's contact info from the User model (or from the job payload when the job is enqueued). The notification passed to EmailDelivery/SMSDelivery must use the **resolved** email/phone as the recipient (e.g. via a resolved `userId` field that is set to the email or phone for that channel, or via a separate `deliveryAddress` field).
- **Where:** Resolution can happen in the notification worker (when processing a job: load User by userId, get email/phone, then pass resolved address into NotificationService or into the notification object before delivery) or at enqueue time (store parent email/phone in the job so the worker doesn't need DB access for resolution).

### Student notifications

- **Current:** Students do not have their own accounts or contact info in the data model. `studentId` is an internal or external id, not an email/phone.
- **Options:**
  1. **In-app only:** Student notifications are shown only in the student dashboard (or parent "view as student"); no outbound email/SMS to the student.
  2. **Deliver to parent:** Send the student-facing message to the parent's contact (e.g. "For Emma: …") so the parent can relay or so the student sees it on a shared device.
- **Future:** If student email/phone or student accounts are added, student notifications can be sent directly to the student; until then, implementation uses in-app display and/or parent fallback as above.

## Related Code

- **NotificationService:** `packages/agents/src/service/NotificationService/NotificationService.ts` — generates student and parent notifications; respects `alertAudience` for which to generate/deliver.
- **Alert audience config:** `packages/contracts` or `packages/agents` — `alertAudience: Record<AlertType, { student: boolean; parent: boolean }>`.
- **Worker:** `packages/agents/src/worker/NotificationWorker/NotificationWorker.ts` — processes alert jobs; parent recipient resolution can be done here (load User, resolve email/phone, then call NotificationService with resolved addresses or set on notification before delivery).
- **Delivery:** `packages/agents/src/delivery/EmailDelivery/EmailDelivery.ts`, `SMSDelivery/SMSDelivery.ts` — use notification's recipient (today `userId`); must be the resolved email or phone for delivery to work.
