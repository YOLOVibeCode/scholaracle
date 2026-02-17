# Scholaracle Adapter Specification

> Version 1.0 — 2026-02-15

## 1. Overview

Scholaracle adapters are **componentized, individually testable modules** that fetch
academic data from external LMS/SIS platforms and normalize it into the
Scholaracle Ingest Envelope format (`ISlcIngestEnvelopeV1`).

Every adapter follows **Interface Segregation Principle (ISP)** — small, focused
interfaces — and is built from three layers:

```
┌────────────────────────────────────────┐
│             Adapter                    │  implements ILmsAdapter
│  (orchestrates client + transformer)   │
├────────────────────────────────────────┤
│             Client                     │  implements ILmsClient<TConfig>
│  (HTTP calls to external API)          │
├────────────────────────────────────────┤
│             Transformer                │  pure functions, no I/O
│  (raw API → ISlcDeltaOp)              │
└────────────────────────────────────────┘
```

Each layer is independently testable:

| Layer       | Tests via                          | I/O?  |
|-------------|------------------------------------|-------|
| Transformer | Unit tests (pure functions)        | None  |
| Client      | Unit tests (mock `fetch`)          | Mocked|
| Adapter     | Integration tests (mock Client)    | Mocked|

## 2. Core Interfaces

### 2.1 ILmsAdapter (orchestration)

Defined in `packages/connector/src/adapter.ts`:

```typescript
interface ILmsAdapter extends ILmsAuthenticator, ILmsEnvelopeReader {
  readonly meta: ILmsAdapterMeta;
}
```

Composed from two ISP interfaces:

- **ILmsAuthenticator** — `authenticate(credentials)` + `isAuthenticated()`
- **ILmsEnvelopeReader** — `fetchEnvelope(params) → ISlcIngestEnvelopeV1`

### 2.2 ILmsClient\<TConfig\> (HTTP layer)

Each adapter defines its own client interface. The client:

- Accepts a config object with `baseUrl` and auth fields
- Exposes typed methods for each API endpoint (`getCourses`, `getAssignments`, etc.)
- Handles pagination, rate limiting, and error mapping
- Is the **only** layer that performs HTTP I/O

### 2.3 Transformer (pure functions)

Each adapter exports pure transformer functions:

- Input: raw API response types (e.g., `ICanvasAssignment`)
- Output: `ISlcDeltaOp<TEntity>` (e.g., `ISlcDeltaOp<ISlcAssignment>`)
- **Zero side effects** — no HTTP, no Date.now(), no randomness in logic
- Easy to unit test with static fixtures

## 3. Adapter Directory Structure

Each adapter lives in its own directory under `packages/connector/src/`:

```
packages/connector/src/
├── adapter.ts                    # Core interfaces (ILmsAdapter, etc.)
├── adapter-registry.ts           # AdapterRegistry class
├── canvas/
│   ├── index.ts                  # Barrel exports
│   ├── canvas-client.ts          # CanvasClient class
│   ├── canvas-client.test.ts     # Client unit tests (mock fetch)
│   ├── canvas-transformer.ts     # Pure transform functions
│   ├── canvas-transformer.test.ts# Transformer unit tests
│   ├── canvas-adapter.ts         # CanvasAdapter class
│   └── canvas-adapter.test.ts    # Adapter tests (mock client)
├── google-classroom/
│   ├── index.ts
│   ├── google-classroom-client.ts
│   ├── google-classroom-client.test.ts
│   ├── google-classroom-transformer.ts
│   ├── google-classroom-transformer.test.ts
│   ├── google-classroom-adapter.ts
│   └── google-classroom-adapter.test.ts
├── skyward/
│   ├── index.ts
│   ├── skyward-client.ts
│   ├── skyward-client.test.ts
│   ├── skyward-transformer.ts
│   ├── skyward-transformer.test.ts
│   ├── skyward-adapter.ts
│   └── skyward-adapter.test.ts
└── oneroster/
    ├── index.ts
    ├── oneroster-client.ts
    ├── oneroster-client.test.ts
    ├── oneroster-transformer.ts
    ├── oneroster-transformer.test.ts
    ├── oneroster-adapter.ts
    └── oneroster-adapter.test.ts
```

## 4. Data Flow

```
Student credentials
        │
        ▼
┌──────────────┐
│   Adapter    │─── authenticate(credentials) ───▶ Client validates creds
│              │
│              │─── fetchEnvelope(params) ────────▶ Client.getCourses()
│              │                                    Client.getAssignments()
│              │                                    Client.getSubmissions()
│              │                                    Client.getGrades()
│              │                                          │
│              │                                          ▼
│              │◀────────── Transformer(raw) ──── ISlcDeltaOp[]
│              │
│              │─── return ISlcIngestEnvelopeV1
└──────────────┘
```

## 5. Adapter Implementations

### 5.1 Canvas LMS (`com.instructure.canvas`)

- **Status:** Implemented
- **Tier:** `api` — Full REST API
- **Auth:** Bearer token (personal access token)
- **Base URL:** `{baseUrl}/api/v1`
- **Endpoints used:**
  - `GET /api/v1/courses` — list enrolled courses
  - `GET /api/v1/courses/:id/assignments` — list assignments
  - `GET /api/v1/courses/:id/students/submissions` — list submissions
  - `GET /api/v1/courses/:id/enrollments` — grades (current_score, final_score)
  - `GET /api/v1/calendar_events` — calendar events
  - `GET /api/v1/users/self/observees` — parent/observer linked students
- **Pagination:** `Link` header with `rel="next"`
- **Capabilities:** assignments, grades, calendar, courses

### 5.2 Google Classroom (`com.google.classroom`)

- **Status:** Planned → implementing
- **Tier:** `api` — Full REST API
- **Auth:** OAuth 2.0 (access token from Google OAuth flow)
- **Base URL:** `https://classroom.googleapis.com/v1`
- **Endpoints used:**
  - `GET /v1/courses` — list courses
  - `GET /v1/courses/:id/courseWork` — list coursework (assignments)
  - `GET /v1/courses/:id/courseWork/:id/studentSubmissions` — submissions + grades
  - `GET /v1/courses/:id/students` — list students in course
  - `GET /v1/userProfiles/:id/guardians` — parent/guardian links
- **Pagination:** `pageToken` / `nextPageToken` in JSON response
- **Capabilities:** assignments, grades, courses

### 5.3 Skyward (`com.skyward`)

- **Status:** Planned → implementing
- **Tier:** `scrape` — No official API; uses `skyward-rest` scraper
- **Auth:** Username + password (student portal credentials)
- **Base URL:** District-specific login URL (e.g., `https://skyward.district.net/scripts/wsisa.dll/...`)
- **Methods used (via skyward-rest):**
  - `scrapeGradebook(user, pass, { course, bucket })` — per-course assignment grades
  - `scrapeReport(user, pass)` — report card (course scores by term)
  - `scrapeHistory(user, pass)` — academic history
- **Capabilities:** assignments, grades, courses

### 5.4 OneRoster Generic (`org.imsglobal.oneroster.1.2`)

- **Status:** Planned → implementing
- **Tier:** `oneroster` — Industry standard
- **Auth:** OAuth 2.0 client credentials
- **Base URL:** `{baseUrl}/ims/oneroster/v1p2`
- **Endpoints used:**
  - `GET /students` — list students
  - `GET /classes` — list classes/sections
  - `GET /courses` — list courses
  - `GET /enrollments` — list enrollments
  - `GET /lineItems` — assignments (gradebook columns)
  - `GET /results` — grades/scores
  - `GET /academicSessions` — terms/grading periods
  - `GET /categories` — grade categories
- **Pagination:** `limit` + `offset` query params
- **Capabilities:** assignments, grades, courses, terms, institutions

## 6. Testing Strategy

### 6.1 Transformer Tests (pure unit tests)

Each transformer function gets its own `describe` block with tests for:
- Happy path: valid input → correct `ISlcDeltaOp`
- Edge cases: null/missing fields, empty arrays
- Status mapping: each status value covered

Example:
```typescript
describe('transformAssignmentToOp', () => {
  it('should map a graded submission', () => { ... });
  it('should handle missing submission', () => { ... });
  it('should handle late submission', () => { ... });
  it('should handle null due_at', () => { ... });
});
```

### 6.2 Client Tests (mock fetch)

Each client method gets its own `describe` block with tests for:
- Correct URL construction
- Auth headers present
- Pagination handling
- Error response handling (401, 403, 404, 500)

Example:
```typescript
describe('GoogleClassroomClient', () => {
  describe('getCourses', () => {
    it('should call GET /v1/courses with auth header', () => { ... });
    it('should follow nextPageToken pagination', () => { ... });
    it('should throw on 401', () => { ... });
  });
});
```

### 6.3 Adapter Tests (mock client)

Each adapter gets tests for:
- `meta` — correct provider, adapterId, version
- `authenticate()` — success, missing credentials, wrong credential type
- `isAuthenticated()` — before/after authenticate
- `fetchEnvelope()` — correct envelope shape, ops from all data sources
- Error propagation from client

Example:
```typescript
describe('GoogleClassroomAdapter', () => {
  describe('meta', () => { ... });
  describe('authenticate', () => { ... });
  describe('fetchEnvelope', () => { ... });
});
```

### 6.4 Registry Tests

- Register, create, has, not-found, replacement — already implemented.

## 7. Entity Mapping Reference

All adapters normalize into these Scholaracle entity types:

| Entity            | Interface              | Key fields                                         |
|-------------------|------------------------|----------------------------------------------------|
| `assignment`      | `ISlcAssignment`       | title, dueAt, status, pointsPossible, pointsEarned |
| `gradeSnapshot`   | `ISlcGradeSnapshot`    | courseExternalId, letterGrade, percentGrade, asOfDate|
| `course`          | `ISlcCourse`           | title, courseCode, subjectArea, teacherName         |
| `academicTerm`    | `ISlcAcademicTerm`     | title, startDate, endDate, type                    |
| `eventSeries`     | `ISlcEventSeries`      | title, category, startsAt, endsAt, recurrence      |
| `attendanceEvent` | `ISlcAttendanceEvent`  | date, status, periodName                           |
| `institution`     | `ISlcInstitution`      | name, type, address                                |

## 8. Adding a New Adapter

1. Create directory: `packages/connector/src/{provider}/`
2. Define client types: `I{Provider}Course`, `I{Provider}Assignment`, etc.
3. Implement client: `{Provider}Client` with typed API methods
4. Implement transformer: pure functions mapping raw → `ISlcDeltaOp`
5. Implement adapter: `{Provider}Adapter implements ILmsAdapter`
6. Write tests: transformer (unit), client (mock fetch), adapter (mock client)
7. Add barrel export: `{provider}/index.ts`
8. Register in `AdapterRegistry`
9. Update `PLATFORM_DESCRIPTORS` status to `'implemented'`
10. Export from `packages/connector/src/index.ts`
