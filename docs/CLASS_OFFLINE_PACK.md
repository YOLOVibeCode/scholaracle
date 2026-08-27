# Class-scoped Offline Work Pack

> Version 1.0 — 2026-08-26
>
> Authoritative contract for class-scoped offline work on the iPad studio.
> Cross-reference: [`CLIENT_SCRAPER_SPEC.md`](./CLIENT_SCRAPER_SPEC.md) for envelope shape,
> [`CLIENT_PIPELINE_SPEC.md`](./CLIENT_PIPELINE_SPEC.md) for the IAssetHost pipeline,
> [`DATA_EXTRACTION_CHECKLIST.md`](./DATA_EXTRACTION_CHECKLIST.md) §7 for per-field extraction rules.

---

## 1. Goal

After **one online scrape by the parent**, Emma can disconnect from school Wi-Fi and the public
internet and still do **that class**: instructions, hosted PDFs / images / video, and any link
the scraper captured as bytes or readable text.

```
School portal  --parent scrape-->  Scholaracle asset store
               --IAssetHost-->     record.url = server asset URL
                                       ↓
iPad (online once) --GET /api/studio/courses/:id/offline-pack-->
    IndexedDB (pack JSON)   +   IAssetCache / Cache Storage (bytes)
                                       ↓
iPad (airplane mode) --reads IndexedDB + Cache Storage-->
    Student opens worksheet → in-page PDF from local bytes, no network
```

This is **two separate jobs**. Today the specs only describe the second half of the second job
(cache the bytes of a single PDF the student already opened). This document specifies the full
path.

---

## 2. What is guaranteed offline vs what is not

| Item | Offline guarantee | How |
|------|-------------------|-----|
| Assignment title, due date, status | Yes | IndexedDB pack JSON |
| Assignment instructions text | Yes | `instructionsText` in pack JSON |
| Hosted PDF / image / video | Yes | IAssetCache bytes, keyed by `assetId:contentHash` |
| Grabbed text from a public link | Yes | `extractedText` in pack JSON |
| `needsSchoolLogin` links (authenticated LMS pages) | No — honest notice | Student sees "Needs school login"; not blank |
| Brand new parent sync since save | Stale notice | `contentHash` mismatch → `stale: true` |
| First visit to `/studio` | No | SSR needs network; offline is a local pack loaded after first visit |

---

## 3. Resource capture order (scraper intelligence — MUST)

For every resource the portal surfaces, the scraper MUST decide in this order.
Do not skip to "leave a school-login link" if an earlier step can succeed.

### Step 1: Native file (rehost)

Portal-native downloadable file: Canvas `/files/{id}/download`, assignment attachment,
Google Drive file export to PDF.

- `type`: `document` | `presentation` | `video` | `handout` | `rubric` | `study_guide`
- `IAssetHost.processOps()` fetches with the parent session and rewrites `record.url` to the
  permanent Scholaracle asset URL.
- MUST set `fileName` (include extension) and `mimeType`.
- Never use a viewer page URL as `record.url`; use the actual download endpoint.

### Step 2: Link that is actually a file (rehost)

A `type: link` whose `Content-Type` response header is `application/pdf`, `image/*`,
`video/*`, or any other directly embeddable binary. Probe with a HEAD request (use portal
cookies if portal-origin, otherwise no cookies). If the Content-Type qualifies, treat exactly
as Step 1: set `type: document` (or `video`), set `fileName` from the URL path or
`Content-Disposition`, set `mimeType`, and rehost.

Size gate: skip files larger than the configured `assetSizeLimit` (default 100 MB).

### Step 3: Grab-enough HTML (extractedText only)

A public (or session-visible) page that is not a binary file.

- Keep `type: link`, set `linkAccessibility`.
- Populate `extractedText` with the readable text content of the page (size-capped to 50 KB;
  strip navigation, scripts, and style elements).
- Do NOT attempt to archive full interactive SPAs (Khan Academy, Desmos, interactive labs).

### Step 4: Cannot capture

Authenticated HTML viewer with no file export, or an SPA that requires an active session to
render meaningful content.

- Set `linkAccessibility: 'authenticated'`.
- Studio puts the item in `needsSchoolLogin` — an honest notice, not silence.

### Fail-open

One file miss MUST NOT fail the sync. Log the error, skip the file, continue.

A validator warning fires when an LMS course has `type: document` materials with an empty
`fileName` or an empty `mimeType`, or when portal-origin URLs remain in `record.url` after
`IAssetHost` ran (indicates the rehost step silently no-oped on a file it should have caught).

---

## 4. IAssetHost is REQUIRED for LMS clients

`IClientScrapeHost.assets` is **MUST** when `provider` is `canvas`, `google-classroom`,
or any LMS adapter that emits `courseMaterial` ops with `type: document | video | presentation`.

`--skip-assets` (CLI) is a debug flag only and MUST NOT be used in production runs.

Mobile: `WebViewAssetHost` MUST process both `courseMaterial` ops and `assignment.attachments`
URLs. The current implementation skips `attachments`; this is a known gap (see §8).

---

## 5. Offline class pack — server API

```
GET /api/studio/courses/:courseExternalId/offline-pack
Authorization: Bearer <student JWT>
```

Returns a single JSON document containing everything the client needs to render all current-term
assignments in that course while offline, and to pre-fetch all asset bytes.

### Request rules

- Same IDOR gates as other studio routes: the student's JWT `studentId` must own the course.
- `courseExternalId` is the raw LMS id (e.g. `canvas-course-123`), not a merged hash.
- Rate-limited: same as other studio routes.

### Response shape (`IOfflinePackResponse`)

```typescript
interface IOfflinePackResponse {
  /** The raw LMS course external ID. */
  readonly courseExternalId: string;
  /** Human-readable course name. */
  readonly courseName: string;
  /** ISO timestamp of when this pack was assembled. Server time. */
  readonly assembledAt: string;
  /** All current-term work packs for this course. */
  readonly packs: readonly IWorkPackView[];
  /**
   * Deduplicated list of all assets appearing in packs and moreFromCourse.
   * The client uses this to pre-fetch bytes into IAssetCache before going offline.
   */
  readonly assets: readonly IOfflineAssetRef[];
}

interface IOfflineAssetRef {
  readonly assetId: string;
  readonly contentHash: string;
  readonly fileName: string;
  readonly mimeType?: string;
  readonly downloadUrl: string; // 24h signed ticket — never cache this URL
}
```

The server signs a fresh `downloadUrl` for each asset at response time (same mechanism as
the existing asset-serve route).

---

## 6. Offline class pack — client contract (`ICourseOfflinePack`)

```typescript
// packages/studio-core / packages/interfaces

export interface ICourseOfflinePack {
  /**
   * Download all packs and asset bytes for the given course.
   * Runs only while online.
   * @param courseExternalId raw LMS course id
   * @param apiBase base URL for the offline-pack API
   * @param studentToken JWT for the student session
   */
  save(courseExternalId: string, apiBase: string, studentToken: string): Promise<void>;

  /**
   * Load packs from local storage.
   * Works offline. Returns null if the course was never saved.
   */
  load(courseExternalId: string): Promise<ISavedCoursePack | null>;

  /**
   * True if the client has a saved pack for this course.
   */
  isSaved(courseExternalId: string): Promise<boolean>;

  /**
   * Remove all local data for this course.
   */
  evict(courseExternalId: string): Promise<void>;
}

export interface ISavedCoursePack {
  readonly courseExternalId: string;
  readonly courseName: string;
  readonly savedAt: string; // client clock ISO
  /**
   * Whether any asset's contentHash has changed since the last parent sync
   * (stale = true when a pack's primaryAsset.contentHash no longer matches
   * what the client cached — detected at open time).
   */
  readonly stale: boolean;
  readonly packs: readonly IWorkPackView[];
}
```

### Save algorithm

1. `POST` / `GET` `/api/studio/courses/:courseExternalId/offline-pack` with the student JWT.
2. Persist the JSON response (without `downloadUrl` fields) to IndexedDB keyed by
   `courseExternalId`.
3. For each `IOfflineAssetRef` in the response: call `IAssetCache.open({ assetId, contentHash,
   downloadUrl })`. The cache stores bytes under `assetId:contentHash`. The signed URL is used
   once and then discarded.
4. Record `savedAt` (client clock) in IndexedDB.

### Open algorithm (airplane mode)

1. Read `ISavedCoursePack` from IndexedDB.
2. Render Today / pack from local JSON (no `/api/studio` call).
3. When student taps Open: call `IAssetCache.open({ assetId, contentHash, downloadUrl: '' })`.
   - `downloadUrl` is omitted because the pack JSON strips it before IndexedDB storage.
   - `AssetCache` handles `downloadUrl == null || ''` → return cached bytes (`fromCache: true,
     stale: false`) per existing behavior.
4. If no cached bytes → display "Reconnect to load this file." Never show a signed URL that
   has already expired.

### Stale detection

At `open()` time, if `ICachedAsset.stale === true || requestedHashMissing === true`, show
"May be outdated — reconnect to refresh." The student can still read the stale PDF.

---

## 7. Web studio UX

### "Save for offline" control

- A **Save Algebra II for offline** button (or equivalent icon) on the Today page and on
  every work-pack page for that course.
- State: Not saved | Saving… | Saved (date) | Stale.
- Stale: shown when the latest `contentHash` from the server differs from what was cached.
- Storage backend: `CacheStorageAssetCacheStore` (already exists) for bytes;
  `IndexedDB` for pack JSON.

### Offline read path

If `ICourseOfflinePack.load()` returns a saved pack, studio MUST render from local data
without hitting `/api/studio`. Airplane mode and stale server responses both work.

First visit to `/studio` still requires network (Next.js SSR shell). After the shell loads,
subsequent navigations within the studio can use the local pack.

No service worker is required for v1. The local-pack client reader is sufficient.

---

## 8. Known gaps (address in follow-up)

| Gap | Impact | Tracker |
|-----|--------|---------|
| `WebViewAssetHost` skips `assignment.attachments[]` URLs | Attachment PDFs are not rehosted for mobile | later-assets-mobile-attachments |
| Google Classroom not extracted on iOS | Classroom materials unavailable | later-classroom-ios |
| Interactive SPAs (Khan, Desmos) not captured | Student needs network for those links | by-design — `needsSchoolLogin` |
| Native phone file persistence (`expo-file-system`) | Phone app uses session cache; loses bytes on restart | later-phone-persist |
| Service worker for `/studio` shell | First offline visit fails | later-sw |
| LRU eviction on `CacheStorageAssetCacheStore` | Cache Storage can grow unbounded | later-lru |

---

## 9. Test requirements

- Unit: `ICourseOfflinePack` fake implementation — save → offline open with no `downloadUrl`
  → returns bytes; new hash detected as stale.
- Unit: resource classifier — `rehost | extractText | leaveLink` for each resource type and
  content-type combination.
- API: `GET /api/studio/courses/:courseExternalId/offline-pack` with IDOR tests (Emma cannot
  fetch Liam's course; wrong student → 403/404; signed URLs freshly generated each time).
- E2E: Playwright `@studio` project — save Algebra II, `context.setOffline(true)`, open
  worksheet PDF from Cache Storage (blob URL in viewer), verify `data-from-cache="true"`.
