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
- `student_needs_help`

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
| student_needs_help | **No**  | Yes    | The student tapped "Need help" (`PATCH /api/studio/assignments/:id/status`). Severity info; carries the student's note (≤140 chars) and a deep link to the parent board; at most one per assignment per 24 h (`student_help_requests`). Reaches shared adults once sharing S3 lands. |

Per-household override of this matrix is a follow-up, not v1.

## Recipient Resolution (Delivery)

Delivery services (Email, SMS, push) need a **delivery address**. Alerts store `userId` (parent's internal id) and `studentId` (student profile id), not raw email/phone.

### Parent notifications

- **Requirement:** Parent notifications must be sent to the parent's email (EMAIL) or phone (SMS).
- **Resolution:** Resolve parent `userId` to contact info from the User model (or from the job payload when the job is enqueued).
- Parent action-board deep links go to the student’s action-board bucket (`/dashboard/students/:mongoId?board=needs_attention#action-board`), not the students list.

### Student notifications

Students have parent-provisioned logins (slice 6). Student-facing copy may be delivered in-app, as push once a token exists, or to the student login email. Students never receive portal credentials.

Ladder reminders and the parent's Nudge go out through one sender, `createReminderSink`
(`packages/agents/src/guidance/`). The workers process builds it for the ladder and the API
builds it for `POST /api/students/:id/assignments/:externalId/nudge`; both put `deliver` jobs
on the shared queue (`triggerType` / push `data.type` `assignment_reminder`):

- **Student:** a push to the phones registered on the student's own login, and an email to
  that login's address with a link to the worksheet (`/studio/assignments/:id`). Never to a
  parent, and never with a link to a parent page. A login the parent revoked gets nothing.
- **Parent (ladder only):** an email to the account owner with a link to the student's action
  board, plus a push to the owner's own phones when they chose push for that student and have
  not turned its alerts off.

When there is nobody to reach (no student login), nothing is recorded as sent: the ladder does
not mark the step or count it against the student's two a day, and the nudge route answers 409
with a line telling the parent to create a login under Settings, Student logins.

When `showGrades` is false (the default), student copy must not include percent, letter grade, or points.

### Weekly review (student review spec §3.3, R4)

Not an `AlertType`: a scheduled student message, `triggerType` / push `data.type` `weekly_review`
(`WEEKLY_REVIEW_PUSH_TYPE` in contracts). The workers process runs `WeeklyReviewSender`
(`packages/agents/src/weeklyReview/`) every 15 minutes when `WEEKLY_REVIEW_ENABLED=true`; each
student whose local clock (`resolveStudentTimeZone`: their login's stored zone, else the owner's
`users.timezone`, else America/New_York — the same rule `GET /api/studio/week` uses) has passed
Sunday 18:00 gets, once per ISO week (`weekly_review_sends`): a push to the
student's devices, an email to `alertEmail` when set, and a copy to each adult whose
`weeklyReviewCopy` toggle is on (owner prefs or `sharedWith` row), by that adult's channels.
Parents get no copy by default (decision Q2). The view is composed by the same `WeekGuide` and
Mongo source as `GET /api/studio/week`, and `assertNoGradeLeak` runs on it before any copy is built.

## Related Code

- **NotificationService:** `packages/agents/src/service/NotificationService/NotificationService.ts` — generates student and parent notifications; respects `alertAudience` for which to generate/deliver, including the agent path and enqueue-deliver path.
- **Alert audience config:** `packages/agents/src/config/alert-audience.ts`
- **Guidance ladder:** `packages/studio-core/src/guidance/GuidanceLadder.ts` — T-48h / T-18h / T+12h / T+72h with fakes; jobs on `MongoQueue`.
- **Reminder and nudge sender:** `packages/agents/src/guidance/createReminderSink.ts`, `ReminderNotificationSink.ts`, `reminderRecipients.ts`; wired in `packages/workers/src/worker.ts` and `packages/api/src/server.ts` (`nudgeServerWiring.test.ts` checks the API side).
- **Worker:** `packages/agents/src/worker/NotificationWorker/NotificationWorker.ts`
- **Delivery:** `packages/agents/src/delivery/EmailDelivery/EmailDelivery.ts`, `SMSDelivery/SMSDelivery.ts`
