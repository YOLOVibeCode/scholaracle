# Alert Audience: Student vs Parent

This document defines which alert types are sent to **students** vs **parents**, and how recipient resolution works for delivery (email/SMS/push).

Guidance routing is **deterministic**. An LLM may tone copy; it must not decide audience.

## Alert Types

Alerts are defined in `packages/contracts/src/enums/AlertType.ts`:

- `missing_assignment`
- `deadline`
- `grade_drop`
- `test`
- `workload`
- `positive`
- `recommendation`

## Audience Matrix (v1)

Implemented in `packages/agents/src/config/alert-audience.ts`. Change this table **and** the tests together.

| Alert type         | Student | Parent | Notes |
| ------------------ | ------- | ------ | ----- |
| deadline           | Yes     | **No** | T-48h / T-18h chore reminders are student-only. Parent hears outcomes, not chores. |
| missing_assignment | Yes     | Yes    | T+12h: student “still open”; parent missing + Nudge CTA. |
| recommendation     | **No**  | Yes    | T+72h digest / talking points. No extra student nag. |
| grade_drop         | Yes     | Yes    | Student copy omits percent/letter/points unless `showGrades` is true. |
| positive           | Yes     | **No** | Encouragement for the student. Does not count against the daily student-push budget. Parent waits for digest (type-level parent false). |
| workload           | Yes     | **No** | Student first. Parent digest unless severity high — high-severity override is **deferred**. |
| test               | Yes     | **No** | Same as workload. |

Per-household override of this matrix is a follow-up, not v1.

## Recipient Resolution (Delivery)

Delivery services (Email, SMS, push) need a **delivery address**. Alerts store `userId` (parent's internal id) and `studentId` (student profile id), not raw email/phone.

### Parent notifications

- **Requirement:** Parent notifications must be sent to the parent's email (EMAIL) or phone (SMS).
- **Resolution:** Resolve parent `userId` to contact info from the User model (or from the job payload when the job is enqueued).
- Parent action-board deep links go to the student’s action-board bucket (`/dashboard/students/:mongoId?board=needs_attention#action-board`), not the students list.

### Student notifications

Students have parent-provisioned logins (slice 6). Student-facing copy may be delivered in-app, as push once a token exists, or to the student login email. Students never receive portal credentials.

Until push tokens are registered with `audience: 'student'`, email/SMS to the student login is optional (listed as a follow-up). The ladder still records the intended student send.

When `showGrades` is false (the default), student copy must not include percent, letter grade, or points.

## Related Code

- **NotificationService:** `packages/agents/src/service/NotificationService/NotificationService.ts` — generates student and parent notifications; respects `alertAudience` for which to generate/deliver, including the agent path and enqueue-deliver path.
- **Alert audience config:** `packages/agents/src/config/alert-audience.ts`
- **Guidance ladder:** `packages/studio-core/src/guidance/GuidanceLadder.ts` — T-48h / T-18h / T+12h / T+72h with fakes; jobs on `MongoQueue`.
- **Worker:** `packages/agents/src/worker/NotificationWorker/NotificationWorker.ts`
- **Delivery:** `packages/agents/src/delivery/EmailDelivery/EmailDelivery.ts`, `SMSDelivery/SMSDelivery.ts`
