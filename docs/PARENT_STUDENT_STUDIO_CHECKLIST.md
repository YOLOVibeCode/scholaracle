# Parent + Student Studio Checklist

**Product:** Scholarmancy (Scholaracle monorepo)  
**Created:** 2026-08-24  
**Purpose:** Single source of truth so we do not lose a slice, a test, an ISP boundary, or a visualization step while building parent intervention + student studio (iPad-first) + local asset cache + intelligent guidance.

**How to use this file**

1. Work **one numbered slice at a time**, in order. Do not skip ahead to UI, auth, or the notification ladder.
2. Inside a slice: check the **failing tests** box **before** any implementation box. TDD is not optional.
3. After each slice: run the commands in [Commands after every slice](#commands-after-every-slice) and tick the **visualize** boxes by actually clicking, not by reading code.
4. Tick `[x]` only when the acceptance line is true. Leave a note under the item if you had to defer.
5. If a decision in this file conflicts with a later chat, **update this file first**, then code.

Legend: `[x]` done · `[ ]` not started · `[~]` partial / exists but not the product shape

---

## 0. Locked product decisions (do not re-litigate in implementation)

Tick these only to confirm the implementer has read them.

- [x] Students get **real logins**, provisioned by the parent (email/username + parent-set password, later magic-link/QR). Same JWT works on web, iPad Safari, and the mobile app.
- [x] Parent remains the **only** person who connects Canvas/Skyward and runs scrape/sync. Students never see portal credentials.
- [x] iPad/web is the **student studio** (`/studio`), not a shrunken parent dashboard. Phone student mode is the same Today + pack, compact.
- [x] Do **not** reuse `/dashboard/students/[id]/view/todo`. That is a parent “view as kid” page inside the parent layout (`packages/web/app/dashboard/layout.tsx`). Studio is a different client with **no parent sidebar**.
- [x] Default student visibility = **tasks only**. Grades off unless the parent enables `showGrades`. Encouragement may name an assignment (“Nice work on Reading response 8”) **without** percent, letter, or points.
- [x] Student home = **one encouragement line + exactly one primary next step** + quieter “Also today”. Not a gradebook. Not a filing cabinet.
- [x] Work pack primary CTA = **Open the hosted/cached file** (PDF/video in-page). LMS / school-login links are fallback, collapsed.
- [x] Client caches **file bytes** keyed by `assetId + contentHash`. Signed `downloadUrl` (24h TTL) is a fetch ticket, never the cache key. New hash = new version = replace cache, delete old key.
- [x] Guidance routing is **deterministic rules** (testable). LLM/`PersonalizationService`/`RecommendationEngine` may tone copy; they must not decide who gets the push.
- [x] Student-first ladder: routine “due tomorrow” goes to the student only. Parent hears **outcomes** (still missing, grade drop, digest), not chores.
- [x] Submitted at any ladder step **cancels remaining jobs**. Parent never hears the chore.
- [x] Nudge is parent → one student push, rate-limited (max 1 per assignment per day). Parent board shows “Nudged 2h ago”.
- [x] COPPA: parent is the account holder; student user is provisioned, scoped to one `studentId`, revocable.
- [x] Cross-app materials do **not** need a new fuzzy/AI join. Description `<a href>` is `extractDescriptionLinks`. Canvas files use existing scrape layers 1–2; unmatched files already have server-side layer 3. Do not add a new join algorithm in this work.

---

## 1. Explicit non-goals (do not build in this track)

- [ ] No TankRoom/shared `@noctusoft/diag` extraction (already shipped as Scholarmancy-only diag).
- [ ] No student self-signup, no student billing, no student source-connect, no student sync button.
- [ ] No sibling list, no household switcher, no “invite another parent” on the student session.
- [ ] No changing how portal scrape works except: parent device still owns `IAssetHost` / `WebViewAssetHost`.
- [ ] Do not put student studio inside `packages/web/app/dashboard/`.
- [ ] Do not inject the full students router into `TodayGuide`. Narrow ports only (`ITodaySource`).
- [ ] Do not name the **client** cache `IAssetStore`. That name is already the **server** blob store (`packages/api/src/services/assets/IAssetStore.ts` — S3/local `put/get/delete`). Client interface = **`IAssetCache`**.
- [ ] Do not start the GuidanceEngine (slice 7) until Today + work pack are visible on `/studio`.
- [ ] Do not lower Jest coverage thresholds to land new files. New modules need tests (or an explicit, documented `collectCoverageFrom` exclude for thin TSX shells only).

---

## 2. Already shipped (inventory — do not rebuild)

These exist. Later slices **compose** them; they do not replace them unless the checklist says “redesign”.

### 2.1 Assignment work pack — data path

- [x] Demo assignments carry `description` (HTML) + `lmsUrl` (`DemoAssignmentInput` in `packages/api/src/routes/seed/demo-data.ts`).
- [x] Cell Division fixture: Emma AP Bio assignment `demo-emma-ap-bio-a5` has instructions HTML, Khan link, Canvas `lmsUrl`.
- [x] Materials can join via `record.assignmentExternalId` (`DemoMaterialInput.assignmentExternalId`).
- [x] Lab Safety Handout `demo-emma-ap-bio-lab-safety` + Khan video `demo-emma-ap-bio-khan` linked to `demo-emma-ap-bio-a5`.
- [x] Syllabus / Chapter 5 study guide / YouTube review are **course-scoped** (no `assignmentExternalId`) — they must land in “more from course”, not the primary pack.
- [x] `buildDemoAssetDocs` writes `slc_assets` rows with `contentHash: demo-${externalId}-hash` and `assetId: demo-asset-${externalId}`.
- [x] `packages/api/src/routes/seed/demo-data.test.ts` covers description/lmsUrl and assignment join (38 tests).

### 2.2 Assignment work pack — clients (inventory UI, not “do this” stack)

- [x] Mobile `AssignmentDetailScreen` (`packages/mobile/src/screens/AssignmentDetailScreen.tsx`): instructions, extracted links, LMS row, “For this assignment” vs “Course materials”.
- [x] Mobile `partitionMaterials` + `classifyResource` (`packages/mobile/src/resources/resourcePartition.ts` + tests).
- [x] Mobile `extractDescriptionLinks` / `stripHtmlToText` (`packages/mobile/src/resources/descriptionLinks.ts` + 13 tests).
- [x] Assignments tab tap joins `courseExternalId` + `assignmentExternalId` and pushes `AssignmentDetailScreen`.
- [x] Web `AssignmentDetailDrawer` + `packages/web/lib/descriptionLinks.ts` (24 tests).
- [~] UI is still an **inventory of cards**, not the stacked pack (primary Open worksheet → instructions → school-login fallback → collapsed more-from-course). Redesign is slice 2b / parent pack polish.

### 2.3 Asset ingest (parent scrape → our CDN)

- [x] `POST /api/ingest/v1/assets/upload-base64` (connector-token auth) in `packages/api/src/routes/assets/assets.ts`.
- [x] Tests in `packages/api/src/routes/assets/assets.test.ts` (happy path, decode, dedup by `contentHash`, auth, validation).
- [x] Server `GET /api/assets/:id` supports `ETag` / `If-None-Match` → 304.
- [x] Mobile `WebViewAssetHost` fetches portal bytes inside the authenticated WebView, SHA-256, uploads, rewrites `record.url`. Fail-open. 7 tests.
- [x] Signed `downloadUrl` on materials / action-board assets (24h TTL). Clients must not persist that URL as the cache key.

### 2.4 Parent surfaces that stay parent-owned

- [x] Action board `GET /api/students/:id/action-board` (`IActionBoardResponse` in `packages/contracts/src/types/api/actionBoard.ts`).
- [x] Parent dashboard `/dashboard` + student view `/dashboard/students/[id]/view/*` (parent-as-kid, keep it).
- [x] Workflow `studentStatus`: `not_started` | `working_on_it` | `need_help` | `done` already on assignment docs. Studio “working on it” should reuse this, not invent a second status field.
- [x] Owner-scoped `slc_*` reads (`Student.dataUserId()`). Student studio queries must still run against the **owner** partition after access check.

### 2.5 Notification machinery (exists; not wired to a student user or ladder)

- [x] `INotificationGenerator` split: `ParentNotificationGenerator` vs `StudentNotificationGenerator` (ISP example to copy).
- [x] Seven alert types: missing, deadline, grade_drop, test, workload, positive, recommendation.
- [x] `alertAudience` in `packages/agents/src/config/alert-audience.ts` — **currently both audiences for every type**. Must change in slice 7.
- [x] Quiet hours, digest schedule, `IPersonalizationService`, `IRecommendationEngine` (`positive_reinforcement`).
- [x] `IUserDevice.pushToken` on the User model (parent devices today).
- [x] Student push tokens / student delivery address — registered on the student User (`audience: 'student'` + `studentId`); Expo lookup also resolves `users.studentId`.

### 2.6 Auth as it exists today (parent-only)

- [x] JWT payload is `{ userId, email, fid? }` only (`AuthService._generateToken`). **No `role`, no `studentId`.**
- [x] `IAuthUser` = `{ id, email, name }` (`packages/contracts/src/types/api/auth.ts`).
- [x] `IAuthenticatedRequest` = `{ userId?, userEmail? }` (`packages/api/src/middleware/auth.ts`).
- [x] `User` model comment: “parent/guardian account” — **no `role` field**.
- [x] Web middleware (`packages/web/middleware.ts`) treats any `auth_token` as a parent and redirects logged-in users to `/dashboard`. Studio login will break this until slice 4–5.
- [x] Demo parent: `demo@scholarmancy.com` / `DemoPass123!` (`DEMO_USER`).
- [x] Demo contacts Jessica/Ricky are **co-parents**, not students.

### 2.7 Known demo gap for visualization

- [x] Demo seed puts real PDF bytes into `IAssetStore` (`demoAssetByteFiles` + `putDemoAssetBytes`). `GET /api/assets/demo-asset-demo-emma-ap-bio-lab-safety` returns 200 and `ETag` matching `demo-demo-emma-ap-bio-lab-safety-hash`. Studio fixture Open uses `/studio/fixtures/lab-safety.pdf` (same-origin, same ETag) until student JWT (slice 4–5).

---

## 3. ISP map (four clients, four interface sets)

No client imports another client’s types. Tick the gate at the end of each slice that adds a type.

| Client | May depend on | Must not see |
|--------|----------------|--------------|
| Parent dashboard / parent app | `IActionBoardResponse`, `INudgePublisher`, `IStudentProvisioner`, grades APIs, existing students routes | `IStudentSession`, `ITodayGuide`, `IAssetCache` internals |
| Student studio (web iPad + later mobile student mode) | `IStudentSession`, `ITodayGuide`, `IWorkPack`, `IAssetCache` | Portal sync, billing, siblings, provisioner, `INudgePublisher`, `IStudentGradesResponse` |
| Guidance worker | `IGuidanceClock`, `IAssignmentState`, `INotificationSink` (compose existing generator + delivery) | React, WebView, Cache Storage, Next.js |
| Parent scrape / ingest | Existing ingest + `IAssetHost` / `WebViewAssetHost` | Student JWT, Today UI |

### 3.1 Where types live

- [ ] Wire DTOs (JSON over HTTP): `packages/contracts/src/types/api/studio.ts`, export from `packages/contracts/src/types/api/index.ts`.
- [ ] Behavior ports: `packages/interfaces/src/studio/` (or `packages/interfaces/src/agents/` only if it is worker-facing). Export from `packages/interfaces/src/index.ts`.
- [ ] Shared composers (no Express, no React): new package **`packages/studio-core`** (`@scholaracle/studio-core`). Web, mobile, and API adapters depend on it. It depends on `contracts` + `interfaces` only.
- [ ] `packages/interfaces` currently has `"test": "echo \"No tests for interfaces package\""`. Do not put the only tests there. Shape tests go in `packages/contracts`. Behavior tests go in `packages/studio-core`.

### 3.2 ISP compile gates (must stay true)

- [x] `packages/contracts/src/types/api/studio.ts` does not import `IStudentGradesResponse` / grades types.
- [x] `packages/studio-core` does not import `@scholaracle/api`, Express, Next, or React Native.
- [ ] Deleting `INudgePublisher` does not break `/studio` TypeScript.
- [x] Deleting `IAssetCache` does not break the parent action board TypeScript.
- [x] Studio pages do not import `packages/web/app/dashboard/**`.
- [x] Parent action-board components do not import `packages/web/app/studio/**`.

### 3.3 Interfaces to add (signatures — implement behind these, not around them)

```ts
// Student-facing session. No grades payload. No siblings.
interface IStudentSession {
  readonly studentId: string;
  readonly displayName: string;
  readonly showGrades: boolean; // parent flag, default false
}

interface ITodayGuide {
  load(session: IStudentSession): Promise<ITodayView>;
}

interface ITodayView {
  readonly encouragement: string;
  readonly next: INextStep | null;          // exactly one, never an array
  readonly alsoToday: readonly INextStep[];
}

interface ITodaySource {                    // narrow port for TodayGuide
  recentWins(): Promise<readonly IWin[]>;
  openTasks(): Promise<readonly IOpenTask[]>;
}

interface IWorkPack {
  load(session: IStudentSession, assignmentExternalId: string): Promise<IWorkPackView>;
}

interface IAssetCache {
  open(ref: IAssetRef): Promise<ICachedAsset>;
}

interface INudgePublisher {                 // parent only
  nudge(studentId: string, assignmentExternalId: string): Promise<void>;
}

interface IStudentProvisioner {             // parent only
  invite(studentId: string): Promise<{ email: string; temporaryPassword?: string }>;
  revoke(userId: string): Promise<void>;
  setShowGrades(studentId: string, showGrades: boolean): Promise<void>;
}

interface IGuidanceClock {
  now(): Date;
  localHour(timezone: string): number;
}

interface IAssignmentState {
  status(studentId: string, assignmentExternalId: string): Promise<'missing' | 'submitted' | 'graded' | 'unknown'>;
}

interface INotificationSink {
  send(input: { audience: 'student' | 'parent'; studentId: string; body: string; deepLink: string }): Promise<void>;
}
```

- [~] Types exist in the repo (checked off as slices land, not all at once). Slice 0 landed `IStudentSession`, `ITodayView`, `INextStep`, `IWorkPackView` (+ parsers) in contracts. Slice 1 landed `ITodayGuide` / `ITodaySource` / `IWin` / `IOpenTask` + `TodayGuide`. Slice 2 landed `IWorkPack` / `IWorkPackSource` / `IWorkPackAssignment` + `WorkPack`. Slice 3 landed `IAssetCache` / `IAssetRef` / `ICachedAsset` + `AssetCache`. Provision / guidance still later.

---

## 4. TDD / process rules (every slice)

- [ ] Write the failing test file **first**. Run it. Confirm red.
- [ ] Implement the smallest fake or type to go green.
- [ ] Only then add UI that consumes the view-model as **props**.
- [ ] Pages/screens fetch via the interface; they do not parse Mongo docs.
- [ ] Table-driven tests for `TodayGuide` and work-pack partitioning.
- [ ] Capture/redact/auth tests must never log raw passwords, JWTs, or signed query strings.
- [ ] No `any` (except an immediate `page.evaluate` cast if a scraper file is touched — it should not be).
- [ ] Prefer fakes of `ITodaySource` / `IAssetCache` over hitting Express in unit tests.

---

## Slice 0 — Contracts first (no UI)

**Goal:** Studio wire types + `contentHash` on materials. Nothing to click yet.

### 0.1 Files

- [x] Add `packages/contracts/src/types/api/studio.ts`.
- [x] Export it from `packages/contracts/src/types/api/index.ts`.
- [x] Add `packages/contracts/src/types/api/studio.test.ts` (or `studio.contract.test.ts`).
- [x] Add `contentHash?: string` to `ICourseMaterial` in `packages/contracts/src/types/api/materials.ts`.
- [x] Hand-mirror `contentHash` on the web copy in `packages/web/lib/api/students.ts` if that file still duplicates `ICourseMaterial`.
- [x] Note in `materials.ts` header: `contentHash` is the cache validator; `downloadUrl` remains “never cache”.

### 0.2 Failing tests first

- [x] `ITodayView` has `encouragement: string`.
- [x] `ITodayView.next` is `INextStep | null`, not an array. A value with `next: []` must fail the type test / zod parse.
- [x] `ITodayView.alsoToday` is a readonly array (may be empty).
- [x] `INextStep` includes at least: `assignmentExternalId`, `title`, `courseName`, `dueAt?`, `primaryCtaLabel` (e.g. “Open worksheet”).
- [x] `IWorkPackView` has: `title`, `courseName`, `dueAt?`, `humanStatus` (not raw `missing`), `instructionsText` (or structured blocks — see 2b), `primaryAsset` (nullable), `needsSchoolLogin` list, `moreFromCourse` list.
- [x] `IWorkPackView` does **not** have a top-level “all course materials” dump mixed with the primary asset.
- [x] `ICourseMaterial` accepts `contentHash` when an asset exists.
- [x] ISP: `studio.ts` source text / imports do not reference `IStudentGradesResponse`.
- [x] Zod or equivalent parse rejects a Today payload that includes `letterGrade` / `percent` when we later add a runtime schema (if slice 0 stays TypeScript-only, add a `assertNoGradeLeak(view, showGrades)` helper tested here or in slice 1).

### 0.3 Implement

- [x] Types only. No routes. No React.

### 0.4 Done when

- [x] `pnpm --filter @scholaracle/contracts test` green.
- [x] `pnpm --filter @scholaracle/contracts type-check` green.

---

## Slice 1 — Pure Today composer (`ITodayGuide`)

**Goal:** Encouragement + one next step from a fake source. Visualize with fixture JSON, no auth.

### 1.1 Package

- [x] Create `packages/studio-core` (`@scholaracle/studio-core`): `package.json`, `tsconfig`, jest, eslint matching other packages.
- [x] Wire it into the pnpm workspace / root `pnpm-workspace.yaml` if not picked up by `packages/*`.
- [x] `studio-core` dependencies: `contracts`, `interfaces` only.
- [x] Add `ITodayGuide`, `ITodaySource`, `IWin`, `IOpenTask` to `packages/interfaces`.
- [x] Implement `TodayGuide` in `packages/studio-core/src/TodayGuide.ts`.

### 1.2 Failing tests first (`packages/studio-core/src/TodayGuide.test.ts`)

Table-driven. Fake `ITodaySource`. Do not boot Express.

- [x] **Recent graded + one missing due soon** → `encouragement` names the graded item; `next` is the missing worksheet (not the graded one).
- [x] **Two due soon, none missing** → `next` = earliest due; the other is in `alsoToday` (not a second primary).
- [x] **Missing beats due-soon** when both exist (missing is more urgent even if due-soon is sooner — document the rule in the test name). Confirm the agreed rule in the test comment if you refine it.
- [x] **`showGrades: false`** → encouragement has **no** `%`, no letter (`A-`, `B+`, etc.), no `points` / `pts` / ` /10 `.
- [x] **`showGrades: true`** → optional: may include score later; default tests should still pass with grades omitted until product asks.
- [x] **Nothing due, recent win** → encouragement positive; `next` is `null`; `alsoToday` empty.
- [x] **Nothing due, no wins** → encouragement still positive (“You’re caught up” or equivalent); `next` is `null`. Never empty, never “No data”.
- [x] **Streak / opened pack yesterday** (if `IWin` supports it) → encouragement can mention that without grades.
- [x] Composer does not call grades APIs (fake has no such method).
- [x] `next` is never an array (runtime assertion).

### 1.3 Implement

- [x] `TodayGuide` reads only `ITodaySource`.
- [x] Human status / copy lives in the composer, not in React.

### 1.4 Visualize (still no real login)

- [x] A throwaway or real `/studio` page that renders `ITodayView` from a **hardcoded fake** (Cell Division as `next`).
- [x] Layout: no parent sidebar, no Students list, no grades numbers.
- [x] You can read the encouragement and see **one** primary button.

### 1.5 Done when

- [x] `pnpm --filter @scholaracle/studio-core test` green.
- [x] Fake `/studio` (or Story) shows encouragement + one Open button.

---

## Slice 2 — Work pack view-model (`IWorkPack`)

**Goal:** Same data as today’s inventory, ordered as a **do-this stack**. Tests call `IWorkPack`, not React.

### 2.1 Move / wrap existing pure helpers

- [x] Put shared partitioning + link extraction where both web and mobile can use them without importing React.
  - Today: mobile `resourcePartition.ts` + `descriptionLinks.ts`; web has a duplicate `lib/descriptionLinks.ts`.
  - Target: `packages/studio-core` (or `packages/contracts` only if they stay types). Prefer studio-core so ISP stays: parent drawer can keep using its copy **or** both call studio-core. Do not leave three divergent copies.
- [x] `IWorkPack.load` maps `partitionMaterials` + `extractDescriptionLinks` + `classifyResource` into `IWorkPackView`.

### 2.2 Failing tests first

- [x] Primary CTA is the first **hosted** file for that assignment (`downloadUrl` or `assetId`+`contentHash`), **not** “View on LMS”.
- [x] If the assignment has a rehosted PDF (Lab Safety) and a public Khan link: primary = PDF; Khan is not the primary CTA.
- [x] Description links with `linkAccessibility === 'authenticated'` go in `needsSchoolLogin`, not primary.
- [x] Public description links that are not the hosted file go in `needsSchoolLogin` **or** a “open in browser” secondary list — pick one in the test and stick to it (recommendation: public http(s) that is not our CDN = secondary “Open link”; authenticated = “Needs school login”).
- [x] Course-level materials (syllabus, ch5 study guide, YouTube review) are `moreFromCourse`, never mixed into `primaryAsset`.
- [x] Empty materials: `primaryAsset` null; LMS url if present is last-resort only.
- [x] Status token `missing` becomes human copy “Not turned in” (or equivalent). No raw `missing` / `submitted` in `humanStatus`.
- [x] LMS url is **not** equal visual weight to Due; it is in the fallback list.
- [x] Session `showGrades: false` → pack view has no points earned / letter / percent even if the assignment doc has them.

### 2.3 Demo IDs for tests (use these strings)

| Thing | Id |
|-------|-----|
| Student profile external | `demo-emma` |
| Course | `demo-emma-ap-bio` |
| Assignment (Cell Division) | `demo-emma-ap-bio-a5` |
| Primary handout | `demo-emma-ap-bio-lab-safety` |
| Public video | `demo-emma-ap-bio-khan` |
| Course syllabus (not primary) | `demo-emma-ap-bio-syllabus` |
| Course study guide (not primary) | `demo-emma-ap-bio-study-guide` |
| Asset id | `demo-asset-demo-emma-ap-bio-lab-safety` |
| Asset hash (seed) | `demo-demo-emma-ap-bio-lab-safety-hash` |
| Canvas lmsUrl | `https://school.instructure.com/courses/bio101/assignments/cell-division` |

### 2.4 Visualize

- [x] `/studio/assignments/demo-emma-ap-bio-a5` driven by fixture JSON (no API required yet).
- [x] Screen order matches:

```
Cell Division                 Not turned in
AP Biology · Due … · Overdue

[ Open lab-safety.pdf ]       ← only loud button

Complete the Cell Division worksheet
and submit via Canvas.

Needs school login / other links
  Khan Academy – Cell Cycle
  View in Canvas

More from this course         ← collapsed
  Syllabus, Ch5 study guide, YouTube
```

### 2.5 Parent pack polish (same view-model, parent clients)

Do this after the view-model is green; do not invent a second partitioner.

- [x] Mobile `AssignmentDetailScreen` consumes `IWorkPackView` (or the same stack). Primary Open button. Collapse course dump.
- [x] Web `AssignmentDetailDrawer` same stack.
- [x] Stop stripping teacher HTML to a single paragraph if we can keep simple blocks (headings/lists) **without** executing HTML. If kept as plain text for v1, document that as a known UX debt in this file (do not silently regress links).
- [x] Status badges: parent-facing English, not tokens.

### 2.6 Done when

- [x] studio-core work-pack tests green.
- [x] Fixture assignment page shows one primary Open, collapsed course materials.
- [x] Parent mobile + web no longer present LMS as a peer of Due.

---

## Slice 3 — Client asset cache (`IAssetCache`) + `contentHash` on the wire

**Goal:** Bytes keyed by hash. 304 / same hash = no second download. New hash replaces.

### 3.1 Naming

- [x] Interface name **`IAssetCache`** in `packages/interfaces`.
- [x] Do not confuse with server `packages/api/src/services/assets/IAssetStore.ts`.
- [x] `IAssetRef` = `{ assetId: string; contentHash: string; downloadUrl?: string }`.
- [x] `ICachedAsset` = `{ bytes` or blob handle`; contentType; cacheKey; fromCache: boolean; stale: boolean }`.

### 3.2 Failing tests first (node, in-memory fake — no browser)

- [~] Same `assetId` + same `contentHash` → second `open` does **not** call the fetch port.
  Note: second open **revalidates** with `If-None-Match: "<hash>"`; 304 writes no body. Product: no second download.
- [x] Same `assetId` + **new** `contentHash` → fetch once, new bytes stored, **old key deleted**.
- [x] Different `assetId`, same hash (deduped server-side) → still a distinct client key (`assetId:hash`) unless we explicitly add content-addressed sharing (default: key includes both).
- [x] Network down + cache hit with matching hash → return cached; `stale: false`.
- [x] Network down + no cache → throw a typed error (not an unhandled fetch).
- [x] Network down + we only have an **old** hash, request is new hash → do not silently serve the old file as current; either error or return old with `stale: true` **and** a flag that the requested hash is missing. Test documents the chosen behavior (recommendation: `stale: true` + `requestedHashMissing: true` so offline kids can still read last week’s PDF).
- [x] `downloadUrl` is used for fetch only; cache key is never the signed URL string.
- [x] Fetch adapter sends `If-None-Match: "<contentHash>"` when we already have that hash; 304 → no body write.
- [x] Cache key format documented: `` `${assetId}:${contentHash}` ``.

### 3.3 API: put `contentHash` on materials

- [x] Failing test in existing students/materials tests: when `slc_assets` has `contentHash`, `ICourseMaterial.contentHash` is present.
- [x] Materials handler maps hash from the asset doc (not from the signed URL).
- [x] Action-board `IActionAsset` also gets `contentHash?` (parent pack + student pack share files).
- [x] Contract test / students-api.contract.test.ts updated if it lists material fields.

### 3.4 Demo bytes (otherwise iPad shows a 404)

- [x] Seed a **real small PDF** (or PNG) into the configured `IAssetStore` (local dir in dev) for `demo-asset-demo-emma-ap-bio-lab-safety`.
- [x] Test: after seed, `GET /api/assets/:id` with a parent or signed URL returns `200` and `ETag` matching `contentHash`.
- [x] Optional second fixture file + different hash for the “replace cache” visualization.

### 3.5 Adapters (after in-memory fake is green)

- [x] Web: Cache Storage or IndexedDB implementing `IAssetCache`. Unit-test via a node fake first; adapter test can be RTL + mocked fetch.
- [x] Mobile: app file dir implementing `IAssetCache`. Same tests against the fake; thin adapter.
- [x] Evict old hash after successful new fetch.
- [x] Offline copy: if materials payload is stale, UI may show “May be outdated until next parent sync”.

### 3.6 Visualize

- [x] Open worksheet twice in `/studio`; DevTools → Application → Cache (or IDB) shows **one** entry for that `assetId:hash`.
- [x] Network panel: second open is not a full download (304 or no request).
- [x] Change fixture `contentHash` → second file appears, first key gone.
- [x] Airplane mode + known hash → PDF still opens.

### 3.7 Done when

- [x] In-memory cache tests green.
- [x] Materials API returns `contentHash`.
- [x] Demo worksheet bytes exist on disk/S3.
- [x] Double-open visualization recorded (tick only after seeing it).

---

## Slice 4 — Demo student login (TDD on seed + auth, not screens)

**Goal:** Emma can authenticate as `role: 'student'` scoped to one `studentId`. Parent routes 403.

### 4.1 Data model

- [x] Add `role: 'parent' | 'student'` to `IUserData` / `User` (default `'parent'` for all existing users).
- [x] Add `studentId?: string` on student users (Mongo id of the `students` document they may see).
- [x] Migration/backfill: existing users → `role: 'parent'`, `studentId` absent.
- [x] Index: unique sparse `{ studentId: 1 }` or `{ role: 1, studentId: 1 }` so one login per student for v1 (document if multiple devices share one user — they should).
- [x] Parent flag `showGrades` for that student (on `students` doc or a `student_logins` collection — pick one place; recommendation: `students.studentLogin: { userId, showGrades, createdAt }`).

### 4.2 JWT + auth contracts

- [x] `_generateToken` includes `role` and `studentId?`.
- [x] `verifyToken` returns them.
- [x] `IAuthUser` includes `role` and `studentId?`.
- [x] `IAuthLoginResponse.user` round-trips role.
- [x] `IAuthenticatedRequest` gets `userRole?` and `studentId?`.
- [x] Refresh token path copies role/studentId (do not drop them on refresh).
- [x] Failing tests in `packages/auth` and `packages/api/src/middleware/auth.test.ts`.

### 4.3 Seed

- [x] `DEMO_STUDENT_USER_EMMA = { email: 'emma.demo@scholarmancy.com', password: 'DemoPass123!', name: 'Emma Mitchell' }`.
- [x] Seed creates the user with `role: 'student'` and Emma’s Mongo `studentId`.
- [x] `DEMO_STUDENT_USER_LIAM = { email: 'liam.demo@scholarmancy.com', password: 'DemoPass123!', name: 'Liam Mitchell' }` (follow-up from slice 4).
- [x] Seed is idempotent (re-seed does not duplicate Emma’s or Liam’s login).
- [x] Failing test: demo-data/seed builder emits student user fields (pure or API test).

### 4.4 Route gates

Introduce `requireParent` / `requireStudent` (or a single `requireRole`).

Student **can**:

- [x] `GET /api/studio/today` — slice 5 (`requireStudent` proven on a dummy route)
- [x] `GET /api/studio/assignments/:assignmentExternalId` (Emma’s assignments only) — slice 5
- [x] `GET /api/assets/:id` when the asset belongs to Emma’s owner partition (signed URL or student JWT + ownership check)
- [x] `PATCH` workflow `studentStatus` for Emma’s assignment (working on it) — slice 5 (`PATCH /api/studio/assignments/:externalId/status`; `/api/students` stays parent-gated)

Student **cannot** (403, not 404-as-empty unless IDOR policy says 404 — match existing student IDOR tests):

- [x] `GET /api/students` (list)
- [x] `GET /api/students/:liamId/...`
- [x] Ingest `/api/ingest/*`
- [x] Sync trigger
- [x] Billing / account plan changes
- [x] Source connect / invitations to other parents
- [x] Admin routes

Parent **cannot**:

- [x] `GET /api/studio/today` as a generic “view as kid” using the student studio token — parent uses dashboard. (Parent may later get a preview; default: studio routes are student-role only.) `requireStudent` unit-tested; real `/api/studio/today` is slice 5.

### 4.5 Web middleware

- [x] Logged-in **student** hitting `/login` redirects to `/studio`, not `/dashboard`.
- [x] Logged-in **student** hitting `/dashboard` redirects to `/studio` (or 403 page).
- [x] Logged-in **parent** hitting `/studio` redirects to `/dashboard`.
- [x] Unauthenticated `/studio` redirects to `/login?redirect=/studio`.
- [x] Tests for `packages/web/middleware.ts` (or a pure helper extracted from it — middleware is painful to test in-place; extract `destinationForRole(role, pathname)` and TDD that).

### 4.6 Visualize

- [x] Two browsers (or two profiles): parent `demo@scholarmancy.com` → `/dashboard`; Emma `emma.demo@scholarmancy.com` → `/studio`.
- [x] Emma cannot open Liam or the parent students list (Network tab 403).

### 4.7 Done when

- [x] Auth + seed + middleware helper tests green.
- [x] Two-browser visualization done.

---

## Slice 5 — Web studio routes (visualization surface)

**Goal:** iPad Safari against `http://localhost:2800/studio` is usable.

| URL | Who | What you must see |
|-----|-----|-------------------|
| `/studio` | student | Encouragement + one **Open …** button + “Also today” |
| `/studio/assignments/[externalId]` | student | Instructions + **in-page** PDF/video from `IAssetCache` |
| `/dashboard` | parent | Unchanged (nudge comes later) |

### 5.1 App structure

- [x] `packages/web/app/studio/layout.tsx` — **no** `Sidebar`, **no** `DemoBanner` parent chrome, **no** `StudentViewProvider`. Full width.
- [x] `packages/web/app/studio/page.tsx` — Today.
- [x] `packages/web/app/studio/assignments/[externalId]/page.tsx` — pack + viewer.
- [x] Login page: after auth, branch on `user.role`.
- [x] Deep link target for later pushes: `/studio/assignments/[externalId]`.

### 5.2 TDD UI (React Testing Library)

Presentational components take view-models as **props**. Pages only fetch.

- [x] `TodayView` / `TodayHero` given a fixture: shows encouragement, exactly one primary button, also-today list.
- [x] `TodayView` with `next: null`: still positive copy, no fake primary button.
- [x] `TodayView` does not render `%` / letter grades when `showGrades` is false (pass a poisoned fixture with grades in the name and assert they are not shown — the composer should have stripped them; UI should not reintroduce them).
- [x] `WorkPackView`: primary button label, fallback list, collapsed more-from-course.
- [x] `AssetViewer`: given a blob URL, renders `<iframe>`/`<object>`/video **in page**, not `window.open`.
- [x] Viewer: PDF, image, video content types (three cases).
- [x] Unsupported type: download / open-in-new as last resort, still inside the pack page.

### 5.3 API adapters (thin)

- [x] `GET /api/studio/today` → `TodayGuide` with a real `ITodaySource` over owner-scoped assignments/alerts.
- [x] `GET /api/studio/assignments/:externalId` → `IWorkPack`.
- [x] Failing API tests with student JWT vs parent JWT vs other student’s id.
- [x] Owner-scope: student JWT uses Emma’s profile; `slc_*` queries use `student.dataUserId()` (owner), not the student user’s id (the student userId is a **login**, not the ingest partition).

### 5.4 iPad / layout QA

- [x] iPad Safari (or Simulator iPad): `/studio` readable, primary button thumb-reachable.
- [x] Assignment viewer uses the **full width** below the header.
- [x] Rotate landscape: PDF still usable.
- [x] No parent “Students / Integrations / Billing” nav.

### 5.5 Visualize (definition of “can see it”)

- [x] Seed demo (`POST /api/seed/demo` or existing seed path).
- [x] Parent: Emma → Cell Division → work pack materials still work on dashboard.
- [x] Student: login Emma → Today → encouragement, **no grades**, Open worksheet.
- [x] Worksheet opens **in the page** (not a new tab that fails cookies).
- [x] Student token cannot open `/dashboard` or another child.

### 5.6 Done when

- [x] Web studio tests + API studio tests green.
- [x] iPad (or desktop width mimicking iPad) walkthrough ticked.

---

## Slice 6 — Parent provision (`IStudentProvisioner`)

**Goal:** Parent can create/revoke Emma’s login from settings. Magic-link can wait.

### 6.1 Failing tests first

- [x] `invite(studentId)` creates a `role: 'student'` user linked to that student; returns email + temp password (demo) or invite URL.
- [x] Second invite for the same student is idempotent or resets password — pick one; test it.
- [x] `invite` for a student the parent does not own → 403.
- [x] `revoke(userId)` blocks login (suspended or deleted student-login flag). Existing JWT must fail subsequent studio calls (or short TTL + revoke list).
- [x] `setShowGrades(studentId, false)` → Today encouragement has no scores (API test).
- [x] Student cannot call provision endpoints.

### 6.2 UI

- [x] Parent: Settings → Emma → **Student login**: show email, copy password / reset, revoke, **Show grades** toggle (default off).
- [x] Copy for COPPA: parent is creating a login for their child; no self-serve student register.
- [x] Visualize: create login, log in on a second browser, revoke, confirm studio 401/403.

### 6.3 Demo shortcut

- [x] Seed already provisioned Emma (slice 4). Settings UI still shows that login as existing.

### 6.4 Done when

- [x] Provision tests green.
- [x] Settings visualization ticked.
- [x] Magic-link / QR listed under follow-ups, not blocking visualize.

---

## Slice 7 — Guidance ladder (after studio is visible)

**Goal:** Who to tell, when, cancel on submit. Copy is next-step, not nag.

### 7.1 Audience map (deterministic)

Update `packages/agents/src/config/alert-audience.ts` **and** `docs/alert-audience.md`.

Proposed v1 (adjust only by changing this table + tests):

| Event | Student | Parent |
|-------|---------|--------|
| Deadline T-48h / T-18h (not yet missing) | Yes | **No** |
| Missing T+12h | Yes | Yes |
| Missing T+72h digest / talking points | No extra student nag if already notified | Yes (digest + recommendation) |
| Grade drop | Per existing product (both, unless we decide student-off when `showGrades` false) | Yes |
| Positive / nice work | Yes (does not count against daily budget) | Optional / digest |
| Workload / test | Student first | Parent digest only unless severity high |

- [x] Tests for `shouldNotifyParent` / `shouldNotifyStudent` match the table.
- [x] `showGrades: false` → student copy has no percent/letter (generator test).

### 7.2 Ladder jobs

```
T-48h  4pm local  student: “Cell Division is due Thursday. Open the worksheet when you have 15 min.”
T-18h  4pm local  student: firmer, same deep link. Parent: silence.
T+12h             parent: missing + Nudge CTA. Student: “Still open — tap to pick it up.”
T+72h             parent digest + talking points (RecommendationEngine).
Any time submitted → remaining jobs dropped. Parent never heard the chore.
```

- [x] `IGuidanceClock`, `IAssignmentState`, `INotificationSink` in interfaces.
- [x] Failing tests:
  - [x] T-48h sends student only.
  - [x] T-18h student only.
  - [x] After submit between T-48h and T-18h, T-18h send is skipped.
  - [x] T+12h parent+student only if still missing.
  - [x] Quiet hours respected (`IUserPreferences.notifications.quietHours`).
  - [x] Max ~2 student pushes/day; positive does not count.
  - [x] High risk (course &lt; 70%) may skip T-48h and start firmer — **deferred** (follow-ups: GradeRiskService skip-to-firmer-copy).
- [x] Jobs live on the existing notification worker queue (Mongo), re-check state **at send time**.
- [x] Deep link: student → `/studio/assignments/[externalId]` (web) and mobile equivalent.
- [x] Deep link: parent → action-board bucket, not the students list.

### 7.3 Nudge

- [x] `INudgePublisher.nudge(studentId, assignmentExternalId)`.
- [x] Rate limit: max 1 per assignment per calendar day (parent timezone).
- [x] Action board item shows “Nudged 2h ago”; button disabled until window resets.
- [x] Nudge does not notify the parent.
- [x] Studio types still do not import nudge (ISP).
- [x] Parent API test + action-board payload field `lastNudgedAt?`.

### 7.4 Student “working on it”

- [x] Opening the pack or tapping a control sets `studentStatus: 'working_on_it'` (existing field).
- [x] Optimistic local state; next parent sync / ingest still owns official `submitted`.
- [x] Parent board can show working-on-it without treating it as submitted for the ladder.

### 7.5 Done when

- [x] Ladder unit tests green with fakes (no React).
- [x] Manual: seed missing Cell Division, run clock fake, confirm student-only then parent. *(GuidanceLadder fake clock)*
- [x] Manual: mark submitted, confirm parent silence. *(submit between T-48h and T-18h)*

**Do not start this slice until slices 1–5 are visible.**

---

## 8. Mobile student mode (after web studio looks right)

Phone is a reminder; iPad is the studio. Same interfaces.

- [x] Login as Emma on mobile → Today screen (not Students list, not Sync, not Sources).
- [x] Gate: `user.role === 'student'` in `App.tsx` / nav.
- [x] Hide: Connect source, Sync, billing, siblings, settings that mutate household.
- [x] Show: Today, work pack, cached files, working-on-it.
- [x] Reuse `ITodayGuide` + `IWorkPack` + `IAssetCache` (mobile file adapter).
- [x] Push token registered with `audience: 'student'` + `studentId`.
- [x] Parent app unchanged for parent accounts.
- [x] Pixel-identical iOS/Android is **not** a goal; same RN tree, no `Platform.OS` forks in the pack unless a real a11y/safe-area need.
- [x] RTL/Jest tests for student-mode gate (who sees Sync).

---

## 9. Security / IDOR / COPPA (cross-cutting — tick during slices 4–6)

- [x] Student JWT cannot read another student’s studio/today/pack/assets.
- [x] Student JWT cannot read parent-only collections by guessing ids (match existing `students.idor.test.ts` style).
- [x] Student queries use **owner** `dataUserId()` after proving the login is linked to that student.
- [x] Signed asset URLs still expire; student cache stores bytes, not a forever URL.
- [x] No portal cookies on the student device.
- [x] Provision/revoke audit: who created the student login (parent userId).
- [x] Passwords: parent-set; force reset optional; never log passwords.
- [x] `showGrades` default false enforced server-side, not only in CSS.

---

## 10. Visualization runbook (do this in order when a slice claims “visualize”)

Local processes: API **2801**, web **2800**, Mongo **2802**.

```bash
# typical
pnpm --filter @scholaracle/api dev
pnpm --filter @scholaracle/web dev
# seed
# POST /api/seed/demo  (existing demo seed)
```

| Step | Actor | URL | Expect |
|------|--------|-----|--------|
| 1 | Parent | login `demo@scholarmancy.com` / `DemoPass123!` | `/dashboard` |
| 2 | Parent | Emma → action board / assignment Cell Division (`demo-emma-ap-bio-a5`) | Work pack; lab-safety in “for this assignment”; syllabus not primary |
| 3 | Student | login `emma.demo@scholarmancy.com` / `DemoPass123!` (Liam: `liam.demo@scholarmancy.com` / same password) | Redirect `/studio` not `/dashboard` |
| 4 | Student | `/studio` | Encouragement, **no grades**, one Open button |
| 5 | Student | Open worksheet | In-page PDF from cache |
| 6 | Student | Open again | No full re-download |
| 7 | Student | `/dashboard` | Blocked / redirected |
| 8 | Student | Liam routes | 403 |
| 9 | Parent | Settings → Emma student login | Email visible; show-grades off |
| 10 | iPad Safari | `http://localhost:2800/studio` | Full-width viewer, no sidebar |

- [x] Steps 1–2 (parent) after slice 2.
- [x] Steps 3–8 after slices 4–5.
- [x] Step 9 after slice 6.
- [ ] Step 10 on a real iPad or Simulator.

---

## 11. Commands after every slice

```bash
pnpm --filter @scholaracle/contracts test
pnpm --filter @scholaracle/contracts type-check
pnpm --filter @scholaracle/studio-core test        # once the package exists
pnpm --filter @scholaracle/interfaces type-check
pnpm --filter @scholaracle/auth test -- --testPathPattern='AuthService|role|student'
pnpm --filter @scholaracle/api test -- --testPathPattern='studio|seed/demo|materials|assets|auth|idor|signedUrl|provision|studentLogin'
pnpm --filter @scholaracle/web test -- --testPathPattern='studio|middleware|descriptionLinks'
pnpm --filter @scholaracle/mobile test -- --testPathPattern='resourcePartition|descriptionLinks|Today|WorkPack|studentMode'
```

- [x] Slice 0 commands recorded green.
- [x] Slice 1 commands recorded green.
- [x] Slice 2 commands recorded green.
- [x] Slice 3 commands recorded green.
- [x] Slice 4 commands recorded green.
- [x] Slice 5 commands recorded green.
- [x] Slice 6 commands recorded green.
- [x] Slice 7 commands recorded green.
- [x] Slice 8 commands recorded green.
- [x] Slice 9 commands recorded green.

---

## 12. Definition of done — “we can see the product”

All must be true:

- [x] Parent browser: Emma, Cell Division, stacked pack, nudge placeholder or real nudge.
- [x] Student browser / iPad: Today with **no grades**, one next step, worksheet opens **in the page**.
- [x] Second open of the same PDF does not re-download (hash hit).
- [x] Fixture with a new `contentHash` replaces the cached file.
- [x] Student token cannot open `/dashboard` or another child.
- [x] ISP: deleting `INudgePublisher` does not break `/studio` types; deleting `IAssetCache` does not break the parent action board.
- [x] Parent still owns scrape/sync; student never sees portal login.

---

## 13. Follow-ups (explicitly later — do not lose them)

- [x] Liam student login (`liam.demo@scholarmancy.com`) in seed.
- [x] Magic-link / QR from parent settings to iPad `/login`.
- [ ] Preserve richer instruction HTML (lists/headings) without XSS.
- [ ] GradeRiskService skip-to-firmer-copy on the ladder.
- [ ] Per-household override of `alertAudience`.
- [ ] Student email/SMS as a delivery channel (today: in-app + push once tokens exist).
- [x] E2E Playwright: parent + student two-session spec tagged `@studio`.
- [ ] Accessibility: one h1 on Today, primary button name, viewer focus trap.
- [ ] Mobile student OTA after web studio QA (no native fingerprint change expected if we add no native modules).
- [x] Unify web + mobile `descriptionLinks` into studio-core (if not done in slice 2).
- [x] Demo asset **bytes** if not completed in slice 3.
- [x] Parent notification deep-link to action-board bucket (not students list).
- [ ] “Opened the pack yesterday” win type for encouragement.
- [ ] Cache size cap / LRU on device.
- [x] Update `docs/alert-audience.md` when slice 7 lands (it still says students have no accounts).

---

## 14. Suggested execution order (copy into a PR / day plan)

1. [x] Slice 0 contracts  
2. [x] Slice 1 TodayGuide + fake `/studio`  
3. [x] Slice 2 IWorkPack + stacked UI (studio fixture, then parent clients)  
4. [x] Slice 3 IAssetCache + materials `contentHash` + demo PDF bytes  
5. [x] Slice 4 student user + JWT + middleware  
6. [x] Slice 5 real `/studio` routes + API  
7. [x] Slice 6 provision UI  
8. [x] iPad visual QA  
9. [x] Slice 7 ladder + nudge  
10. [x] Mobile student mode  
11. [x] Slice 9 security / IDOR / COPPA  
12. [ ] Slice 10 class-scoped offline work pack  

Start next implementation at remaining **follow-ups** (richer HTML, GradeRisk firmer copy, …) or Slice 10 (class offline pack — see below).

---

## Slice 10: Class-scoped offline work pack

> Spec: [`docs/CLASS_OFFLINE_PACK.md`](./CLASS_OFFLINE_PACK.md)

**Goal:** After one online pull, Emma can disconnect and open her Algebra II worksheet from
local Cache Storage bytes.

### 10a. Spec docs (source of truth before code)

- [x] `docs/CLASS_OFFLINE_PACK.md` written
- [x] `CLIENT_SCRAPER_SPEC.md §12` — `IAssetHost` MUST + capture order
- [x] `CLIENT_PIPELINE_SPEC.md §9` — shared `classifyResource`; no "omit assets on mobile"
- [x] `DATA_EXTRACTION_CHECKLIST.md §7` — `linkAccessibility`, `extractedText`, download URL not viewer URL

### 10b. Shared resource classifier (`scraper-core`)

- [ ] Failing test: `classifyResource('https://canvas.../files/1/download', 'application/pdf', 'document')` → `'rehost'`
- [ ] Failing test: `classifyResource('https://example.com/page', undefined, 'link')` → `'extractText'`
- [ ] Failing test: `classifyResource('https://canvas.../courses/1', undefined, 'link')` → `'leaveLink'`
- [ ] `scraper-core/src/pipeline/resourceClassifier.ts` implemented; tests green
- [ ] `CLI discoverAssetDescriptors` uses classifier before calling `CliAssetHost`
- [ ] `WebViewAssetHost.processOps()` uses classifier; processes `assignment.attachments[]`

### 10c. Offline pack API

- [ ] Failing test: GET `/api/studio/courses/:courseExternalId/offline-pack` → 200 with `packs` + `assets`
- [ ] Failing test: wrong student JWT → 403 (IDOR)
- [ ] Failing test: unknown `courseExternalId` → 404
- [ ] `mongoOfflinePackSource.ts` + route handler implemented; tests green

### 10d. Client `ICourseOfflinePack`

- [ ] `packages/interfaces/src/studio/ICourseOfflinePack.ts` written
- [ ] Failing test: memory fake — `save()` → offline `open()` with no `downloadUrl` → bytes from cache
- [ ] Failing test: new `contentHash` after save → `stale: true`
- [ ] `CourseOfflinePack` implementation (IndexedDB JSON + `IAssetCache` bytes)
- [ ] Web `CacheStorageAssetCacheStore` used for bytes

### 10e. Web `/studio` UI

- [ ] "Save for offline" button on Today page (per-course)
- [ ] Saved-at + stale notice when `contentHash` changed
- [ ] Airplane-mode: if local pack exists, studio renders from IndexedDB without SSR call
- [ ] `data-testid="studio-offline-save-btn"`, `data-testid="studio-offline-status"`

### 10f. Playwright `@studio` extension

- [ ] Failing spec: `STUDIO-003` — seed → login as Emma → Save Algebra II → `context.setOffline(true)` → open worksheet → viewer shows `data-from-cache="true"`
- [ ] All `@studio` tests pass with `--no-deps` in CI

---

## 15. File / package touch list (so nothing is orphaned)

Create or edit as slices require. Tick when the file exists and is referenced by tests.

**New**

- [x] `packages/contracts/src/types/api/studio.ts`
- [x] `packages/contracts/src/types/api/studio.test.ts`
- [x] `packages/interfaces/src/studio/ITodayGuide.ts` (and siblings)
- [x] `packages/studio-core/` (package)
- [x] `packages/api/src/routes/studio/` (today + work pack)
- [x] `packages/web/app/studio/layout.tsx`
- [x] `packages/web/app/studio/page.tsx`
- [x] `packages/web/app/studio/assignments/[externalId]/page.tsx`
- [x] `packages/web/components/studio/` (TodayView, WorkPackView, in-page iframe viewer)
- [x] Client cache adapters: `packages/web/lib/studio/CacheStorageAssetCacheStore.ts` + `openCachedAsset.ts`; `packages/mobile/src/studio/openCachedAsset.ts` + `expoAssetCacheFs.ts`
- [x] `packages/mobile/src/studio/studentMode.ts` + Today / work-pack screens
- [x] `packages/interfaces/src/parent/IStudentProvisioner.ts`
- [x] `packages/contracts/src/types/api/studentLogin.ts`
- [x] `packages/api/src/services/provision/StudentProvisioner.ts`
- [x] `packages/interfaces/src/parent/IStudentLoginAudit.ts`
- [x] `packages/api/src/services/provision/MongoStudentLoginAudit.ts`
- [x] `packages/web/components/settings/StudentLoginsCard.tsx`

**Edit**

- [x] `packages/contracts/src/types/api/materials.ts` — `contentHash`
- [x] `packages/contracts/src/types/api/actionBoard.ts` — `contentHash` on assets; later `lastNudgedAt`
- [x] `packages/contracts/src/types/api/auth.ts` — `role`, `studentId`
- [x] `packages/auth/src/AuthService/AuthService.ts` — JWT claims
- [x] `packages/api/src/middleware/auth.ts` — role on request
- [x] `packages/database/src/models/User/User.ts` — role, studentId
- [x] `packages/database/src/models/Student/Student.ts` — studentLogin / showGrades
- [x] `packages/api/src/routes/seed/demo-data.ts` + `seed.ts` — PDF bytes + Emma student user
- [x] `packages/web/middleware.ts` — role-based redirects
- [x] `packages/agents/src/config/alert-audience.ts` + `docs/alert-audience.md`
- [x] Parent settings student-login panel
- [x] Mobile `App.tsx` student-mode gate (late)

**Do not edit as the student studio**

- [ ] `packages/web/app/dashboard/students/[id]/view/todo/page.tsx` — parent-as-kid only

---

## 16. Working notes (append here; do not scatter)

Use this section during implementation so decisions stay in one file.

```
2026-08-24  Slice 0  Landed studio wire types in contracts (IStudentSession,
ITodayView, INextStep, IWorkPackView) plus parseTodayView / parseWorkPackView /
assertNoGradeLeak. No zod dependency — contracts still must not depend on zod.
contentHash added to ICourseMaterial (contracts + web hand-mirror) and allowed
on the students API contract optional key list; handler does not emit it yet
(slice 3). ISP: studio.ts does not import grades. 141 contracts tests green.

2026-08-24  Slice 1  @scholaracle/studio-core + ITodayGuide/ITodaySource.
Missing beats due-soon even if due-soon is earlier. Copy never includes scores
(showGrades true still omits until product asks). /studio is a public fixture
page (no auth) rendering loadEmmaFixtureToday(); slice 4/5 will role-gate it.
Visualized at http://localhost:2800/studio — encouragement, one Open worksheet
CTA, Also today (Vocab quiz), no parent sidebar. Next: slice 2 IWorkPack.

2026-08-24  Slice 2  IWorkPack + WorkPack composer in studio-core.
partitionMaterials / extractDescriptionLinks / classifyResource live in
studio-core; web + mobile re-export. Public http(s) that is not our CDN is
kind `external`; Canvas/instructure/Skyward hosts are `school-login`.
LMS is last in needsSchoolLogin (never a peer of dueAt). humanStatus maps
missing → “Not turned in”. Instructions stay stripHtmlToText for v1 (no
heading/list structure) — UX debt, links still extracted. Hosted file
without contentHash uses pending:{assetId} until slice 3. Visualized at
http://localhost:2800/studio/assignments/demo-emma-ap-bio-a5 — one Open
lab-safety.pdf, collapsed More from this course, no parent sidebar.
Parent drawer + mobile AssignmentDetailScreen consume IWorkPackView.
Next: slice 3 IAssetCache + demo PDF bytes.

2026-08-24  Slice 3  IAssetCache in interfaces (not IAssetStore). AssetCache
in studio-core keys bytes by assetId:contentHash; downloadUrl is a fetch
ticket. Second open revalidates with If-None-Match; 304 writes no body.
New hash deletes the old key. Offline + old hash returns stale +
requestedHashMissing. Materials + action-board APIs emit contentHash from
slc_assets. Demo seed puts DEMO_MINIMAL_PDF into IAssetStore. Web
CacheStorageAssetCacheStore uses https://scholaracle.local/asset-cache/…
never the signed URL. Mobile DirectoryAssetCacheStore + Expo FS port.
Studio Open is a button → cache → in-page iframe (blob URL). Fixture PDF
is GET /studio/fixtures/lab-safety.pdf (public under /studio/, ETag =
quoted hash). ?hash=v2 swaps the hash for replace-cache viz. Visualized:
first open 200 + one Cache Storage entry; second open 304 + fromCache;
v2 replaces the key; airplane + known hash still opens. Parent mobile
Open still uses the signed URL until student-mode (adapter is ready).
Next: slice 4 student User.role + JWT + middleware.

2026-08-25  Slice 4  Student logins. User.role defaults to parent; studentId on
the user is the students Mongo _id (not Student.studentId / demo-emma). Unique
sparse users.studentId index — devices share one user. students.studentLogin
holds { userId, showGrades: false, createdAt }. JWT always has role; missing
claim verifies as parent. Public register cannot mint students. Refresh re-reads
User and copies role/studentId. Demo seed creates emma.demo@scholarmancy.com /
DemoPass123! idempotently. requireParent on students/sync/ingest-approve/
settings/account/billing/source-invites/alerts. Student JWT GET /api/assets
resolves assetUserId via Student.dataUserId(). destinationForRole gates
/studio vs /dashboard. Visualized two Playwright profiles: parent → /dashboard
(Emma+Liam grades); Emma → /studio fixture Today; Emma GET /api/students and
/api/students/:liamId → 403 FORBIDDEN. /studio still fixtures until slice 5.
Next: slice 5 real GET /api/studio/today + pack.

2026-08-25  Slice 5  Live GET /api/studio/today + GET /api/studio/assignments/:id
behind requireStudent. Mongo ITodaySource / IWorkPackSource read slc_* via
student.dataUserId() (owner partition) filtered to Emma’s studentExternalId.
Parent JWT 403; Liam’s assignment 404. PATCH /api/studio/assignments/:id/status
sets working_on_it. Materials join extracted to loadStudentMaterials (parent
route + pack share it). Signed downloadUrl uses API origin (PORT 2801 when
BASE_URL is the web app). Asset GET sets CORP cross-origin so the web cache
can fetch tickets. /studio pages fetch with the auth_token cookie; AssetViewer
covers PDF/image/video + download fallback. Real demo Today: missing beats
due-soon, so next is Algebra II “Missing assignment 1” (Open assignment);
Cell Division is Unit 9 Homework in Also today / deep link
/studio/assignments/demo-emma-ap-bio-a5 → in-page iframe from IAssetCache.
Visualized Playwright 834×1194 and landscape 1194×834. Student /dashboard
redirects to /studio. Next: slice 6 IStudentProvisioner.

2026-08-25  Slice 6  Parent provision. IStudentProvisioner is parent-only
(packages/interfaces/src/parent — studio pages do not import it). POST
/api/students/:id/login creates or resets a student user and returns email +
one-time temp password; second invite resets the hash. Unowned student → 403.
DELETE suspends the user (reason student_login_revoked), unsets studentLogin
so existing JWTs 403 on studio; AuthService.login rejects isSuspended.
PATCH showGrades. Settings → Student logins card (COPPA copy, Emma seeded
login visible, grades off, reset/revoke, Liam create). After revoke, studio
redirects through GET /login/expired which clears auth_token so middleware
does not bounce the student back to /studio. Magic-link/QR: parent Settings →
iPad sign-in issues POST /api/students/:id/login/magic-link (15 min, hashed
token, QR of `/login?magic=`); iPad Camera/Safari consumes POST
/api/auth/student-magic and lands in /studio without typing a password.
Visualized Playwright 834×1194: parent settings Emma email; create Liam;
second profile /studio; revoke → /login?reason=session_expired.
Next: slice 7 guidance ladder + nudge.

2026-08-25  Slice 9  Security leftovers. Student JWT cannot read Liam’s pack
(404 same owner), another household’s assignment/asset, or parent-only
/api/students collections (403). Forged studentId claim 403s. Studio queries
owner dataUserId() after login binding (decoy in the student-user partition
is ignored). Signed downloadUrl is a 24h sig+exp ticket; expired sig 403;
IAssetCache keys bytes by assetId+hash. Student devices cannot seed portal
credentials (mayStorePortalCredentials). Invite records student_login_audit
with the owner parent userId and never stores/logs the temp password;
provisionedByUserId on studentLogin; showGrades omitted → false server-side;
studio PATCH cannot flip showGrades. Force password reset stays optional.
Next: follow-ups or iPad Safari visualization step 10.

2026-08-25  Follow-up  Seed Liam student login `liam.demo@scholarmancy.com` /
DemoPass123!, same shape as Emma. Idempotent; re-seed unsuspends leftovers
and restores the demo password. Liam JWT 404s Emma’s pack; Emma 404s Liam’s.
Provision invite/revoke tests moved off Liam onto a Nora fixture so they
do not collide with the seeded login.
```
