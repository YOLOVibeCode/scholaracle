# Scraper Flow: Test Coverage & Readiness

**Last check:** API integrations + packager suites run and pass (**59 tests**).  
**Verdict:** **Thoroughly tested (API).** Generate-scraper, generate-status, and all scraper-download branches (single, bundle, multi-student) are covered by automated API tests. Packager and resolver are well covered. Remaining gaps: AI/job-processor unit tests, UI component tests, and full user-path E2E.

---

## What Is Tested and Passing

| Area | File | What's covered |
|------|------|----------------|
| **POST generate-scraper** | `integrations.test.ts` | 401 without token; 400 missing platformName/loginUrl/loginMethod; 200 known platform (Canvas) with reference code; 200 unknown platform with jobId queued. |
| **GET generate-status** | `integrations.test.ts` | 401 without token; 400 missing jobId; 404 job not found; 200 with status and result when job is ready. |
| **POST scraper-download** | `integrations.test.ts` | Bundle does not revoke unrelated scraper tokens; single with scraperId → 200 + script (ts-node, run.js, scraper content); single with platform+url (reference) → 200 + script; 400 when no scraperId/platform/connections/students; 404 when scraperId not found; bundle → 200 + payload.json/run.js; multi-student with body.students → 200 + scholaracle-sync script; useAllStudents with no students → 400. |
| **Packager (unit)** | `packager.test.ts` | `packageSingleFile` Mac/Windows (script content: ts-node, scraper.ts, run.js, scheduling, full lifecycle). `packageBundle` Mac/Windows (payload.json, per-connection files, discoverStudents, chmod 600). |
| **Resolver** | `packager.test.ts` | `resolveScraperCode`: by scraperId from DB, reference stub for known platform (Canvas), generic fallback for unknown. |
| **Bundle emitter** | `packager.test.ts` | `emitBundleFiles`: per-connection scraper filenames, package.json with ts-node/typescript. |
| **Bundle run.js** | `packager.test.ts` | `generateBundleRunJs`: ts-node, initialize/authenticate/discoverStudents/switchToStudent/scrape/transform, ingest API (runs, envelope, complete), studentExternalId, studentNameHint. |
| **Packager E2E** | `packager.test.ts` | Stub scraper → run → envelope → complete against real ingest API; course stored in DB. |
| **Integrations CRUD** | `integrations.test.ts` | GET/POST/PUT/DELETE integrations, link/unlink students. |
| **Web API client** | `integrations.test.ts` (web) | list, get, create, update, delete, listStudents, assignStudent, unlinkStudent. No generate/download. |

**Run:** From repo root, `pnpm test` (all packages), or from `packages/api`:  
`pnpm exec jest src/routes/integrations/integrations.test.ts src/services/scraper-generator/packager.test.ts`

---

## Remaining Gaps (Optional)

### Services

- **AI generator** (`ai-generator.ts`): `generateScraperWithAI` — no unit tests (would require mocking LLM).
- **Job processor** (`job-processor.ts`): `processScraperGenerationJob` — no tests (runs async; covered indirectly via generate-scraper route).

### Web

- **ConnectProviderWizard:** No component or integration tests (steps, generate-scraper call, poll generate-status, single download).
- **SelfHostedScraperCard:** No tests (bundle state, download bundle, download all students).
- **AddStudentWizard** (scraper bundle path): No tests.
- **API client:** No tests for generate-scraper, generate-status, or scraper-download (web uses raw `fetch` in components).

### E2E

- No full user-path E2E: e.g. open Integrations → Add Provider → fill platform/credentials → generate (or skip) → download → verify file. Or bundle path: add platforms → download bundle → verify script content/run.

---

## Recommendation

- **Production:** The API side of the scraper flow is **thoroughly tested**. All three download paths (single, bundle, multi-student), generate-scraper, and generate-status are covered. Safe to ship from an API perspective.
- **Before release:** Run through the three user paths in the [user-path doc](./user-path-to-scraper-script.md) manually (single download, bundle download, all-students download) and confirm the downloaded script runs and posts to ingest as expected.
- **Optional later:** Add component tests for ConnectProviderWizard/SelfHostedScraperCard or one E2E that walks the single-platform path; add AI/job-processor unit tests if you change that logic often.

---

## Quick Manual Checklist

- [ ] **Single-platform:** Integrations → Add Provider → Other platform → enter URL/creds → generate (wait for ready) → Download → run script on Mac/Windows → verify ingest.
- [ ] **Bundle:** Integrations → Connect Your School → add 2 platforms (e.g. Canvas + one “Other” with generate) → Download Bundle → run script → verify both platforms in ingest.
- [ ] **All students:** Connect Your School → add platforms + link students → Download Script (all students) → run → verify multi-student payload.
- [ ] **Reference platforms:** Add Provider → Canvas (or Aeries/Skyward) → skip generate → Download → run script.

Once these pass, the scraper flow is **ready** for production.
