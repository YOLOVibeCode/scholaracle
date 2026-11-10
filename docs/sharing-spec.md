# Sharing students with other adults: specification and implementation plan

Status: APPROVED by the owner on 2026-11-09 (decisions in §8); ready to implement. Builds on
`docs/parental-access-control.md` and reverses its §2 self-removal rule (see §4.2). Companion:
`docs/student-review-spec.md`.
Every "today" statement below was verified in code on main `89d513f`; file:line references are to that commit.

## 1. The problem, in the owner's words

One parent owns three students and wants:

| Student   | Also visible to      |
|-----------|----------------------|
| Ava       | Robert, Jessica      |
| Christian | Jessica, Jennifer    |
| Gideon    | Jessica, Jennifer    |

Each person must see only their students, get alerts for them on their own phone, and the owner must
stay in control (invite, remove, promote). Jessica uses Android; the owner uses iOS and the web.

The data model supports this today (sharing is per student). What does not work: the invite email's
links are dead, the phone app has no sharing screens at all, shared adults get no push and an empty
alert inbox, shared students count against the invitee's own plan, any shared adult can delete the
student, and anyone signed in can accept someone else's invite. Section 3 lists each with evidence.

## 2. How sharing works today (verified)

### 2.1 Data
`Student.userId` is the owner. `Student.sharedWith[]` holds one `ISharedParent` per invited adult
(`packages/database/src/models/Student/Student.ts:52-85`):
`email`, `userId?` (set on accept), `name?`, `role` (`parent | guardian | caregiver`, a display label),
`isAdmin?`, `status` (`pending | accepted | declined`), `invitedAt`, `acceptedAt?`, `phone?`,
`receiveAlerts?`, `alertChannels?` (`email | sms`), `alertTypes?`, `transferRequest?`.
Per-student owner preferences live in `ownerAlertPrefs`. Access checks: `hasAccess` (owner or accepted
share), `canAdmin` (owner or accepted share with `isAdmin`), `isOwner`, `dataUserId` (all synced data is
read under the owner's tenant, whoever is asking). `StudentRepository.findByUserId` returns owned +
accepted shares; `findOwnedByUserId` returns owned only; `findPendingInvites(email)` returns pending.

### 2.2 API: two route families write the same array
`packages/api/src/routes/students/students.ts`
- `/:id/parents` (older): GET list, POST `invite` (canAdmin), POST `accept`, PUT `:email/admin`
  (canAdmin), DELETE `:email` (canAdmin).
- `/:id/contacts` (newer, "consent-first"): GET list with SMS opt-in status, POST add (canAdmin; name,
  phone, role, channels, types; returns an SMS opt-in link when texting), POST `accept` / `decline`,
  PUT `:email` (admin: any field; the person themself: only their alert prefs), DELETE `:email`
  (admin only; nobody may remove themself, by design: see parental-access-control.md §2),
  POST `:email/magic-link/send` (canAdmin; email or SMS; 24 h, single use), email transfer.
- `GET /invites/pending?email=` lists pending invites for any email given in the query.
- `POST /api/auth/magic` with a pending-invite token creates (or finds) a parent user for the invited
  email, marks the invite accepted and signs them in (`routes/auth/auth.ts:365-398`). This is the only
  accept path that works end to end today.

### 2.3 Web
`ManageParentsCard` (Parents tab of a student page) uses `/parents/invite`, `/parents/:email/admin`,
`/parents/:email` and `/contacts/:email/magic-link/send`. It receives `isOwner={true}` hard-coded
(`web/app/dashboard/students/[id]/page.tsx:268`). `lib/api/students.ts` has `getPendingInvites` and
`acceptInvite`, but no page calls them. The invite email links to `/register?invite=…&email=…` and
`/dashboard/invites` (`api/src/services/InviteEmailSender.ts:53-54`); neither route exists.

### 2.4 Alerts and notifications
- Alert rows carry the owner's `userId`; the inbox (`routes/alerts-api`) and the per-student list
  (`students.ts:3668`) query by the requester's `userId`, so a shared adult sees nothing.
- Delivery fans out per resolved recipient for email and SMS only; push is sent to
  `parentNotification.userId` (the owner) and the resolver sets `userId` only for the owner
  (`agents/src/recipient-resolver.ts:30-35`, `NotificationService.ts:214-219`). Shared adults never
  get a push.
- SMS to a contact requires their own opt-in (`services/sms/contactSmsOptIn.ts`; statuses
  `none | invited | opted_in`), reached through `/sms/optin/[token]`.

### 2.5 Plan limits
Both the manual create (`students.ts:3131`) and ingest (`services/billing/studentPlanLimit.ts:70,96`)
count `findByUserId`, which includes students shared *with* the user. A free-plan co-parent who has
three shared students cannot add their own child.

### 2.6 Phone
No sharing calls in `mobile/src/api/client.ts`; no screens. The list item (`IStudentListItem`) carries
the owner `userId` but no role. Magic links already open the app (`src/auth/magicDeepLink.ts`).

### 2.7 Tests that exist
API unit tests for the basic parents/contacts routes; Playwright `08-multi-parent` (MP-001..008),
`12-blended-family-contacts` (BFC-001..004), `15-blended-family-revocation` (BFR-001..005).

## 3. Defects found (fix regardless of the rest)

| # | Defect | Evidence | Severity |
|---|--------|----------|----------|
| D1 | Accept/decline take the invited email from the request body and never compare it with the signed-in user's email. Anyone signed in who knows a student id and the invited address can accept in the invitee's place. | `students.ts:588-627` (contacts), `3870-3913` (parents) | security |
| D2 | `GET /invites/pending?email=` returns pending invites (student names, inviter) for any email supplied. | `students.ts:417-447` | privacy |
| D3 | `DELETE /api/students/:id` requires only `hasAccess`: a caregiver can delete the student. `PUT /:id` is owner-only, so an admin co-parent cannot fix a name. | `students.ts:3222-3240`, `3192` | security |
| D4 | Adding/removing portal sources, editing credentials and triggering syncs require only `hasAccess`. | `students.ts:3306, 3404, 3484, 3545, 3692` | policy |
| D5 | Invite email links point at pages that do not exist. | `InviteEmailSender.ts:53-54`; `web/app` has no `dashboard/invites`, `register` ignores `invite` | broken flow |
| D6 | Shared adults get no push and an empty alert inbox (alerts keyed to the owner). | §2.4 | missing feature |
| D7 | Shared students count against the invitee's plan cap. | §2.5 | billing |
| D8 | Web shows owner controls to everyone (`isOwner={true}`); the API rejects, but the UI misleads. | `students/[id]/page.tsx:268` | UX |
| D9 | Two route families for one feature; the web uses a mix. | §2.2 | maintenance |

## 4. Design

### 4.1 Vocabulary
- **Owner**: the account that created the student. Exactly one per student. Pays for the plan that
  covers the student.
- **Admin**: an accepted adult with `isAdmin`. Can do what the owner does except remove the student,
  transfer ownership, or change owner-only preferences.
- **Member**: an accepted adult without admin. Sees everything, manages only their own alerts.
- **Label**: `parent | guardian | caregiver`. Display only; permissions never derive from it.
- UI name for the feature: **Family & guardians** ("Family & guardians for Ava"). Avoid "household": the
  code already uses that word for portal accounts (`routes/household`).

### 4.2 Permission matrix (decided 2026-11-09)

| Action | Owner | Admin | Member |
|---|---|---|---|
| View grades, assignments, materials, runs, trends | yes | yes | yes |
| Receive alerts by email / SMS / push, per own preferences | yes | yes | yes |
| Alert inbox for the student; acknowledge (per person, see 4.5) | yes | yes | yes |
| Set own alert preferences (on/off, channels, types); "silence" = all channels off | yes | yes | yes |
| Request a sync (client-led; a phone with the portal login completes it) | yes | yes | yes |
| Connect / disconnect a portal, edit credentials | yes | yes | no |
| Edit student (name, grade, student id) | yes | yes | no |
| Invite, resend link, remove people, change their label or alert prefs | yes | yes | no |
| Promote / demote admin | yes | yes (not the owner) | no |
| Remove themself ("leave"); their alerts and tokens stop at once | – | yes | yes |
| Remove the student and synced data | yes | no | no |
| Owner alert prefs, student alert email, student logins | yes | no | no |
| Transfer ownership (v2) | yes | no | no |
| Plan / billing for the student | yes | no | no |

### 4.3 One API: `/contacts` is canonical; `/sharing` adds the cross-student pieces
- Keep `/api/students/:id/contacts*` as the per-student API (it already has name, phone, channels,
  SMS opt-in, magic links, self-prefs). Make `/api/students/:id/parents*` thin aliases for one release,
  then remove. The web moves to `contacts`.
- New `/api/sharing` for things that span students (email always from the JWT, never the body):
  - `POST /api/sharing/invites` `{ email, name?, phone?, label, isAdmin?, studentIds[], alertChannels? }`
    → requires `canAdmin` on every student; one `sharedWith` entry per student with a shared
    `inviteGroupId` and `invitedByUserId`; skips students where the email is already invited/accepted
    (reported per student, not an error); issues ONE invite token bound to `(email, studentIds[])`,
    7-day TTL, re-sendable; sends ONE email. Returns `{ inviteGroupId, perStudent[], smsOptInUrl? }`.
  - `GET /api/sharing/invites/pending` → pending invites for the caller's email (replaces the query
    param version).
  - `POST /api/sharing/invites/accept` `{ inviteGroupId }` or `{ studentIds[] }`;
    `POST /api/sharing/invites/decline` likewise.
  - `POST /api/sharing/invites/:groupId/resend` (canAdmin).
  - `POST /api/sharing/leave` `{ studentId }` → the caller removes their own accepted row; outstanding
    tokens invalidated; an audit event and an email to the owner ("Jessica no longer follows Ava").
    This replaces the self-removal ban in parental-access-control.md §2 (owner decision 2026-11-09).
  - `GET /api/sharing/mine` → for the caller: each accessible student with `access: owner|admin|member`,
    the inviter, and the caller's alert prefs for it.
- `IStudentListItem` gains `access: 'owner' | 'admin' | 'member'` and `peopleCount`.
- Contracts: move `ISharedParent` (wire), `IPendingInvite`, `IInviteRequest`, `IInviteResult` into
  `packages/contracts/src/types/api/sharing.ts`; web and phone import them.
- Magic consume for an invite token: accept every student in the token for that email; create the
  user if needed with `mustSetPassword: true` (the phone and web then prompt "set a password", using
  the existing reset flow). The existing `/magic` page and the app's deep link need no change.

### 4.4 Invitation flow
1. Owner or admin picks a person (email, optional name/phone, label, admin yes/no) and one or more
   students. Web: "Share" dialog on the dashboard and on a student page. Phone: "Share" on the
   Students screen and on a student's People screen.
2. Server creates the pending entries and sends one email: "Ricardo invited you to follow Ava,
   Christian and Gideon on Scholarmancy" with one button (magic invite link, 7 days) and a fallback
   line "or sign in at scholarmancy.com and open Invites". If `phone` and SMS were requested, the
   response includes the SMS opt-in link for the owner to pass on (unchanged consent-first rule).
3. Invitee taps the button. On a phone with the app installed, `/magic` opens the app; otherwise the
   web. They are signed in; the students appear with a "Shared with you" badge. If the account is
   new, a one-time "Set a password" prompt appears (dismissable; forgot-password also works).
4. Signed-in users also see a Pending invites banner (web `/dashboard/invites`, phone Students
   screen) with Accept / Decline per invitation.
5. Owner sees status per person per student: Invited · Accepted · Declined, and Texts: none /
   invited / opted in. Resend is one tap. Declined entries can be re-invited (BFR-004 behaviour kept).

### 4.5 Alerts for shared adults
- `alertChannels` gains `'push'`. Default for a newly accepted adult: `['email','push']` (decided).
  Every adult can silence a student (all channels off) or trim channels and types from the phone's
  Notification settings screen, which gains a per-student section for shared students, and from the
  web People card ("My alerts").
- Resolver returns `userId` for accepted adults (they always have one once accepted). Push delivery
  sends to each recipient's registered devices when their channels include `push`. Email/SMS unchanged.
- Inbox: `GET /api/alerts-api` lists alerts whose `studentId` is one the caller can access (owner or
  accepted), filtered by the caller's `alertTypes` for that student, and marked acknowledged for the
  caller only. Storage: add `acknowledgedBy: Record<userId, ISO date>` to Alert; migration copies
  `acknowledged/acknowledgedAt` into `acknowledgedBy[owner]`. The legacy fields stay for one release.
- Push tap routing (shipped in batch 1) already carries `studentId`, so a shared adult lands on the
  right student.

### 4.6 Plan limits
Count owned students only (`findOwnedByUserId`) in both the manual create and ingest checks. Shared
access is free to the invitee; the owner's plan covers the student. Pricing page gains one line:
"Sharing a student with co-parents, guardians and caregivers is included and does not count against
their plan."

### 4.7 Security and privacy rules
- Identity = the JWT's email (`req.userEmail`, set by the auth middleware). Request bodies never choose
  whose invite is accepted or listed.
- Invite and magic tokens: random 32 bytes, stored hashed, single use, 7 days (invite) / 24 h (resend
  link), invalidated when the invite is removed or the person is removed.
- Revocation is immediate and total (already covered by BFR-001..005); also invalidate the person's
  outstanding tokens and unregister their push for that student.
- Audit log (model exists): `sharing.invited`, `sharing.accepted`, `sharing.declined`,
  `sharing.removed`, `sharing.admin_changed`, `sharing.link_sent`, with actor, target email, student.
- Rate limit invites (20 per user per day) and resends (5 per invite per day).
- Responses never reveal whether an email already has an account.
- Phone: shared students' portal credentials are NOT shared; an admin connecting a portal on their
  phone stores the password on their own device only (unchanged model).

### 4.8 Web UX
- Dashboard: "Share" button → dialog: person details → multi-select students → send. Pending invites
  banner at the top when any exist, linking to `/dashboard/invites` (Accept / Decline).
- Student page: tab renamed **Family & guardians**. Cards per person: name/email, label,
  Owner/Admin/Member chip, status chip, Texts chip, "My alerts" (for the viewer's own row), Resend
  link, Make admin, Remove, and "Leave" on the viewer's own row. Controls hidden unless the viewer's
  `access` allows them (no more hard-coded `isOwner`).
- `/invite?token=` landing page handles a web click on the email button: not signed in → sign in or
  register with the token preserved → accept; signed in → accept.
- Students list: "Shared with you · by Ricardo" under a shared student's name.

### 4.9 Phone UX (JS only; ships as an OTA update)
```
Students                                 ┌ Family & guardians · Ava ────────┐
┌──────────────────────────────┐         │ ‹ Back                   Share + │
│ You have 1 invitation  [View]│         │ Ricardo (you)  Owner             │
├──────────────────────────────┤         │ Robert Lewis   Member · Accepted │
│ (A) Ava      Grade 10   ›    │         │   Texts: opted in     [Resend]   │
│     Shared with 2 people     │         │ Jessica Lewis  Admin · Invited   │
│ (C) Christian Grade 7   ›    │         │   [Resend] [Make admin ✓] [Remove]│
│ (G) Gideon    Grade 4   ›    │         └──────────────────────────────────┘
│                   [Share…]   │
└──────────────────────────────┘         Share with someone
                                         Email ______  Name ______
Jessica's phone:                         Label (Parent ▾)  Admin [ ]
│ (A) Ava   Shared with you · by Ricardo │ Students: [x] Ava [x] Christian [x] Gideon
│ (C) Christian  Shared with you          │ Alerts: [x] Email [ ] Text [x] Push
│ (G) Gideon     Shared with you          │                     [Send invitation]
```
- Students screen: pending-invite banner (Accept / Decline), "Shared with you" line, "Share…" for
  owner/admin.
- Student → Family & guardians screen (list, share, resend, make admin, remove, leave; role-aware).
- Settings → Notification settings: a section per shared student with the viewer's own channels and
  types and a one-tap "Silence Ava"; changes write `alertChannels`/`receiveAlerts` on their row.
- Dashboard header "Edit" and Settings "Disconnect / remove" hidden for members; remove student hidden
  for admins.

## 4.10 As built (S0 #132, S1 #142; 2026-11-09/10)
- Identity: `/invites/pending`, accept and decline use the JWT email; a foreign body email is refused (403).
- Invite-created accounts carry the existing `forcePasswordReset` flag (no separate `mustSetPassword`);
  cleared by reset-password, admin set-password and OAuth sign-in. Emails are normalised (trim+lowercase)
  on register/OAuth; `findByEmail` falls back to a case-insensitive exact match for legacy rows.
- `POST /api/sharing/invites` refuses the WHOLE request when any student is not administrable by the caller
  (403/404); duplicates per student are reported as `already_invited` / `already_accepted`, never an error;
  the daily invite slot is consumed only when an email is actually sent. The SMS opt-in link (when a phone
  and text channel are given) is issued against the first newly invited student.
- `sharedParent` sign-in tokens are scoped per student; leaving one student does not revoke links for others.
- `POST /api/sharing/invites/resend-contact { studentId, email }` re-issues a legacy single-student pending
  invitation as an invite group (S2 follow-up).
- `IStudentListItem` carries `access`, `peopleCount` and `invitedBy` (S2 follow-up).
- Audit rows use the admin audit log with `sharing:*` actions; the actor fields hold the acting parent.
- `/api/students/:id/parents*` remain as thin aliases of `/contacts*` (deprecated; web no longer calls them).

## 4.11 As built (S2 #145 web, S3 #144 alerts)
- Web: Share dialog (dashboard and student page), `/dashboard/invites`, **Family & guardians** tab on
  `/contacts`, role-aware controls (owner / admin / member), "Shared with you · by <name>", Leave on the
  viewer's row, "Set a password" banner for invite-created accounts (keyed per user, cleared on logout and
  on reset). At least one channel is required when inviting (server rejects an empty list). Legacy pending
  rows (no invite group) are shown one card per student and re-sent through
  `POST /api/sharing/invites/resend-contact`. The pricing page states that sharing is included.
- Alerts: every accepted adult receives by their own channels (`email`, `sms`, `push`); push goes to each
  person's own devices; a silenced adult gets nothing. Newly accepted adults default to `['email','push']`;
  the owner keeps `['email']` unless set. Inbox lists alerts for students the caller can access, trimmed by
  the caller's `alertTypes`; acknowledgement is per person (`acknowledgedBy`); legacy fields follow the owner;
  delete stays owner-only. Ingest now writes the student's account id on alert rows; two env-gated boot
  migrations (`ALERT_STUDENT_ID_MIGRATION`, then `ALERT_ACK_BY_MIGRATION`; dry-run → apply) rewrote legacy
  rows (UAT: 0 and 4 rows; production: 7 and 0 rows, both applied 2026-11-10). Operational note: on the
  production Railway environment a variable change alone does not deploy and a plain redeploy waits forever;
  use `railway redeploy --from-source` after setting the variable with `--skip-deploys`.
- Test fixture: `POST /api/seed/set-plan` (seed-gated) puts an e2e owner on a paid plan.

## 4.12 As built (S4 #147 phone)
- Students screen: invitations banner → Invitations screen (Accept / Decline per group), "Shared with you · by
  <name>", "Share…" for owner/admin → Share screen (person, label, Can manage, multi-select students, channels
  with Email + Push on by default, Text needs a phone, at least one channel) → per-student results and the SMS
  opt-in link through the system share sheet.
- Dashboard → **Family & guardians** screen: chips (Owner / Admin / Member; Invited / Accepted / Declined;
  Texts none / invited / opted in), Resend, Make admin, Remove, and on the viewer's row My alerts (channels incl.
  push, alert types, Silence) and Leave. The owner row shows the owner's name and email (server now returns them).
- Notification settings: a section per shared student with the viewer's channels/types and Silence; "all alert
  types" is sent as `alertTypes: null` (server clears the filter); the self row is matched by account id when
  the login email differs from the invite address.
- Role-aware hiding per §4.2 (Edit / Remove student, server-side Disconnect, Connect source). Home data
  (students, pending invitations, inviter names, access map) is loaded once by the app shell and passed down;
  a failed refresh keeps the previous data (never drops a parent into onboarding).
- "Set a password so you can sign in next time" banner for accounts with `forcePasswordReset`, re-checked on
  foreground. JS-only: ships as an OTA update.
- Maestro `share` suite exists but needs a second UAT parent account (`MAESTRO_COPARENT_EMAIL/PASSWORD`).

## 5. Implementation plan

Each phase is one PR, green CI, with the tests named. Effort is for one developer.

### S0. Security fixes (2–3 days) — ship first, server-only
- D1, D2: accept/decline/pending use `req.userEmail`; body `email` ignored; 403 on mismatch.
- D3: `DELETE /:id` owner-only; `PUT /:id` admin. D4: sources add/remove/credentials admin; sync
  trigger stays `hasAccess` (decided: members may request a sync).
- Audit events for invite/accept/decline/remove/admin.
- Tests: API unit tests for each rule (positive and negative); extend `15-blended-family-revocation`
  with "member cannot delete student / add source"; e2e `08-multi-parent` MP-005 variant for accept
  with a foreign email → 403.

### S1. API foundation (3–4 days)
- Contracts `sharing.ts`; `access` + `peopleCount` on the student list item.
- Plan limit counts owned only (D7) + tests.
- `POST /api/sharing/invites` (multi-student), pending/accept/decline/resend/leave, `GET /api/sharing/mine`.
- Invite token kind `inviteGroup` in `MagicLoginTokenRepository`; `/api/auth/magic` accepts all
  students in the token; `mustSetPassword` on created users.
- `InviteEmailSender`: one email per group, working links (D5).
- `/parents/*` become aliases of `/contacts/*`; deprecation note in CLAUDE/AGENTS docs.
- Tests: API integration (real Mongo) for every endpoint incl. duplicate/partial skips, token reuse,
  expiry, canAdmin on each student, email-from-JWT.

### S2. Web (3–4 days)
- Share dialog (dashboard + student page); `/dashboard/invites`; `/invite?token=` landing.
- `ManageParentsCard` → `FamilyCard` on `contacts`, role-aware (D8), status + Texts chips, My alerts, Leave.
- "Shared with you" on the students list; member/admin control hiding.
- Tests: component tests; Playwright: new `19-sharing-scenario.spec.ts` = the owner's exact scenario
  with throwaway accounts (three people, three students, six grants), each person's view checked,
  removal and re-invite; MP/BFC specs updated to the new endpoints.

### S3. Alerts to shared adults (4–5 days)
- `push` channel; resolver `userId` for accepted adults; push delivery per recipient devices.
- Alert `acknowledgedBy`; inbox by accessible students; per-viewer acknowledge; migration (boot,
  env-gated like the earlier ones) + legacy fields kept one release.
- Tests: agents unit tests for fan-out (owner + 2 shared, mixed channels, alertTypes filter); API
  tests for inbox visibility and per-viewer ack; e2e BFC alert path (shared adult sees and clears).

### S4. Phone (5–7 days, OTA)
- Client methods for `/sharing/*` and `/contacts/*`; `access` on the list item.
- Pending-invites banner + Accept/Decline; "Shared with you" line; Family & guardians screen; Share
  flow; Leave; Notification settings per shared student with Silence; role-aware hiding of Edit /
  Remove / Disconnect.
- Tests: pure view-models + client tests (mocked fetch); Maestro: `share.yaml` (owner invites on the
  simulator against UAT), `accept.yaml` (second account accepts via a pending-invite banner), both
  with throwaway UAT accounts seeded by a script.

### S5. Later (not in this plan's estimate)
Transfer ownership; invite expiry reminders; a true household entity
("share all my children with X" and plan ownership at household level).

Total for S0–S4: about 4 weeks for one developer. The owner's scenario works on the web after S2
(~2 weeks), with alerts after S3, and on phones after S4.

## 6. Acceptance test for the owner's scenario (run on UAT, throwaway accounts only)
Accounts: `owner+share@…`, `robert+share@…`, `jessica+share@…`, `jennifer+share@…` (test mailbox;
never the family's real addresses in the public repo).
1. Owner creates Ava, Christian, Gideon.
2. Owner shares Ava → Robert; Ava + Christian + Gideon → Jessica (admin); Christian + Gideon →
   Jennifer. Six grants, three emails sent.
3. Robert opens his link on the phone → signed in → sees only Ava, badge "Shared with you".
4. Jessica accepts on Android → sees three students; as admin she can edit Christian's grade and
   invite; she cannot remove a student.
5. Jennifer accepts on the web → sees Christian and Gideon only; "Edit" is hidden.
6. A grade-drop alert for Ava: owner, Robert and Jessica get it by email and push (defaults); Jennifer
   does not. Jessica acknowledges; owner's inbox still shows it unread. Robert silences Ava; the next
   alert reaches owner and Jessica only.
6b. Jennifer leaves Gideon herself: she keeps Christian; owner gets an email; Gideon's alerts stop.
7. Owner removes Robert from Ava: Robert's app shows no students; his link no longer works.
8. Jennifer (free plan) adds her own child: allowed; shared students did not count.

## 7. Out of scope
Student self-registration; sharing with non-adults; school-side access; per-course sharing.

## 8. Decisions (made by the owner, 2026-11-09)
- Q1. Members may request a sync: **yes**.
- Q2. Acknowledgement is **per person**.
- Q3. A shared adult may **leave** on their own: **yes** (reverses parental-access-control.md §2).
- Q4. Default channels for a newly accepted adult: **email + push**; anyone can silence a student.
- Q5. UI name: **Family & guardians**.
