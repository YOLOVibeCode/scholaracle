# Scholaracle Scrape Test Harness — Specification

> Version 1.0 — 2026-02-16

## 1. Purpose

The scrape test harness validates that **real data** from education platforms
is scraped/fetched correctly and conforms to the application's ingest contract.
It uses the **same adapter code** as production — no mocks, no stubs.

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        harness.sh                            │
│  Shell entry point — delegates to harness.ts via ts-node     │
├──────────────────────────────────────────────────────────────┤
│                        harness.ts                            │
│  Orchestrator: parse args → create adapter → authenticate    │
│  → test connection → fetch envelope → validate → report      │
├──────────────────────────────────────────────────────────────┤
│  Production Adapter Code (same classes used by the app)      │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐ │
│  │ SkywardAdapter│ │ CanvasAdapter│ │GoogleClassroomAdapter│ │
│  │ SkywardClient │ │ CanvasClient │ │GoogleClassroomClient │ │
│  │ Transformers  │ │ Transformers │ │   Transformers       │ │
│  └──────────────┘ └──────────────┘ └──────────────────────┘ │
├──────────────────────────────────────────────────────────────┤
│                   validate-envelope.ts                       │
│  Structural validation + entity-specific checks              │
│  Produces IValidationReport with pass/fail/warn per check    │
└──────────────────────────────────────────────────────────────┘
        │                           │
        ▼                           ▼
  stdout (human-readable)     harness-output/
                              ├── skyward-2026-02-16T12-00-00Z.json         (raw envelope)
                              └── skyward-2026-02-16T12-00-00Z.report.json  (validation report)
```

## 3. Execution Flow

```
1. Parse credentials (CLI args or env vars)
2. Create adapter (same class as production)
3. Call adapter.authenticate(credentials)
4. Call adapter.testConnection() — verify credentials work
5. Call adapter.fetchEnvelope() — the actual scrape/API call
6. Run validate-envelope.ts checks against the envelope
7. Print human-readable report to stdout
8. Write raw envelope + report JSON to harness-output/
9. Exit 0 if all checks pass, exit 1 if any errors
```

## 4. Validation Checks

### 4.1 Envelope Structure (always run)

| Check | Severity | What it validates |
|-------|----------|-------------------|
| Schema version | error | `schemaVersion === "slc.ingest.v1"` |
| Run metadata | error | `runId`, `provider`, `adapterId` present |
| Run provider match | error | Provider in run matches the requested provider |
| Run startedAt | error | Valid ISO 8601 timestamp |
| Source metadata | error | `sourceId` and `displayName` present |
| Ops is array | error | `ops` is an array |
| Ops non-empty | warning | At least 1 op (empty is valid but suspicious) |

### 4.2 Per-Op Validation (for every op)

| Check | Severity | What it validates |
|-------|----------|-------------------|
| Valid entity type | error | Entity is one of the known SlcEntityType values |
| Complete key | error | `provider`, `adapterId`, `externalId` all present |
| Upsert has record | error | `op === "upsert"` implies `record` is present |
| Valid observedAt | error | ISO 8601 timestamp |

### 4.3 Entity-Specific Checks (per entity type)

**Assignments:**
| Check | Severity | What it validates |
|-------|----------|-------------------|
| Have titles | warning | Every assignment has a `title` |
| Have status | warning | At least some have `status` (graded/missing/etc.) |
| Have point data | warning | At least some have `pointsPossible` or `pointsEarned` |

**Grade Snapshots:**
| Check | Severity | What it validates |
|-------|----------|-------------------|
| Have percentGrade | warning | All grade snapshots have a numeric `percentGrade` |

**Courses:**
| Check | Severity | What it validates |
|-------|----------|-------------------|
| Have subjectArea | warning | Subject reconciliation produced a subjectArea |
| Have teacherName | warning | At least some courses have a teacher name |

## 5. Provider-Specific Credentials

### 5.1 Skyward

```bash
./harness.sh skyward \
  --url "https://skyward.mydistrict.net/scripts/wsisa.dll/WService=wsEAplus/seplog01.w" \
  --username "student_login" \
  --password "student_password"
```

**What happens:**
1. `SkywardAdapter` creates a `SkywardClient` wrapping `skyward-rest`
2. `skyward-rest` POSTs to `skyporthttp.w` with login credentials
3. Gets session token (`encses` + `sessionId`)
4. Scrapes report card → grade snapshots
5. For each course, scrapes gradebook → course + assignment ops
6. If extended scraper available: attendance, schedule, documents, messages
7. Subject reconciliation normalizes course names

**Required npm package:** `npm install skyward-rest` (must be in the connector package)

**Expected output entities:** `gradeSnapshot`, `course`, `assignment`
**Optional entities:** `attendanceEvent`, `teacher`, `courseMaterial`, `message`

### 5.2 Canvas LMS

```bash
./harness.sh canvas \
  --url "https://school.instructure.com" \
  --token "your-canvas-api-token"
```

**What happens:**
1. `CanvasAdapter` creates a `CanvasClient` with bearer token
2. Fetches `/api/v1/users/self` (connection test)
3. Fetches `/api/v1/courses` → iterates each course
4. For each course: assignments + submissions (matched by `assignment_id`)
5. Fetches calendar events (next 30 days)
6. Transforms all data into assignment + eventSeries ops

**Expected output entities:** `assignment`, `eventSeries`

### 5.3 Google Classroom

```bash
./harness.sh google-classroom --token "ya29.your-oauth-token"
```

**Expected output entities:** `course`, `assignment`, `gradeSnapshot`

### 5.4 OneRoster

```bash
./harness.sh oneroster \
  --url "https://sis.district.edu/ims/oneroster/v1p2" \
  --token "access-token"
# or
./harness.sh oneroster \
  --url "..." --client-id "id" --client-secret "secret"
```

**Expected output entities:** `institution`, `academicTerm`, `course`, `assignment`

## 6. Output Format

### 6.1 Stdout (human-readable)

```
═══════════════════════════════════════════════════════════
  Scholaracle Scrape Harness — skyward
  2026-02-16T12:00:00.000Z  (4523ms)
═══════════════════════════════════════════════════════════

  Entity Counts:
    gradeSnapshot        12
    course               6
    assignment           47
    TOTAL                65

  Validation Checks:
    ✓ Schema version
      schemaVersion = "slc.ingest.v1"
    ✓ Run metadata present
      runId=harness-1708012800000, provider=skyward
    ✓ All entity types are valid
      All valid
    ✓ Assignments have titles
      47/47 have titles
    ⚠ Assignments have status [WARN]
      35/47 have status

  Result: PASSED WITH WARNINGS
  15/16 passed, 1 warnings, 0 errors

  Sample Data (first 2 per entity type):
  ────────────────────────────────────────
    [gradeSnapshot] skyward-grade-97776-TERM 1
      {
        "courseExternalId": "skyward-course-97776",
        "percentGrade": 95,
        "asOfDate": "2026-02-16"
      }
    [assignment] skyward-97776-Midterm-10/15/25
      {
        "title": "Midterm",
        "status": "graded",
        "pointsPossible": 100,
        "pointsEarned": 92
      }
```

### 6.2 File Output

| File | Content |
|------|---------|
| `harness-output/<provider>-<timestamp>.json` | Raw `ISlcIngestEnvelopeV1` JSON |
| `harness-output/<provider>-<timestamp>.report.json` | `IValidationReport` JSON |

## 7. Exit Codes

| Code | Meaning |
|------|---------|
| 0 | All checks passed (warnings are OK) |
| 1 | One or more error-severity checks failed, or a fatal error |

## 8. Extending to New Providers

To add a new provider to the harness:

1. Add a case to `createAdapter()` in `harness.ts`
2. Add a case to `buildCredentials()` for the required credential fields
3. Add entity-specific validation checks to `validate-envelope.ts` if needed
4. Update the shell script usage text and this spec

The harness automatically picks up any new entity types or adapter changes
because it uses the same code as production.
