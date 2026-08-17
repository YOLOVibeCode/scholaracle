# Client Scraper Pipeline — Engineering Specification

**Status**: v1.0 — approved for implementation  
**Applies to**: `scraper-core`, `scraper-playwright`, `mobile`, `browser-extension`, `scholaracle_scrapers`  
**Cross-reference**: [CLIENT_SCRAPER_SPEC.md](./CLIENT_SCRAPER_SPEC.md) for data quality rules (identity, join keys, completeness)

---

## 1. Goal

Every client (mobile app, browser extension, CLI) currently contains a duplicated
`switch(provider)` orchestrator, independent envelope assembly, and inconsistent ingest
URL paths. The target is **one orchestrator** that all three clients call as a pure
host-injection pattern:

```
Client (host provider)
  └─ scraper-core: runClientScrape(host) → ISlcIngestEnvelopeV1
       ├─ resolves IScraperModule by provider
       ├─ calls module.scrape(host) → raw extract
       ├─ calls module.transform(raw, ctx) → ISlcDeltaOp[]
       ├─ calls validateEnvelope
       └─ calls host.uploader.uploadRun (three-step protocol)
```

Authentication (login) stays in the client because it is always runtime-specific.
After a successful login the client hands a live `IPageDriver` to `runClientScrape`.

---

## 2. `IClientScrapeHost` interface

```typescript
// scraper-core/src/pipeline/types.ts

export type ClientType = 'mobile' | 'browser-extension' | 'cli';

export interface IClientScrapeConfig {
  /** Provider key: 'canvas' | 'skyward' | 'aeries' | ... */
  readonly provider: string;
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly baseUrl: string;
  readonly sourceId: string;
  readonly studentExternalId: string;
  readonly institutionExternalId: string;
  readonly studentNameHint?: string;
  /** scraper-core semver string (injected by build tooling). */
  readonly coreVersion?: string;
}

export interface IIngestUploader {
  /** POST /api/ingest/v1/runs */
  registerRun(params: IRegisterRunParams): Promise<void>;
  /** POST /api/ingest/v1/runs/:runId/envelope */
  uploadEnvelope(runId: string, envelope: ISlcIngestEnvelopeV1): Promise<void>;
  /** POST /api/ingest/v1/runs/:runId/complete */
  completeRun(runId: string, status: 'success' | 'failed', error?: string): Promise<void>;
}

export interface IRegisterRunParams {
  readonly runId: string;
  readonly provider: string;
  readonly adapterId: string;
  readonly sourceId: string;
  readonly startedAt: string;
}

export interface IClientScrapeHost {
  /** Live, authenticated page driver handed to the module's scrape() call. */
  readonly driver: IPageDriver;
  /** Resolved config for this run. */
  readonly config: IClientScrapeConfig;
  /** Client type used in envelope meta and progress messages. */
  readonly clientType: ClientType;
  /** Three-step ingest uploader. */
  readonly uploader: IIngestUploader;
  /**
   * Optional asset host. When present the pipeline calls it before upload so
   * that local files or in-page base64 blobs are processed and URLs rewritten.
   * Omit on mobile/extension (handled in-page via base64 embedding).
   */
  readonly assets?: IAssetHost;
  /**
   * Optional run recorder for local persistence of sync history
   * (mobile/CLI only; extension can omit).
   */
  readonly recorder?: IRunRecorder;
  /** Emit progress events back to the caller UI. */
  onProgress?(progress: ISyncProgress): void;
  /**
   * Optional extra enricher (LLM / API / on-device). Always runs after the
   * built-in JoinGapEnricher. Fail-open — see §2.2.
   */
  readonly enricher?: IAIEnricher;
  readonly enricherTimeoutMs?: number;
  /** Optional resolver override (tests / sideload). */
  readonly resolver?: IScraperResolver;
}
```

### 2.2 `IAIEnricher` — fail-open join intelligence

```typescript
export interface IAIEnricher {
  enrich(rawExtract: Record<string, unknown>, ops: ISlcDeltaOp[]): Promise<ISlcDeltaOp[]>;
}
```

`runClientScrape` **always** runs `JoinGapEnricher` (deterministic, no LLM) after
transform/assets, then `host.enricher` if present. Mobile, extension, and CLI
therefore get join fills with **no signature change**.

| Allowed fills (empty fields only) | Forbidden |
|-----------------------------------|-----------|
| `record.courseExternalId`         | New ops, dropped ops |
| `record.assignmentExternalId`     | Changing `key.externalId` |
| `record.courseName`               | Overwriting a non-empty field |
| `key.courseExternalId` if empty   | FKs that do not already exist in this envelope |
|                                   | Raw HTML, cookies, passwords |

Illegal patches, throws, and timeouts are discarded. The original (or last legal)
ops continue. Envelope `run.meta` records `enrichmentSource`, `enrichmentPatchCount`,
`enrichmentFailed`.

### 2.3 Server ingest enrichment (`ENRICH_OPS_MODE`)

`POST /api/ingest/v1/runs/:runId/envelope` runs the **same** `JoinGapEnricher`
after schema validation and before `applyOps`. This covers old TestFlight
builds, CLI, and any client that does not yet run the client-side enricher.

| `ENRICH_OPS_MODE` | Behaviour |
|-------------------|-----------|
| `off` (default) | Identity. Production-safe. |
| `shadow` | Enrich and log `enrichPatchCount`; persist **original** ops. |
| `apply` | Enrich, revalidate, persist enriched ops. On failure, persist original ops. |

Inject `enrichOpsMode` on `IIngestV1RouterConfig` in tests instead of mutating env.
JoinGap is idempotent: a client that already filled FKs yields `patchCount: 0`.

Adaptive HTML fallback is out of scope.

### 2.1 `IIngestUploader` — canonical three-step paths

All three clients MUST use these paths:

| Step | Path | Notes |
|------|------|-------|
| 1. Register | `POST /api/ingest/v1/runs` | Body: `IRegisterRunParams` |
| 2. Upload | `POST /api/ingest/v1/runs/:runId/envelope` | Body: full `ISlcIngestEnvelopeV1` |
| 3. Complete | `POST /api/ingest/v1/runs/:runId/complete` | Body: `{ runId, status }` |

> **Extension drift (fix required):** `ingest.ts` currently calls `/api/ingest/v1/envelope`
> and `/api/ingest/v1/complete` (without `:runId`). These are wrong. After this spec is
> implemented the extension's `IIngestUploader` implementation must use the paths above.

---

## 3. `runClientScrape` function

```typescript
// scraper-core/src/pipeline/runClientScrape.ts

export async function runClientScrape(
  host: IClientScrapeHost
): Promise<ISlcIngestEnvelopeV1>
```

### 3.1 Pipeline steps

```
1. Generate runId (UUID)
2. resolver.resolve(provider) → IScraperModule
3. host.recorder?.startRun(...)        [optional]
4. emit 'extracting'
5. module.scrape(host)                  → raw extract    [portal step]
6. emit 'transforming'
7. module.transform(raw, ctx)           → ISlcDeltaOp[]  [local step]
8. host.assets?.processOps(ops)         → ops′           [optional, CLI only]
8b. JoinGapEnricher then host.enricher?  → ops″          [fail-open; never throws]
9. assemble ISlcIngestEnvelopeV1
10. validateEnvelope(envelope)          [throw on hard errors; warn on completeness]
11. emit 'uploading'
12. uploader.registerRun(...)
13. uploader.uploadEnvelope(runId, envelope)
14. uploader.completeRun(runId, 'success')
15. host.recorder?.completeRun(...)     [optional]
16. emit 'complete'
17. return envelope
```

Any exception in steps 5 throws as `SyncError { phase: 'portal' }`.  
Any exception in steps 7–10 throws as `SyncError { phase: 'local' }`.  
Any exception in steps 12–14 throws as `SyncError { phase: 'upload' }`.

### 3.2 `IScraperModule` — builtin implementations

Each builtin module wraps the existing recipe + transformer pair:

```typescript
// canvasBuiltinModule (already exists; MUST be updated for native IDs per §6)
export const canvasBuiltinModule: IScraperModule = {
  metadata: { adapterId: 'canvas-lms', ... },
  async scrape(host) { return runCanvasRecipe(host.driver, host.config.baseUrl); },
  transform(raw, ctx)  { return transformCanvasExtract(raw as ICanvasBrowserExtract, ctx); },
};

export const skywardBuiltinModule: IScraperModule = { ... };
export const aeriesBuiltinModule:  IScraperModule = { ... };
```

`BuiltinScraperResolver.resolve(provider)` maps `canvas → canvasBuiltinModule` etc.
This resolver is already exported from `scraper-core/src/registry`.

### 3.3 Envelope `meta` shape

The `run.meta` block tells the server which client produced the envelope:

| field | mobile | extension | CLI |
|-------|--------|-----------|-----|
| `clientType` | `'mobile'` | `'browser-extension'` | `'cli'` |
| `coreVersion` | package.json injected | same | same |
| `adapterVersion` | `IClientScrapeConfig.adapterVersion` | same | same |
| `platform` | `'ios'` / `'android'` | omit | `'node'` |
| `extensionVersion` | omit | extension manifest version | omit |

---

## 4. Driver contract (`IPageDriver`)

The driver interface is defined in `scraper-core/src/driver/IPageDriver.ts`.
Below are the exact semantics each host implementation MUST honour.

### 4.1 `evaluate<TArgs, TResult>(fn, ...args)`

- `fn` is a self-contained function with **no outer-scope closure** (same browser-context restriction as `page.evaluate`).
- Callers MUST pass at most **one positional argument** after `fn`. Multi-value inputs MUST be packed into a single object/array:

```typescript
// CORRECT
await driver.evaluate(myExtractFn, { courseId, baseUrl });

// WRONG — forbidden, Playwright only forwards the first extra arg
await driver.evaluate(extractSkywardCourseAssignments, course.name, course.period);
```

All extractors with multiple current parameters (`extractSkywardCourseAssignments`,
`extractAeriesCourseAssignments`) MUST be updated to accept a single options object
before this spec is fully implemented (see §7).

### 4.2 `goto(url, options?)`

- `options.waitUntil`:
  - `'load'` (default) — wait for the load event only. Use when the SPA may hold long-poll connections.
  - `'networkidle'` — wait until no network activity for 500 ms. Use only for login confirmation and first-load.
- Recipes MUST prefer `'load'` for course-page navigation inside loops to avoid timeouts.
- Caller may pass `options.timeout` (ms); recipe is responsible for reasonable defaults (30 000 ms or less).

### 4.3 `onNewPage(handler)`

Called once during `initialize` or at the start of `scrape`. Required for Skyward's popup pattern.

- The handler receives a new `IPageDriver` wrapping the popup page.
- After the handler resolves the **host driver instance** MUST redirect all subsequent calls to the popup page.
- Playwright: already implemented via `context.on('page', ...)` + `setPage()`.
- Extension `ContentScriptPageDriver`: popup windows open in a new tab; the content script cannot follow. **Skyward is therefore degraded on the extension** — `onNewPage` MUST log a warning and the recipe MUST fall back to no-popup login detection (password form in the main window, not a popup). If a popup is detected the scrape MUST fail fast with a user-friendly error message: `"Skyward opened a popup window. Open the Skyward tab that appeared and retry sync from there."`
- Mobile `WebViewPageDriver`: in-app WebView cannot open popups; same degraded behaviour applies.

### 4.4 `waitForLoad(options?)`

Silently swallows timeouts (`.catch(() => {})`). Recipes MUST NOT rely on it resolving without error.

### 4.5 `sleep(ms)`

Convenience wrapper around the runtime's pause mechanism. Recipes SHOULD use it sparingly (prefer `waitForLoad` or `waitForUrlIncludes` when the completion signal exists).

---

## 5. Client host implementations

### 5.1 Mobile (`SyncOrchestrator`)

After this change `SyncOrchestrator.ts` becomes a thin host builder:

```typescript
import { runClientScrape, BuiltinScraperResolver } from '@scholaracle/scraper-core';

export async function runSyncPipeline(
  driver: IPageDriver,
  config: ISyncOrchestratorConfig,
  uploader: IEnvelopeUploader,
  connectorToken: string,
  recorder: IRunRecorder,
  onProgress?: SyncProgressCallback
): Promise<ISlcIngestEnvelopeV1> {
  return runClientScrape({
    driver,
    config: { ...config, coreVersion: SCRAPER_CORE_PACKAGE_VERSION },
    clientType: 'mobile',
    uploader: buildMobileUploader(uploader, connectorToken),
    recorder,
    onProgress,
  });
}
```

The `buildMobileUploader` adapts `IEnvelopeUploader` (existing interface) to `IIngestUploader`
without changing the rest of the mobile codebase.

### 5.2 Browser extension (`content-script.ts`)

```typescript
import { runClientScrape, BuiltinScraperResolver } from '@scholaracle/scraper-core';
import { ExtensionIngestUploader } from '../lib/ingest';

async function runSync(msg: IRunSyncMessage): Promise<void> {
  const { runId, credential, connectorToken, apiBaseUrl } = msg;
  const driver = new ContentScriptPageDriver();

  const envelope = await runClientScrape({
    driver,
    config: { runId, ...credentialToConfig(credential) },
    clientType: 'browser-extension',
    uploader: new ExtensionIngestUploader(apiBaseUrl, connectorToken),
    onProgress: (p) => chrome.runtime.sendMessage({ type: 'SYNC_PROGRESS', ...p }),
  });

  chrome.runtime.sendMessage({ type: 'SYNC_COMPLETE', runId, opCount: envelope.ops.length });
}
```

`ExtensionIngestUploader` MUST use the canonical three-step paths (see §2.1).

### 5.3 CLI (`BaseScraper`)

`BaseScraper` currently orchestrates: authenticate → scrape → transform → validate → upload.
After this change `scrape()` and `transform()` are called through `runClientScrape` via an
`IScraperModule` adapter:

```typescript
// CLI: each platform scraper remains responsible for authenticate() only.
// After login it calls:
const envelope = await runClientScrape({
  driver: this.driver,
  config: { ...this.config, coreVersion: SCRAPER_CORE_PACKAGE_VERSION },
  clientType: 'cli',
  uploader: new CliIngestUploader(this.config.apiBaseUrl, this.config.connectorToken),
  assets: this.config.assetHost,
  recorder: this.config.recorder,
  onProgress: (p) => this.emitProgress(p.phase, p.message),
});
```

`CliIngestUploader` is a simple `fetch`-based implementation of `IIngestUploader`.

#### 5.3.1 Playwright driver consolidation

`scholaracle_scrapers/src/core/playwright-driver.ts` is **functionally equivalent** to
`@scholaracle/scraper-playwright/src/playwright-driver.ts` and both implement `IPageDriver`.
They cannot be merged into a single npm package today because the CLI uses
`playwright@^1.48` while the monorepo uses `playwright@^1.62` — the types are binary
incompatible at the TypeScript level.

**Until playwright is pinned to the same version across both repos**, the CLI MUST keep its
own `src/core/playwright-driver.ts`. It MUST implement `IPageDriver` from
`@scholaracle/scraper-core` and MUST NOT duplicate the `IPageDriver` interface itself.
When the playwright versions are aligned, `src/core/playwright-driver.ts` should be
deleted and the CLI should import `PlaywrightPageDriver` from `@scholaracle/scraper-playwright`.

#### 5.3.2 Dead transformer/validator forks

Any local `*-transformer.ts` or `*-validator.ts` files under `scholaracle_scrapers/src/`
that re-export or duplicate code from `@scholaracle/scraper-core` MUST be deleted.
Scrapers import directly from `@scholaracle/scraper-core`.

---

## 6. Native and stable `externalId` rules (per-platform)

See [CLIENT_SCRAPER_SPEC.md §3](./CLIENT_SCRAPER_SPEC.md) for the full identity contract.
This section specifies the concrete IDs transformers MUST emit.

### 6.1 Canvas

| Entity | Current (wrong) | Required |
|--------|----------------|---------|
| `assignment` | `canvas-${courseId}-assignment-${arrayIndex}` | `canvas-assignment-${nativeId}` where `nativeId = a.id` from Canvas API |
| `courseMaterial` (file) | `canvas-file-${courseId}-${fileName}` | `canvas-file-${nativeFileId}` where `nativeFileId = file.id` from Canvas API |
| `message` (announcement) | `canvas-announcement-${arrayIndex}` | `canvas-announcement-${ann.id}` — requires adding `id` field to extractor |
| `teacher` | `canvas-teacher-${tid}` | keep (tid is already the Canvas API native user ID) |
| `course` | `canvas-course-${courseId}` | keep |
| `gradeSnapshot` | `canvas-grade-${courseId}` | keep |
| `academicTerm` | `canvas-term-fall/spring-${year}` | `canvas-term-${raw.term.id}` when Canvas term object has an ID; fall back to `canvas-term-${slugify(termName)}` |

**`matchMaterialsToAssignments`** MUST be updated to return a `Map<fileId, assignmentNativeId>`
instead of `Map<fileName, assignmentArrayIndex>`. The transformer then uses `canvas-assignment-${nativeId}` as `assignmentExternalId`.

### 6.2 Skyward

| Entity | Current (wrong) | Required |
|--------|----------------|---------|
| `course` | `skyward-course-${period}-${slugify(name)}` | `skyward-course-${_cni}` when `_cni` is present; fall back to `skyward-course-${period}-${slugify(name)}` |
| `assignment` (missing) | `skyward-missing-${slugify(title)}-${period}-${date}` | `skyward-assign-${period}-${slugify(title)}-${date}` (unified prefix) |
| `assignment` (graded) | `skyward-assign-${period}-${slugify(title)}-${date}` | same (already composite + stable) |
| `gradeSnapshot` | `skyward-grade-${period}-${slugify(name)}` | `skyward-grade-${_cni}` when `_cni` present |

**`_cni`** is the Skyward section ID field already captured by the recipe (`sectionId.split('_')[1]`).
Transformers MUST use it when non-empty.

**Hardcoded LDISD term calendar**: the term definitions in `skyward-transformer.ts` are
district-specific. The recipe MUST be updated to extract the grading period header labels and
date ranges from the gradebook HTML. The transformer then receives the actual term definitions
in the extract rather than relying on a hardcoded constant. Until that recipe work is done the
hardcoded calendar remains acceptable for the LDISD deployment.

### 6.3 Aeries

| Entity | Current (wrong) | Required |
|--------|----------------|---------|
| `course` | `aeries-course-${studentId}-${arrayIndex}-${name}` | `aeries-course-${studentId}-${period}-${slugify(name)}` |
| `assignment` | `aeries-${courseExtId}-assignment-${arrayIndex}` | `aeries-assign-${studentId}-${period}-${a.number}` where `a.number` is the assignment number from the Aeries gradebook |
| `gradeSnapshot` | `aeries-grade-${courseExtId}` | `aeries-grade-${studentId}-${period}-${slugify(courseName)}` |
| `attendanceEvent` | `aeries-attendance-${studentId}-${arrayIndex}-${date}` | `aeries-attend-${studentId}-${parseDate(att.date)}-${att.period}` |

---

## 7. Extractor evaluate contract — single-arg rule

All extractor functions exposed via `driver.evaluate()` MUST accept at most one argument:

### Functions requiring update

| Extractor | Current signature | New signature |
|-----------|------------------|---------------|
| `extractSkywardCourseAssignments` | `(courseName: string, period: string)` | `(opts: { courseName: string; period: string })` |
| `extractAeriesCourseAssignments` | `(courseIndex: number, studentSelector: string)` | `(opts: { courseIndex: number; studentSelector: string })` |

All call sites in `skyward-recipe.ts` and `aeries-recipe.ts` MUST be updated to pass the single object.

---

## 8. Four-pictures gap fills (recipe completions)

The following data points are defined in `CLIENT_SCRAPER_SPEC.md` but not yet extracted:

### 8.1 Canvas

| Gap | Action |
|-----|--------|
| Announcement body | Add `message` field to `fetchCanvasAnnouncements` fetch; add `body?: string` to `ICanvasBrowserAnnouncement`; emit body in transformer |
| Canvas native term | `fetchCanvasCourses` already returns `term?: { id, name }` — use `term.id` for `termExternalId` where available; fall back to inferred semester |
| Events → `eventSeries` ops | `upcomingEvents` are extracted but not transformed. Emit as `scheduledEvent` ops keyed `canvas-event-${hash(title+date)}` |
| To-do items | Currently extracted but not transformed. Emit as `assignment` with `status: 'not_started'` keyed by `canvas-todo-${hash(title+course)}` |

### 8.2 Skyward

| Gap | Action |
|-----|--------|
| Teacher ops | Schedule entries carry `teacher` name — emit `teacher` ops keyed `skyward-teacher-${period}-${slugify(teacher)}` |
| Dynamic terms | Scrape visible grade period column headers from gradebook HTML; store in `ISkywardFullExtract.termDefs[]`; transformer uses these instead of hardcoded calendar |
| Attendance `courseExternalId` | Match attendance period to course period; emit `courseExternalId` on `attendanceEvent` |

### 8.3 Aeries

| Gap | Action |
|-----|--------|
| `academicTerm` ops | Extract term labels from the course term field (`IAeriesCourseExtract.term`); emit `academicTerm` ops |
| Teacher ops | `IAeriesCourseExtract` has `teacher` + `teacherEmail` — emit `teacher` ops keyed `aeries-teacher-${slugify(teacher)}` |
| Attendance `courseExternalId` | Match attendance `period` to `IAeriesCourseExtract.period`; emit `courseExternalId` |

---

## 9. Asset pipeline (`IAssetHost`)

Asset processing (download → S3 upload → URL rewrite) is CLI-only.
The interface MUST be defined in `scraper-core` so all clients can reference the type,
but implementations live outside of `scraper-core`.

```typescript
// scraper-core/src/pipeline/types.ts

export interface IAssetHost {
  /**
   * Given a list of ops that may contain local file paths or temporary URLs,
   * downloads assets, uploads to permanent storage, and rewrites the URLs in-place.
   * Returns the mutated ops array.
   * No-ops silently when the host is absent (mobile/extension).
   */
  processOps(ops: ISlcDeltaOp[]): Promise<ISlcDeltaOp[]>;
}
```

The CLI's `BaseScraper` asset pipeline becomes an `IAssetHost` implementation.
Mobile and extension omit `assets` from the host; `runClientScrape` skips the step.

---

## 10. API scraper module (`IApiScraperModule`)

Google Classroom and OneRoster do not require a browser. They authenticate via OAuth tokens
the device already holds (Google account session on mobile, stored token in the extension).

These providers MUST NOT be implemented as `IScraperModule` (which requires `IPageDriver`).
Instead they implement `IApiScraperModule`:

```typescript
// scraper-core/src/pipeline/types.ts

export interface IApiScraperModule {
  readonly metadata: IScraperManifest;
  /** No driver needed — performs REST calls directly. */
  scrape(config: IClientScrapeConfig): Promise<Record<string, unknown>>;
  transform(raw: Record<string, unknown>, ctx: ITransformContext): ISlcDeltaOp[];
}
```

`runClientScrape` detects `IApiScraperModule` by duck-typing (`'scrape' in module && fn.length === 1`)
and skips `host.driver` injection entirely.

Classroom implementation scope is deferred (see todo `later-assets-classroom`).

---

## 11. `IRunRecorder` contract (unchanged)

The existing `IRunRecorder` interface from mobile remains the spec for run-recording:

```typescript
interface IRunRecorder {
  startRun(params: IStartRunParams): Promise<void>;
  addPhase(runId: string, phase: IPhaseRecord): Promise<void>;
  completeRun(runId: string, result: IRunResult): Promise<void>;
}
```

Extension and CLI may pass `undefined` for `host.recorder`; `runClientScrape` skips all
recorder calls when it is absent.

---

## 12. Dependency topology

```
scraper-core       (no runtime deps — only @scholaracle/contracts)
  └─ IPageDriver, IClientScrapeHost, IAssetHost, IApiScraperModule
  └─ runClientScrape, builtin modules, validator

scraper-playwright (depends on scraper-core + playwright)
  └─ PlaywrightPageDriver, createPlaywrightDriver

scholaracle_scrapers (CLI; depends on scraper-core + scraper-playwright)
  └─ Platform scrapers: authenticate() → then calls runClientScrape
  └─ CliIngestUploader, CliAssetHost

packages/mobile (Expo; depends on scraper-core)
  └─ WebViewPageDriver, MobileIngestUploader
  └─ SyncOrchestrator: runSyncPipeline() calls runClientScrape

packages/browser-extension (Chrome MV3; depends on scraper-core)
  └─ ContentScriptPageDriver, ExtensionIngestUploader
  └─ content-script: runSync() calls runClientScrape
```

`scraper-playwright` MUST NOT be imported by `mobile` or `browser-extension`.

---

## 13. Migration checklist

- [x] Add `IClientScrapeHost`, `IIngestUploader`, `IAssetHost`, `IApiScraperModule` to `scraper-core/src/pipeline/types.ts`
- [x] Implement `runClientScrape` in `scraper-core/src/pipeline/runClientScrape.ts`
- [x] Export new symbols from `scraper-core/src/index.ts`
- [ ] Fix extractor single-arg rule (§7): `extractSkywardCourseAssignments`, `extractAeriesCourseAssignments`
- [x] Fix extension ingest URLs to use canonical three-step paths (§2.1) — `ExtensionIngestUploader` in `browser-extension/src/lib/ingest.ts`
- [x] Update `SyncOrchestrator.runSyncPipeline` to delegate to `runClientScrape` (§5.1)
- [x] Update `content-script.ts` to delegate to `runClientScrape` (§5.2)
- [x] Delete CLI transformer forks (`canvas-transformer.ts`, `skyward-transformer.ts`, `aeries-transformer.ts`); update test imports to `@scholaracle/scraper-core` (§5.3)
- [x] Delete CLI `validator.ts` fork; update all callers to import from `@scholaracle/scraper-core` (§5.3)
- [x] Add `IAIEnricher` + fail-open `JoinGapEnricher` in `runClientScrape` (always on; host enricher optional)
- [x] Server ingest `prepareIngestOps` behind `ENRICH_OPS_MODE` (`off` / `shadow` / `apply`; default `off`)
- [ ] Optional `IAssetHost` for CLI vs in-page base64; Classroom as `IApiScraperModule`
- [ ] Playwright driver consolidation deferred: version mismatch between CLI (`^1.48`) and monorepo (`^1.62`) — see §5.3.1
- [ ] Add `IApiScraperModule` type (§10) — implementation deferred
