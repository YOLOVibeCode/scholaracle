# Scholaracle Connector Specification

> Version 0.1.0 — February 2026

## Table of Contents

1. [Overview](#1-overview)
2. [Adapter Contract](#2-adapter-contract)
3. [Platform Catalog](#3-platform-catalog)
4. [Data Mapping](#4-data-mapping)
5. [Agent Model](#5-agent-model)
6. [Platform Detection](#6-platform-detection)
7. [Scraping Protocol](#7-scraping-protocol)
8. [Implementation Roadmap](#8-implementation-roadmap)

---

## 1. Overview

Scholaracle ingests academic data (assignments, grades, attendance, calendar events) from
school platforms and normalizes it into a Standard Learning Records (SLC) envelope. This
specification defines:

- **How adapters work** — the interface contract every adapter must satisfy
- **What platforms exist** — a catalog of 14 school platforms with API details
- **How data maps** — how each platform's data maps to SLC entity types
- **How data flows** — the agent model for getting data from school to Scholaracle

### Architecture

```
┌──────────────────────────────────────────────────────┐
│                  School Platforms                     │
│  Canvas │ Google │ Schoology │ PowerSchool │ ...      │
└────┬────────┬────────┬────────────┬──────────────────┘
     │        │        │            │
     ▼        ▼        ▼            ▼
┌──────────────────────────────────────────────────────┐
│              Connector Adapters                       │
│  ILmsAdapter.authenticate() → fetchEnvelope()        │
│  Adapter → Client → Transformer                      │
└────────────────────┬─────────────────────────────────┘
                     │ ISlcIngestEnvelopeV1
                     ▼
┌──────────────────────────────────────────────────────┐
│              Scholaracle API                          │
│  POST /api/ingest/v1/runs/:runId/envelope            │
│  validateOps() → applyOps() → generateAlerts()       │
└──────────────────────────────────────────────────────┘
```

### Key Files

| File | Purpose |
|------|---------|
| `packages/contracts/src/models/Ingest.ts` | SLC envelope schema and entity types |
| `packages/contracts/src/models/Connector.ts` | Platform descriptors, credentials, detection types |
| `packages/connector/src/adapter.ts` | `ILmsAdapter` interface contract |
| `packages/connector/src/adapter-registry.ts` | Adapter factory registry |
| `packages/connector/src/discovery/` | Platform detection and registry |
| `packages/connector/src/canvas/` | Reference adapter implementation |
| `packages/connector/src/cli.ts` | Connector CLI (`slc`) |

---

## 2. Adapter Contract

Every adapter must implement `ILmsAdapter` from `packages/connector/src/adapter.ts`.

### 2.1 Interface

```typescript
interface ILmsAdapter extends ILmsAuthenticator, ILmsEnvelopeReader {
  readonly meta: ILmsAdapterMeta;
}

interface ILmsAdapterMeta {
  readonly provider: string;        // 'canvas', 'google-classroom', etc.
  readonly adapterId: string;       // 'com.instructure.canvas'
  readonly adapterVersion: string;  // semver: '0.1.0'
  readonly displayName: string;     // 'Canvas LMS'
}

interface ILmsAuthenticator {
  authenticate(credentials: ILmsCredentials): Promise<void>;
  isAuthenticated(): boolean;
}

interface ILmsEnvelopeReader {
  fetchEnvelope(params: IFetchEnvelopeParams): Promise<ISlcIngestEnvelopeV1>;
}
```

### 2.2 Credentials

`ILmsCredentials` supports all auth methods via optional fields:

| Field | Used By | Purpose |
|-------|---------|---------|
| `baseUrl` | All | Base URL of the school platform |
| `accessToken` | Canvas, Google (OAuth2), OneRoster | Bearer token or OAuth access token |
| `refreshToken` | Google (OAuth2) | Token refresh for OAuth 2.0 |
| `clientId` | Google (OAuth2), OneRoster | OAuth 2.0 client ID |
| `clientSecret` | Google (OAuth2), OneRoster | OAuth 2.0 client secret |
| `consumerKey` | Schoology | OAuth 1.0a consumer key |
| `consumerSecret` | Schoology | OAuth 1.0a consumer secret |
| `oauthToken` | Schoology | OAuth 1.0a access token |
| `oauthTokenSecret` | Schoology | OAuth 1.0a token secret |
| `apiKey` | Aeries, Alma, FACTS | API key for key-based auth |
| `username` | Scraping | Form login username |
| `password` | Scraping | Form login password |

Each adapter validates the fields it needs in `authenticate()` and throws a clear
error if required fields are missing.

### 2.3 Authentication Lifecycle

1. **Instantiate** the adapter (constructor, no side effects)
2. **Call `authenticate(credentials)`** — adapter validates credentials, initializes
   internal client, sets authenticated state
3. **Call `isAuthenticated()`** — returns `true` if ready to fetch data
4. **Call `fetchEnvelope(params)`** — fetches all data and returns an SLC envelope

### 2.4 Envelope Construction

`fetchEnvelope()` must return a valid `ISlcIngestEnvelopeV1` with:

- `schemaVersion`: always `'slc.ingest.v1'`
- `run`: populated from `params.runId` + adapter meta (`provider`, `adapterId`, `adapterVersion`)
- `source`: populated from `params.sourceId`, `params.displayName`, `params.portalBaseUrl`
- `ops`: array of `ISlcDeltaOp` records (upsert or delete)
- `cursor`: optional opaque cursor for incremental sync

### 2.5 Error Handling Requirements

Adapters must:

- **Throw** on authentication failure (invalid credentials, expired tokens)
- **Throw** on unrecoverable fetch errors (network failure, 5xx from platform)
- **Include in `warnings[]`** any non-fatal issues (rate limit retries, partial data, skipped entities)
- **Never silently drop data** — if an entity can't be transformed, include a warning

### 2.6 Three-Layer Pattern

Each adapter should follow the Canvas reference pattern:

```
<provider>/
  ├── <provider>-adapter.ts        # Orchestration: authenticate + fetchEnvelope
  ├── <provider>-client.ts         # HTTP client: pagination, error handling, auth headers
  ├── <provider>-transformer.ts    # Data mapping: platform types → ISlcDeltaOp
  └── index.ts                     # Barrel exports
```

### 2.7 Adapter Registration

Register in `packages/connector/src/cli.ts` → `createDefaultRegistry()`:

```typescript
registry.register('provider-name', 'com.vendor.product', (creds) => {
  const adapter = new ProviderAdapter();
  void adapter.authenticate(creds);
  return adapter;
});
```

### 2.8 Optional: Capability Probing

Adapters may optionally implement `IConnectorCapabilityProber` to dynamically
report what entity types they support:

```typescript
interface IConnectorCapabilityProber {
  probeCapabilities(): Promise<IConnectorCapabilities>;
}
```

This is useful for platforms with variable compliance (e.g., OneRoster implementations
that may not support all endpoints).

---

## 3. Platform Catalog

### 3.1 Tier 1: Developer APIs

These platforms have documented REST APIs available for third-party developers.

---

#### 3.1.1 Canvas LMS ✅ IMPLEMENTED

| Field | Value |
|-------|-------|
| Provider | `canvas` |
| Adapter ID | `com.instructure.canvas` |
| Platform Type | LMS |
| Auth | Bearer token |
| Market Share | ~30% of LMS |
| Status | **Implemented** |

**API Base:** `{baseUrl}/api/v1`

**Endpoints:**

| Endpoint | Method | Returns |
|----------|--------|---------|
| `/courses` | GET | Active courses (paginated, per_page: 100) |
| `/courses/{id}/assignments` | GET | Assignments for a course |
| `/courses/{id}/students/submissions` | GET | All student submissions |
| `/calendar_events` | GET | Calendar events by date range |

**Authentication:** Generate an access token in Canvas → Account → Settings → New Access Token.

**Pagination:** Link headers with `rel="next"` for multi-page results.

**SLC Mapping:**

| Canvas Field | SLC Entity | SLC Field |
|-------------|-----------|----------|
| `assignment.name` | assignment | `title` |
| `assignment.due_at` | assignment | `dueAt` |
| `assignment.points_possible` | assignment | `pointsPossible` |
| `submission.score` | assignment | `pointsEarned` |
| `submission.workflow_state` | assignment | `status` (missing/submitted/graded/late) |
| `calendar_event.title` | eventSeries | `title` |
| `calendar_event.start_at` | eventSeries | `startsAt` |
| `calendar_event.end_at` | eventSeries | `endsAt` |

---

#### 3.1.2 Google Classroom 🔲 PLANNED

| Field | Value |
|-------|-------|
| Provider | `google-classroom` |
| Adapter ID | `com.google.classroom` |
| Platform Type | LMS |
| Auth | OAuth 2.0 |
| Market Share | ~50%+ of K-12 |
| Status | Planned (P1) |

**API Base:** `https://classroom.googleapis.com/v1`

**Required OAuth Scopes:**
- `classroom.courses.readonly`
- `classroom.coursework.students.readonly`
- `classroom.student-submissions.students.readonly`

**Endpoints:**

| Endpoint | Method | Returns |
|----------|--------|---------|
| `/courses` | GET | Enrolled courses |
| `/courses/{courseId}/courseWork` | GET | Assignments / quiz assignments |
| `/courses/{courseId}/courseWork/{cwId}/studentSubmissions` | GET | Grades per assignment |
| `/courses/{courseId}/announcements` | GET | Course announcements |
| `/courses/{courseId}/topics` | GET | Course topics |

**Limitations:**
- No overall course grade endpoint — must calculate from individual submissions
- Requires Google Cloud project with Classroom API enabled
- OAuth consent screen review required for production deployment

**SLC Mapping:**

| Google Classroom Field | SLC Entity | SLC Field |
|-----------------------|-----------|----------|
| `courseWork.title` | assignment | `title` |
| `courseWork.dueDate` + `courseWork.dueTime` | assignment | `dueAt` |
| `courseWork.maxPoints` | assignment | `pointsPossible` |
| `studentSubmission.assignedGrade` | assignment | `pointsEarned` |
| `studentSubmission.state` (TURNED_IN/RETURNED/CREATED) | assignment | `status` |
| `course.name` | course | `title` |
| `course.section` | course | `courseCode` |

**Node.js SDK:** `googleapis` npm package provides typed client.

---

#### 3.1.3 Schoology 🔲 PLANNED

| Field | Value |
|-------|-------|
| Provider | `schoology` |
| Adapter ID | `com.schoology.lms` |
| Platform Type | LMS |
| Auth | OAuth 1.0a (3-legged) |
| Market Share | ~20% of K-12 LMS |
| Status | Planned (P3) |

**API Base:** `https://{domain}.schoology.com/v1`

**Authentication:** OAuth 1.0a three-legged flow. Requires `oauth-1.0a` npm package.
Consumer key and secret obtained from Schoology admin settings.

**Endpoints:**

| Endpoint | Method | Returns |
|----------|--------|---------|
| `/sections/{sectionId}/assignments` | GET | Assignments for a section |
| `/sections/{sectionId}/grades` | GET | Grades (filterable by assignment_id, enrollment_id) |
| `/sections/{sectionId}/attendance` | GET | Attendance (filterable by date range) |
| `/users/{userId}/events` | GET | Calendar events |
| `/courses` | GET | Courses the user is enrolled in |
| `/courses/{courseId}/sections` | GET | Sections within a course |
| `/grading_periods` | GET | Grading periods |

**Features:**
- Multi-call: batch multiple API requests in one HTTP POST
- Bulk CSV export for admins (via GET with `fields` query param)
- Grades are point values per assignment through enrollments

**SLC Mapping:**

| Schoology Field | SLC Entity | SLC Field |
|----------------|-----------|----------|
| `assignment.title` | assignment | `title` |
| `assignment.due` | assignment | `dueAt` |
| `assignment.max_points` | assignment | `pointsPossible` |
| `grade.grade` | assignment | `pointsEarned` |
| `attendance.status` (1=present, 2=absent, 3=late, 4=excused) | attendanceEvent | `status` |
| `attendance.date` | attendanceEvent | `date` |
| `event.title` | eventSeries | `title` |
| `event.start` | eventSeries | `startsAt` |

---

#### 3.1.4 Aeries SIS 🔲 PLANNED

| Field | Value |
|-------|-------|
| Provider | `aeries` |
| Adapter ID | `com.aeries.sis` |
| Platform Type | SIS |
| Auth | Certificate + API key |
| Market Share | Significant (dominant in California) |
| Status | Planned (P4) |

**API Base:** `https://{district}.aeries.net/api/v5`

**Authentication:** Certificate issued by the district + API key in header.
District admin must issue a certificate and API key to the developer.

**Endpoints:**

| Endpoint | Method | Returns |
|----------|--------|---------|
| `/schools/{schoolCode}/students` | GET | Student demographics |
| `/schools/{schoolCode}/GradebookAssignments/{sectionNumber}` | GET | Gradebook assignments |
| `/schools/{schoolCode}/GradeReportCards` | GET | Report card grades |
| `/schools/{schoolCode}/Attendance` | GET | Attendance records |
| `/schools/{schoolCode}/courses` | GET | Course catalog |
| `/schools/{schoolCode}/sections` | GET | Sections / class schedules |

**Features:**
- Primarily read-only (GET endpoints)
- Very comprehensive student data
- Well-documented with support articles for each endpoint
- Strong in California school districts

**SLC Mapping:**

| Aeries Field | SLC Entity | SLC Field |
|-------------|-----------|----------|
| `GradebookAssignment.AssignmentDescription` | assignment | `title` |
| `GradebookAssignment.DateAssigned` | assignment | `dueAt` |
| `GradebookAssignment.MaxNumberOfPoints` | assignment | `pointsPossible` |
| `GradebookAssignment.NumberCorrect` | assignment | `pointsEarned` |
| `GradeReportCard.MarkReportingPeriod` | gradeSnapshot | `termExternalId` |
| `GradeReportCard.PercentGrade` | gradeSnapshot | `percentGrade` |
| `GradeReportCard.Mark` | gradeSnapshot | `letterGrade` |
| `Attendance.AttendanceCode` | attendanceEvent | `status` |
| `Attendance.AttendanceDate` | attendanceEvent | `date` |

---

#### 3.1.5 Alma SIS 🔲 PLANNED

| Field | Value |
|-------|-------|
| Provider | `alma` |
| Adapter ID | `com.getalma.sis` |
| Platform Type | SIS |
| Auth | API key |
| Market Share | Growing (private/charter schools) |
| Status | Planned |

**API:** REST APIs via Ex Libris Developer Network.
Full documentation at `developers.exlibrisgroup.com/alma/apis/`.

---

### 3.2 Tier 2: OneRoster-Compatible Platforms

These platforms support the [OneRoster 1.2 specification](https://www.imsglobal.org/spec/oneroster/v1p2)
by 1EdTech (formerly IMS Global). One adapter covers all of them.

**Platforms covered:** Infinite Campus (~10%), Skyward Qmlativ (~7%),
Blackbaud (~3%), FACTS/RenWeb (~15%).

#### OneRoster 1.2 Adapter 🔲 PLANNED

| Field | Value |
|-------|-------|
| Provider | `oneroster` |
| Adapter ID | `org.imsglobal.oneroster.1.2` |
| Auth | OAuth 2.0 client credentials |
| Status | Planned (P2) |

**API Base:** `{baseUrl}/ims/oneroster/v1p2`

**Authentication:** OAuth 2.0 client credentials flow. The school district
provides a `clientId` and `clientSecret`. The adapter exchanges them for a
bearer token at the `/token` endpoint.

**Rostering Endpoints:**

| Endpoint | Method | Returns |
|----------|--------|---------|
| `/classes` | GET | Courses / class sections |
| `/enrollments` | GET | Student enrollments |
| `/academicSessions` | GET | Terms / semesters |
| `/orgs` | GET | Schools / districts |
| `/users` | GET | Students / teachers |
| `/courses` | GET | Course catalog |

**Gradebook Endpoints:**

| Endpoint | Method | Returns |
|----------|--------|---------|
| `/lineItems` | GET | Assignments (title, dueDate, resultValueMax) |
| `/classes/{classId}/lineItems` | GET | Assignments for a specific class |
| `/results` | GET | Grades / scores |
| `/lineItems/{lineItemId}/results` | GET | Grades for a specific assignment |
| `/categories` | GET | Assignment categories |
| `/scoreScales` | GET | Grading scales |

**Pagination:** Link headers + offset/limit query params.

**Variable Compliance:** Not all OneRoster implementations support all endpoints.
The adapter must gracefully handle 404 (Not Found) and 501 (Not Implemented)
responses by returning empty results rather than throwing.

**SLC Mapping:**

| OneRoster Field | SLC Entity | SLC Field |
|----------------|-----------|----------|
| `lineItem.title` | assignment | `title` |
| `lineItem.dueDate` | assignment | `dueAt` |
| `lineItem.resultValueMax` | assignment | `pointsPossible` |
| `result.score` | assignment | `pointsEarned` |
| `result.scoreStatus` (fully graded / exempt / ...) | assignment | `status` |
| `academicSession.title` | academicTerm | `title` |
| `academicSession.startDate` | academicTerm | `startDate` |
| `academicSession.endDate` | academicTerm | `endDate` |
| `academicSession.type` (term / semester / ...) | academicTerm | `type` |
| `class.title` | course | `title` |
| `class.classCode` | course | `courseCode` |
| `org.name` | institution | `name` |
| `org.type` (school / district) | institution | `type` |

**Per-Platform Notes:**

| Platform | OneRoster Version | Access Notes |
|----------|-------------------|-------------|
| **Infinite Campus** | 1.1+ | Primary third-party path; no direct API |
| **Skyward Qmlativ** | 1.2 | Modern version; legacy SMS 2.0 uses separate partner API |
| **Blackbaud** | 1.1 | Also has own SKY API; OneRoster certified + LTI 1.3 |
| **FACTS/RenWeb** | 1.1 | $500/yr fee for API access; also supports CSV |

---

### 3.3 Tier 3: Partner-Only API

These platforms have APIs but require formal partnership agreements.

#### 3.3.1 PowerSchool SIS ⏳ NEEDS PARTNERSHIP

| Field | Value |
|-------|-------|
| Provider | `powerschool` |
| Adapter ID | `com.powerschool.sis` |
| Platform Type | SIS |
| Auth | OAuth 2.0 (via PowerSource developer portal) |
| Market Share | **~23%** (largest single SIS) |
| Status | Needs partnership |

**Developer Portal:** `https://support.powerschool.com/developer`

**Access Path:**
1. Contact school district's PowerSchool admin
2. Get access to PowerSource developer account
3. Register plugin / API consumer
4. District enables API access for your consumer

**Endpoints (once access granted):**
- Students, attendance, roster, demographics, transcripts, grades, schedules
- Data Access Tags for custom queries
- Plugin framework for deeper integration

**Priority:** Despite access barriers, PowerSchool covers ~23% of all K-12 districts.
Worth applying for partnership proactively.

#### 3.3.2 TxEIS / Ascender ⏳ NEEDS PARTNERSHIP

| Field | Value |
|-------|-------|
| Provider | `txeis-ascender` |
| Adapter ID | `com.txeis.ascender` |
| Market Share | ~3% (850+ Texas districts) |
| Status | Texas-specific; contact TX Computer Cooperative |

---

### 3.4 Tier 4: No Public API (Scraping Required)

#### 3.4.1 Synergy / ParentVUE 🕸️ NEEDS SCRAPER

| Field | Value |
|-------|-------|
| Provider | `synergy-parentvue` |
| Adapter ID | `com.edupoint.parentvue` |
| Platform Type | SIS |
| Auth | Username / password (form POST) |
| Market Share | ~3% (widespread across districts) |
| Status | Needs scraper |

**Login URL Pattern:** `https://{domain}/PXP2_Login.aspx`

**Data Available in Parent Portal:**
- Grades (current and by grading period)
- Assignments (per class)
- Attendance (daily)
- Schedule (class periods)
- School info

**Scraping Notes:**
- Consistent ASP.NET UI across all districts (same codebase)
- Structured HTML with predictable CSS classes
- Unofficial community-built APIs exist on GitHub
- SSO/MFA support varies by district
- See [Section 7: Scraping Protocol](#7-scraping-protocol)

---

## 4. Data Mapping

### 4.1 SLC Entity Types

All platform data is normalized into these SLC entity types:

| Entity Type | Interface | Implemented? |
|-------------|-----------|-------------|
| `assignment` | `ISlcAssignment` | ✅ Yes |
| `eventSeries` | `ISlcEventSeries` | ✅ Yes |
| `eventOverride` | `ISlcEventOverride` | ✅ Yes |
| `course` | `ISlcCourse` | ✅ New |
| `academicTerm` | `ISlcAcademicTerm` | ✅ New |
| `gradeSnapshot` | `ISlcGradeSnapshot` | ✅ New |
| `attendanceEvent` | `ISlcAttendanceEvent` | ✅ New |
| `institution` | `ISlcInstitution` | ✅ New |

### 4.2 Entity Key Structure

Every SLC op uses an `ISlcEntityKey` to uniquely identify the record:

```typescript
{
  provider: 'canvas',                      // Which platform
  adapterId: 'com.instructure.canvas',     // Which adapter
  externalId: 'canvas-assignment-12345',   // Unique within (provider, adapterId)
  studentExternalId: 'self',               // Which student
  courseExternalId: 'canvas-course-67',     // Which course (optional)
  termExternalId: 'fall-2025',             // Which term (optional)
  institutionExternalId: 'canvas-inst-1',  // Which school (optional)
}
```

### 4.3 Platform Capability Matrix

| Entity | Canvas | Google | Schoology | OneRoster | Aeries | PowerSchool | ParentVUE |
|--------|--------|--------|-----------|-----------|--------|-------------|-----------|
| assignment | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| eventSeries | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| eventOverride | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| course | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| academicTerm | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| gradeSnapshot | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| attendanceEvent | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ |
| institution | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ |

---

## 5. Agent Model

### 5.1 How Data Flows

```
Parent → School Platform → Adapter → SLC Envelope → Scholaracle API → MongoDB → Alerts
```

### 5.2 Connection Methods

| Platform Tier | Connection Method | Runs On | Parent Effort |
|---------------|-------------------|---------|---------------|
| Tier 1 (API) | OAuth or token via web UI | Server (workers) | Low: enter URL + auth |
| Tier 2 (OneRoster) | District credentials via web UI | Server (workers) | Low: enter URL + auth |
| Tier 3 (Partner) | API token via web UI (if granted) | Server (workers) | Low |
| Tier 4 (Scrape) | Install local connector + Playwright | Parent's machine | Medium: install + run |

### 5.3 Server-Side Sync (Tiers 1–3)

For platforms with APIs, syncing runs server-side:

1. Parent enters school URL in web UI
2. Platform detector identifies the platform
3. Parent completes auth flow (OAuth redirect, paste token, or enter credentials)
4. Credentials encrypted and stored in `IngestCredential` collection
5. Worker job `ingest-sync` runs on schedule (every 4–6 hours):
   - Reads IngestSource records
   - Instantiates adapter from registry
   - Calls `fetchEnvelope()`
   - Applies ops to database
   - Updates IngestRun status

### 5.4 Local Connector (Tier 4)

For scraping, the connector runs on the parent's machine:

1. Parent installs Node.js + `@scholaracle/connector` CLI
2. `slc init` — device auth flow (get connector token)
3. `slc add-source` — register the school portal
4. `slc run --source-id <id> --scrape` — launches Playwright, logs in, scrapes data
5. Envelope uploaded to Scholaracle API

### 5.5 Credential Security

- All credentials encrypted at rest using AES-256-GCM
- OAuth tokens refreshed automatically; refresh tokens stored encrypted
- API keys and passwords never logged or exposed in responses
- Local connector stores `connectorToken` in `~/.scholaracle/slc.json`
- Server-side credentials stored in separate `IngestCredential` collection

---

## 6. Platform Detection

### 6.1 Detection Flow

```
URL → detectPlatformFromUrl() → match against known URL patterns
                                  │
                                  ├── Match found → return { detected: true, provider, confidence: 'high' }
                                  │
                                  └── No match → detectPlatform() → fetch HTML → scan for signals
                                                                      │
                                                                      ├── Signal found → { detected: true, confidence: 'medium' }
                                                                      │
                                                                      └── Nothing → { detected: false, confidence: 'low' }
```

### 6.2 URL Patterns

| Platform | URL Patterns |
|----------|-------------|
| Canvas | `instructure.com`, `/api/v1/courses`, `/login/canvas` |
| Google Classroom | `classroom.google.com` |
| Schoology | `schoology.com`, `lms.*.schoology.com` |
| PowerSchool | `powerschool.com`, `/guardian/`, `/public/home.html` |
| Infinite Campus | `infinitecampus.com`, `/campus/` |
| Skyward | `skyward.com`, `/skyward/` |
| ParentVUE | `PXP2_Login.aspx`, `/parentvue/`, `/studentvue/` |
| Aeries | `aeries.net`, `/aeries/` |
| Blackbaud | `myschoolapp.com`, `blackbaud.com` |
| FACTS | `factsmgt.com`, `renweb.com` |
| Alma | `getalma.com`, `alma.app` |

### 6.3 HTML Signals

When URL matching fails, the detector fetches the page HTML and scans for
platform-specific keywords in the source code (e.g., `"instructure"`, `"schoology"`,
`"powerschool"`, `"PXP2_Login"`).

### 6.4 CLI Usage

```bash
# Detect what platform a school URL is running
slc discover --url https://school.instructure.com
# → Detected: Canvas LMS (high confidence)
# → Auth method: bearer-token
# → API base: https://school.instructure.com/api/v1

slc discover --url https://mystery-school.edu/portal
# → Probing https://mystery-school.edu/portal...
# → Detected: Synergy / ParentVUE (medium confidence)
# → Signal: HTML contains ParentVUE/StudentVUE markers
# → Auth method: credentials (username/password)
```

---

## 7. Scraping Protocol

For Tier 4 platforms with no API, Scholaracle uses Playwright-based browser automation.

### 7.1 Architecture

```
packages/connector/src/scraper/
  ├── scraper-adapter.ts              # Implements ILmsAdapter
  ├── browser-context.ts              # Manages Playwright browser lifecycle
  ├── login-handler.ts                # Handles login flows (form, SSO, MFA)
  ├── page-scripts/                   # Per-school extraction scripts
  │   ├── generic-portal.ts           # Best-effort generic extractor
  │   └── parentvue.ts                # ParentVUE-specific extractor
  └── index.ts
```

### 7.2 Browser Lifecycle

1. Launch Chromium via Playwright (`headless: false` for MFA visibility)
2. Navigate to school portal login page
3. Login handler detects form type and submits credentials
4. If MFA is required, wait for parent to complete it manually
5. Navigate to grades/assignments/attendance pages
6. Extract data using page scripts
7. Transform extracted data to SLC envelope
8. Close browser

### 7.3 Page Script Interface

```typescript
interface IPageScript {
  readonly portalPattern: RegExp;    // URL pattern this script handles
  readonly displayName: string;      // 'ParentVUE', 'Generic Portal'

  canHandle(page: Page): Promise<boolean>;
  extractAssignments(page: Page): Promise<readonly IScrapedAssignment[]>;
  extractGrades(page: Page): Promise<readonly IScrapedGrade[]>;
  extractCalendar(page: Page): Promise<readonly IScrapedEvent[]>;
  extractAttendance(page: Page): Promise<readonly IScrapedAttendance[]>;
}
```

### 7.4 Playwright Dependency

Playwright is an **optional** peer dependency — it is only needed for scraping
and is not installed by default. API-based adapters do not require it.

```json
{
  "peerDependencies": {
    "playwright": "^1.40.0"
  },
  "peerDependenciesMeta": {
    "playwright": { "optional": true }
  }
}
```

---

## 8. Implementation Roadmap

### Coverage Target

| Built | Cumulative Coverage |
|-------|-------------------|
| Canvas (done) | ~30% of LMS |
| + Google Classroom | ~80% of LMS |
| + Schoology | ~95%+ of LMS |
| + OneRoster | ~30%+ of SIS |
| + Aeries | +CA coverage |
| + PowerSchool (if granted) | ~50%+ of SIS |
| + ParentVUE scraper | +~3% of SIS |
| **Total with 7 adapters** | **~85–90% of US K-12** |

### Priority Order

| Priority | Adapter | Effort | Reason |
|----------|---------|--------|--------|
| P0 | Canvas | Done | Reference implementation |
| P1 | Google Classroom | Medium | ~50%+ K-12 adoption; great API |
| P2 | OneRoster 1.2 | Medium | Covers 4+ SIS platforms |
| P3 | Schoology | Medium | ~20% LMS; OAuth 1.0a adds complexity |
| P4 | Aeries | Medium | Strong in CA; straightforward API |
| P5 | PowerSchool | Hard | Largest SIS; needs partnership |
| P6 | ParentVUE Scraper | Hard | Last resort; Playwright dependency |

### Test Strategy

Each adapter follows the Canvas test pattern:

- **Unit tests:** Mock `globalThis.fetch`, test transformer logic, test envelope shape
- **Fixture adapter:** Canned API responses for integration testing
- **E2E:** Seed route creates test data for new provider types

---

## Appendix: Sources

- [2025 K-12 SIS Market — ListEdTech](https://listedtech.com/blog/the-2025-k-12-sis-market/)
- [Google Classroom API Reference](https://developers.google.com/workspace/classroom/reference/rest)
- [Schoology REST API v1](https://developers.schoology.com/api-documentation/rest-api-v1/)
- [OneRoster 1.2 Specification](https://www.imsglobal.org/spec/oneroster/v1p2)
- [OneRoster 1.2 Gradebook REST Binding](https://www.imsglobal.org/sites/default/files/spec/oneroster/v1p2/gradebook-restbinding/OneRosterv1p2GradebookService_RESTBindv1p0.html)
- [Aeries API Full Documentation](https://support.aeries.com/support/solutions/articles/14000077926-aeries-api-full-documentation)
- [PowerSchool Developer Community](https://help.powerschool.com/t5/Community-Forum/Connect-to-API/m-p/488664)
- [Skyward Partner API](https://partners.skyward.com/support/api-definition)
- [Blackbaud SKY API](https://developer.blackbaud.com/)
- [Infinite Campus Parent API (unofficial)](https://github.com/schwartzpub/ic_parent_api)
- [FACTS SIS / RenWeb](https://factsmgt.com/)
- [Synergy ParentVUE](https://www.edupoint.com/Products/ParentVUE-StudentVUE)
