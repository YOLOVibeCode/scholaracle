# Student review: helping a student keep track of what they need

Status: APPROVED by the owner on 2026-11-09 (decisions in §6); ready to implement. Companion to `docs/sharing-spec.md`; follows the rules in
`docs/PARENT_STUDENT_STUDIO_CHECKLIST.md` (no grade leak, one composer per view in `studio-core`,
narrow ports, tests first). Verified on main `89d513f`.

## 1. What the student has today (verified)
- **Today** (`GET /api/studio/today`, `studio-core/TodayGuide.ts`): one encouragement line, exactly
  one next step (a missing assignment beats a due-soon one), and an "also today" list. Open tasks are
  only `missing` or `due_soon` (within `DUE_SOON_MS`, `routes/studio/studioTaskClassify.ts`). Phone:
  `TodayScreen` / `TodayView`. Web: `/studio`.
- **Work pack** per assignment: instructions, the primary file (cached offline), captured pages,
  "needs school login" links, more from the course. Phone `WorkPackView`, web `/studio/assignments/…`.
- **Student status** the student sets on an assignment: `not_started | working_on_it | need_help |
  done` (`routes/studio/studio.ts:18`). The parent board shows it as `studentStatus`
  (`contracts/types/api/actionBoard.ts:39`). Nothing happens when a student picks **need_help**: no
  alert, no push, no badge for the adults.
- **Nudge**: a parent sends one push per assignment per day to the student (`routes/students/nudge.ts`).
- Wins for encouragement: `graded`, `opened_pack`, `on_time_streak` (`interfaces/studio/ITodayGuide.ts`).
- Grades are hidden from the student unless the parent enabled them (`assertNoGradeLeak`).
- Student sessions register for push (`App.tsx:223`), so the phone can receive a weekly review.

Gaps: nothing beyond today; no way to see the week, what is still owed, or what was finished; "Need
help" is a dead end; no regular review moment.

## 2. Goals
1. A student can see, in one place, what is due this week, what is still owed, and what they finished.
2. One tap to say "working on it", "done" or "I need help", and "need help" reaches the adults.
3. A short weekly review that arrives on its own, so the student does not have to remember to look.
4. For each item, what the student needs to do it: a saved file, a school login, or internet.
5. Nothing new leaks grades; the parent-side rules in the studio checklist stay intact.

## 3. Design

### 3.1 This week (new view)
`GET /api/studio/week` → `IWeekView`, composed by a pure `WeekGuide` in `studio-core` on the existing
`ITodaySource` port, extended with `kind: 'upcoming'` for open tasks due within the next 7 days and
beyond `DUE_SOON_MS`.
```
IWeekView {
  encouragement: string;                  // same rules as Today, reused
  owed: IWeekItem[];                      // missing / late, oldest first
  days: { date: ISO; label: 'Today'|'Tomorrow'|'Wed'…; items: IWeekItem[] }[];  // next 7 days
  doneThisWeek: IWeekDone[];              // student marked done, or portal says turned in/graded (no score)
  counts: { owed: number; due: number; done: number };
}
IWeekItem {
  assignmentExternalId; title; courseName; dueAt?;
  studentStatus: 'not_started'|'working_on_it'|'need_help'|'done';
  humanStatus: string;                      // 'Not turned in' (portal says missing/late) or 'Past due' (overdue, portal silent)
  needs: ('saved_file'|'school_login'|'internet')[];   // from the work pack partition, no fetch per item
  primaryCtaLabel;
}
```
Rules (as built in R1, PR #133): open tasks past due that the portal has NOT flagged are kind `overdue`
and sit in `owed` after the missing ones, labelled "Past due"; Today ignores them. The 7-day cut is done
once, by local calendar day, in `WeekGuide`. A finished item counts for this week only with evidence
(`submittedAt`, `gradedAt`, or the student's own `done` + its timestamp); otherwise it is left out.
An item the student marked `done` leaves `days`/`owed` and joins `doneThisWeek` until the
portal confirms; if the portal later says missing, it returns to `owed` with the label "Marked done,
but the school shows not turned in". `assertNoGradeLeak` applies to the whole view.

### 3.2 One-tap status, and "Need help" that goes somewhere
- Status taps use the existing `PATCH /api/studio/assignments/:id/status`.
- Setting `need_help` creates an alert of a new type `student_needs_help` for that student, delivered
  to **Family & guardians** by their own channels (owner now; shared adults after sharing phase S3),
  at most one per assignment per 24 h. The parent action board shows the item in `needs_attention`
  with "Asked for help 2 h ago"; the parent's existing Nudge becomes "Reply with a nudge". Optional
  short note from the student (≤140 chars) travels with the alert.
- The student sees "Your grown-ups were told" and can clear it by moving the status on.

### 3.3 Weekly review (push, Sunday 6 pm in the student's time zone; parent can change the day/time)
A student push and, if the student has an `alertEmail`, an email: "This week: 3 due · 1 still owed ·
you finished 4. Tap to see the plan." Deep link opens **This week**. Built by the agents worker from
`WeekGuide` (same composer, no second truth). Parents are not copied by default (they have digests);
a per-student toggle "Send me a copy" in the parent's alert prefs (decision Q2).

### 3.4 Where it lives
- Phone student mode: `TodayScreen` gets two tabs, **Today** (unchanged) and **This week**; both share
  the status tap sheet. Push for the weekly review routes to **This week**.
- Web `/studio`: a "This week" link beside Today; `/studio/week` page.
- Parent dashboard: no new page; the `needs_attention` bucket and the alert inbox carry "needs help".

### 3.5 Sketch
```
Student · This week                    ┌ Need help? ───────────────────┐
┌────────────────────────────────────┐ │ Tell your grown-ups you're    │
│ You finished 4 things. Nice.       │ │ stuck on "Ch. 5 problems".     │
│ STILL OWED                         │ │ Note (optional) __________     │
│ ⚠ Ch. 4 worksheet · Math  [Need help]│ │            [Send]  [Cancel]    │
│ TODAY                              │ └───────────────────────────────┘
│ ○ Essay draft · English 🔒 login   │
│ TOMORROW                           │ Parent board, Needs attention:
│ ◐ Ch. 5 problems · Math 📄 saved   │ │ Ch. 5 problems · Gideon        │
│ THU                                │ │ Asked for help 2 h ago         │
│ ○ Lab report · Science 🌐 internet │ │ "I don't get #7"  [Reply w/ nudge]│
│ DONE THIS WEEK (4)              ›  │
└────────────────────────────────────┘
○ not started · ◐ working on it · ✓ done
```

## 4. Implementation plan (one developer)
- **R1. Core + API (2–3 days).** `IWeekView` in contracts; `WeekGuide` with table-driven tests (owed
  ordering, 7-day bucketing across a month boundary, done-then-missing rule, needs glyphs, no grade
  leak); `GET /api/studio/week`; `upcoming` classification; API tests incl. IDOR (student token only
  sees their student).
- **R2. Student UI (3–4 days).** Phone tabs + status sheet + need-help note; web `/studio/week`;
  Maestro flow in student mode (log in via magic link as MP-008 does, open This week, mark an item
  working on it, ask for help, verify the parent board shows it). Ships OTA.
- **R3. Need-help alert (2–3 days).** `student_needs_help` alert type; creation on status change with
  the 24 h rule; delivery through the normal recipient resolver (so sharing S3 extends it to shared
  adults automatically); parent board "Asked for help" + "Reply with a nudge"; tests at each layer.
- **R4. Weekly review (2 days).** Worker schedule per student time zone; push + optional email; parent
  copy toggle; tests for scheduling and for an empty week ("You're caught up.").
Total about 2 weeks. R1–R3 are independent of the sharing work; R3's reach to shared adults depends
on sharing S3.

## 5. Acceptance (UAT, throwaway student)
1. A student with 1 missing, 2 due this week and 1 due next week opens This week: owed shows 1,
   days show 2, next week's item is absent; no scores anywhere with grades disabled.
2. Student marks the missing item "Need help" with a note: owner and shared adults (with push) get one
   push; the parent board shows "Asked for help"; a second tap within a day sends nothing.
3. Student marks an item done: it moves to Done this week; a later portal sync saying missing moves it
   back with the warning label.
4. Sunday 6 pm: the student's phone gets the weekly review; tapping it opens This week.

## 6. Decisions (made by the owner, 2026-11-09)
- Q1. Horizon: **rolling 7 days**.
- Q2. Parents do **not** get a copy of the weekly review by default; per-student toggle.
- Q3. The student **may** attach a note to "Need help", 140 characters.
