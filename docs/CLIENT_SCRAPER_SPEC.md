# Client Scraper Specification

> Version 1.0 — 2026-08-14
>
> Authoritative contract for **every client scraper** (iOS WebView, browser
> extension, local CLI). The server never logs into school portals. Clients
> extract, normalize into `ISlcIngestEnvelopeV1`, and upload. The server
> stores the envelope, generates alerts, and runs **join intelligence**
> across subjects, grades, and resources.
>
> Field-level catalog: [`DATA_EXTRACTION_CHECKLIST.md`](./DATA_EXTRACTION_CHECKLIST.md)
> Envelope types: `packages/contracts/src/models/Ingest.ts`

---

## 1. What a client scraper is for

```
School portal  --login+extract-->  Client device  --envelope only-->  Scholaracle API
                                                                  |
                                                                  v
                                                            Workers (alerts, digest)
```

| Client | Runtime | Credentials live in |
|--------|---------|---------------------|
| iOS app | WebView + `SyncOrchestrator` | Keychain |
| Browser extension | Content script | `chrome.storage.local` |
| Local CLI (`scholaracle-scraper`) | Playwright on the user's machine | Local config file |

All three **must** produce the same envelope shape, pass the same validator,
and emit the same join keys. Transformers in `@scholaracle/scraper-core` are
the shared implementation; custom CLI scrapers must still satisfy this spec.

The server does **not** scrape, decrypt portal passwords, or fetch Classroom
APIs. If a join cannot be made, it is because the envelope lacked keys or
hints — not because the server should have logged in.

---

## 2. The product needs four pictures

A complete student view is four joined pictures, not a pile of rows.

| Picture | Built from | Authoritative source |
|---------|------------|----------------------|
| **Who / where** | `studentProfile`, `institution`, `academicTerm`, `teacher` | Any |
| **Official grades** | `gradeSnapshot` + `course` | SIS (Skyward, Aeries) |
| **What is due / missing** | `assignment` | LMS (Canvas, Classroom) first; SIS fills graded/missing |
| **What to study with** | `courseMaterial` linked to course **and** assignment | LMS files, modules, attachments |

Join intelligence exists so that:

- Skyward `"ALGEBRA 1"` and Canvas `"algebra🔢"` become **one subject**.
- A Canvas file `"5.A Independent Practice.pdf"` attaches to assignment
  `"5.A - Independent Practice"` in that course.
- The **Skyward percent** is the grade shown; Canvas assignments still drive
  the action board.

If the envelope omits join keys, intelligence cannot invent them.

---

## 3. Identity rules (MUST)

Every upsert op has `key = { provider, adapterId, externalId, … }`.

1. **`externalId` is stable across runs.** Re-scraping the same portal object
   must produce the same `externalId`. The ingest pipeline upserts on
   `(provider, adapterId, externalId)`.
2. **Prefer the platform's native ID.** Examples:
   - Canvas course `12345` → `canvas-course-12345`
   - Canvas assignment `987` → `canvas-assignment-987` (not `…-assignment-3`)
   - Canvas file `555` → `canvas-file-555`
3. **If the portal has no native ID**, use a **stable composite** of
   attributes that do not change week to week (period + course title slug),
   never an array index.
4. **Never emit the grades-API merged course hash** (`12-char sha256` from
   `course-reconciler`). That ID is a **read model**. Scrapers emit **raw**
   platform IDs only. The API merges after ingest.
5. **`key.courseExternalId` and `record.courseExternalId` must be identical**
   when both are present.

### Known gap (fix in transformers)

The current Canvas transformer keys assignments as
`canvas-{courseId}-assignment-{arrayIndex}`. Index-based IDs break join
stability when the assignment list order changes. New scrapers MUST use
native Canvas assignment IDs. Existing index IDs should be migrated, not
copied.

---

## 4. Join-key contract (MUST)

The course is the hub. Every academic fact points at a course that exists
**in the same envelope**.

```
                    academicTerm
                         ▲
                         │ termExternalId
                         │
teacher ──courseExternalIds──► course ◄── courseExternalId ── assignment
                                 ▲  ▲                            ▲
                                 │  │                            │
                    gradeSnapshot│  │courseMaterial              │
                                 │  │   assignmentExternalId ────┘
                                 │
                          attendanceEvent / message
```

| Entity | Required join fields | Points at |
|--------|----------------------|-----------|
| `course` | `key.externalId` | (hub) |
| `gradeSnapshot` | `key.courseExternalId` **and** `record.courseExternalId` | `course.key.externalId` |
| `assignment` | `key.courseExternalId` **and** `record.courseExternalId` | `course.key.externalId` |
| `courseMaterial` | `record.courseExternalId` | `course.key.externalId` |
| `courseMaterial` | `record.assignmentExternalId` when the portal shows a link | `assignment.key.externalId` |
| `attendanceEvent` | `record.courseExternalId` when period-level | `course.key.externalId` |
| `message` | `record.courseExternalId` when course-scoped | `course.key.externalId` |
| `teacher` | `record.courseExternalIds[]` | `course.key.externalId` |
| `eventOverride` | `record.seriesExternalId` | `eventSeries.key.externalId` |
| `academicTerm` | `record.parentTermExternalId` when nested | parent term `key.externalId` |

**Envelope-local integrity:** every `courseExternalId` value MUST match a
`course` op `key.externalId` in the same envelope (or the course must be
emitted in that run). Dangling FKs are a scraper bug, not a server join
problem.

---

## 5. Completeness by provider role

Clients scrape whatever the portal shows. Roles tell the validator what
"complete" means.

### SIS — Skyward, Aeries (official record)

| Entity | Floor | Why |
|--------|-------|-----|
| `course` | one per enrolled class | Hub for grades |
| `gradeSnapshot` | one per course (current term) | Official percent / letter |
| `academicTerm` | current grading period | Snapshot belongs to a term |
| `assignment` | missing + graded in current term | SIS truth for "is it in the gradebook" |
| `attendanceEvent` | if the portal has attendance | Alerts |
| `studentProfile` | once per run | Identity |

SIS scrapers **should** emit schedule fields on `course` (`period`,
`teacherName`, `room`, `startTime` / `endTime`). Those are the strongest
cross-provider join hints.

### LMS — Canvas, Google Classroom (work and materials)

| Entity | Floor | Why |
|--------|-------|-----|
| `course` | one per enrolled class | Hub for work |
| `assignment` | every current-term assignment | Action board, missing work |
| `courseMaterial` | files / modules / syllabus | Study resources |
| `gradeSnapshot` | working grade if shown | Secondary; SIS wins on conflict |
| `message` | course announcements | Context |

LMS scrapers **should** emit `course.courseCode`, `course.period`,
`course.teacherName`, assignment `dueAt` / `pointsPossible` / `category`,
and material `fileName` + `extractedText`.

### Google Classroom gap

Classroom is **not** extracted on iOS today, and server-side Classroom fetch
is discontinued. Until a client implements it, Classroom data will not
appear. Web copy must say that. Do not store Google refresh tokens on the
server as a workaround.

---

## 6. Join hints (SHOULD) — what intelligence actually uses

Intelligence cannot join on vibes. It uses these fields. Omit them and
match confidence drops.

| Hint | Used by | If missing |
|------|---------|------------|
| `course.title` (raw portal text, do not over-clean) | Subject classifier + course merge | Cannot map Canvas ↔ Skyward |
| `course.teacherName` | Split same-title courses (two Algebra 1s) | May merge the wrong sections |
| `course.period` | Same | Same |
| `course.courseCode` | Extra merge signal | Weaker SIS↔LMS match |
| `assignment.title` | Assignment reconciler (title scorer) | Cannot suppress false "missing" |
| `assignment.dueAt` | Date scorer | Title-only match |
| `assignment.pointsPossible` | Points scorer | Title-only match |
| `assignment.category` | Category scorer | Title-only match |
| `courseMaterial.fileName` | Deterministic + LLM material match | Files stay unlinked |
| `courseMaterial.extractedText` / description | LLM material match (layer 3) | Filename-only |
| `courseMaterial.assignmentExternalId` | Direct join (best) | Fall back to layers 1–3 |
| Canvas **modules** (`contentId` on Assignment + File items) | Layer 1 co-occurrence | Fall back to description links + LLM |
| Assignment description HTML with file links | Layer 2 | Fall back to LLM |

**Do not pre-merge courses on the client.** Emit Canvas courses with Canvas
IDs and Skyward courses with Skyward IDs. The server's `course-reconciler`
creates the merged subject. If the client merges first, SIS vs LMS
precedence is lost.

**Do not drop unmatched materials.** Upload them with `courseExternalId` and
no `assignmentExternalId`. Layer 3 LLM matching runs on ingest for leftovers.

---

## 7. Intelligence layers (server)

Joins run **after** a valid envelope is stored. Each layer is allowed to
use only the fields in §6.

```
Layer 0  Intra-envelope FK
         courseExternalId / assignmentExternalId as emitted
         Deterministic. Failure = scraper bug.

Layer 1  Subject classification
         packages/connector/.../subject-reconciler.ts
         Title → { area, subArea, honors/AP, period, teacher token }
         Keyword taxonomy, confidence high/medium/low.

Layer 2  Cross-provider course merge
         packages/connector/.../course-reconciler.ts
         Group by normalizedTitle|area|subArea
         Split when BOTH period AND teacher differ
         mergedId = 12-char hash (grades API only)

Layer 3  Material → assignment (same course, same provider)
         L1: Canvas module co-occurrence (client transformer)
         L2: file URL/name in assignment description (client transformer)
         L3: LLM filename ↔ assignment title (ingest, fire-and-forget)
         Writes record.assignmentExternalId

Layer 4  Cross-provider assignment match
         packages/connector/.../assignment-reconciler.ts
         LMS assignment ↔ SIS assignment inside the same merged course
         Signals: title, points, due date, category, sequence
         Used to suppress "missing" when SIS already graded it

Layer 5  Grade precedence
         SIS (Skyward/Aeries) > LMS (Canvas/Classroom)
         See docs/grade-precedence.md
```

### How to join subjects, resources, and grades

**Same provider (one envelope):** Layer 0. If `gradeSnapshot.courseExternalId`
equals `course.key.externalId` and `courseMaterial.courseExternalId` equals
the same, they are already the same subject. Prefer also setting
`courseMaterial.assignmentExternalId`.

**Two providers (Canvas + Skyward for one student):**

1. Layer 1 classifies both course titles (`algebra🔢` and `ALGEBRA 1` →
   math/algebra).
2. Layer 2 merges them if period/teacher do not conflict.
3. Grades API returns the **merged** course id and the SIS percent as
   `officialGrade`.
4. Action-board assignments keep **raw** LMS `assignmentExternalId`.
5. Materials stay on the LMS course id; the grades UI aggregates material
   counts across all source ids in the merged group.

**Never join grades ↔ action-board on `courseExternalId`.** Grades responses
use merged hashes; assignment rows use raw platform ids. The only id that
is raw in **both** APIs is `assignmentExternalId`.

---

## 8. Validator gates

`validateEnvelope()` in `@scholaracle/scraper-core` is the gate every client
runs before upload.

| Check | Severity | Meaning |
|-------|----------|---------|
| Schema / run / source / per-op required fields | **error** | Envelope rejected |
| Course-scoped entity missing `courseExternalId` | **warning** | Ungradeable / unlinkable row |
| `courseExternalId` not present as a `course` op | **warning** | Dangling FK |
| `assignmentExternalId` on a material not present as an assignment op | **warning** | Dangling FK |
| Course missing all of `teacherName`, `period`, `courseCode` | **warning** | Weak cross-provider merge |
| SIS run with courses but no `gradeSnapshot` | **warning** | No official grades |
| LMS run with courses but no `assignment` | **warning** | No work to show |
| LMS run with courses but no `courseMaterial` | **warning** | No resources to join |

Warnings do not fail the run (`passed` is still true if `errorCount === 0`).
They are how we know a scraper is incomplete. Treat new warnings as bugs.

---

## 9. Transform vs scrape

| Layer | Responsibility |
|-------|----------------|
| **Recipe / extract** | Visit every required page; capture native ids, titles, files, modules |
| **Transformer** | Map to `ISlcDeltaOp[]`; set join keys; run Layer 1–2 material match when portal structure exists |
| **Validator** | Reject malformed envelopes; warn on unjoinable graphs |
| **Upload** | `POST /api/ingest/v1/runs/:runId/envelope` only — never credentials |
| **Server ingest** | Persist ops; Layer 3 LLM materials; alerts; later Layers 2/4/5 on read |

Transformers are pure. They must not call `Date.now()` for identity, must
not log secrets, and must not invent grades. Report the portal's number.

---

## 10. Minimum viable envelope (example)

```json
{
  "schemaVersion": "slc.ingest.v1",
  "run": {
    "runId": "…",
    "startedAt": "2026-08-14T12:00:00Z",
    "provider": "canvas",
    "adapterId": "canvas::default",
    "adapterVersion": "canvas@1.0.0+core@0.1.0",
    "mode": "delta",
    "timezone": "America/Chicago",
    "meta": { "clientType": "mobile" }
  },
  "source": { "sourceId": "src-canvas", "displayName": "District Canvas" },
  "ops": [
    {
      "op": "upsert",
      "entity": "course",
      "key": { "provider": "canvas", "adapterId": "canvas::default", "externalId": "canvas-course-123" },
      "observedAt": "2026-08-14T12:00:00Z",
      "record": { "title": "Algebra 1", "period": "4", "teacherName": "Chang", "courseCode": "ALG1" }
    },
    {
      "op": "upsert",
      "entity": "assignment",
      "key": {
        "provider": "canvas",
        "adapterId": "canvas::default",
        "externalId": "canvas-assignment-987",
        "courseExternalId": "canvas-course-123"
      },
      "observedAt": "2026-08-14T12:00:00Z",
      "record": {
        "title": "5.A - Independent Practice",
        "courseExternalId": "canvas-course-123",
        "dueAt": "2026-08-15T05:00:00Z",
        "pointsPossible": 10,
        "status": "missing"
      }
    },
    {
      "op": "upsert",
      "entity": "courseMaterial",
      "key": {
        "provider": "canvas",
        "adapterId": "canvas::default",
        "externalId": "canvas-file-555",
        "courseExternalId": "canvas-course-123"
      },
      "observedAt": "2026-08-14T12:00:00Z",
      "record": {
        "title": "5.A Independent Practice.pdf",
        "courseExternalId": "canvas-course-123",
        "assignmentExternalId": "canvas-assignment-987",
        "type": "document",
        "fileName": "5.A Independent Practice.pdf"
      }
    }
  ]
}
```

That envelope is fully joinable **inside Canvas**. A Skyward envelope for
the same student with `title: "ALGEBRA 1"`, `period: "4"`, `teacherName:
"Noah Chang"` lets Layers 1–2 merge the subject and Layer 5 pick the
Skyward snapshot as the official grade.

---

## 11. Out of scope for clients

- Merging Canvas + Skyward courses into one id
- Computing GPA or category weights the portal does not show
- Uploading portal username / password
- Launching Chromium on Scholaracle servers
- Implementing Google Classroom on iOS in this spec (document the gap only)
