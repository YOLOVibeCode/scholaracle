# Digest & Sync Scripts

TDD-compliant, ISP-segregated scripts for triggering student sync and sending digest emails.

## Scripts

### 1. `trigger-sync-and-digest.ts`

Triggers sync for all student data sources, waits for completion, then sends digest email to alert recipients.

**Usage:**
```bash
npx ts-node src/scripts/trigger-sync-and-digest.ts --studentId=<student-id>
```

**Options:**
- `--studentId=<id>` — (required) MongoDB student _id
- `--apiUrl=<url>` — API base URL (default: env `API_BASE_URL` or `BASE_URL` or `http://localhost:3000`)
- `--token=<bearer>` — Auth token for API (default: env `AUTH_TOKEN` or `API_TOKEN`)

**Environment variables:**
- `MONGODB_URI` — MongoDB connection string
- `MONGODB_DB_NAME` — Database name (default: `scholaracle`)
- `SENDGRID_API_KEY` — SendGrid API key (or use `SMTP_HOST` for SMTP)
- `SENDGRID_FROM_EMAIL` — From email address
- `SENDGRID_FROM_NAME` — From name
- `BASE_URL` — Dashboard base URL for digest links
- `ANTHROPIC_API_KEY` — (optional) For AI digest insights

**Example:**
```bash
export AUTH_TOKEN=your-jwt-token
export MONGODB_URI=mongodb://localhost:27017
export SENDGRID_API_KEY=your-sendgrid-key
npx ts-node src/scripts/trigger-sync-and-digest.ts --studentId=507f1f77bcf86cd799439011
```

**Flow:**
1. Triggers sync for all enabled data sources (Canvas, Skyward, etc.)
2. Polls every 15s for completion (max 15 minutes)
3. Resolves student alert recipients (owner + accepted contacts)
4. Sends digest email to each recipient (grouped by email)

---

### 2. `send-digest-now.ts`

Sends pending digest email immediately for specified users or student recipients.

**Usage:**
```bash
# By student ID (resolves owner + contacts)
npx ts-node src/scripts/send-digest-now.ts --studentId=<student-id>

# By explicit user IDs
npx ts-node src/scripts/send-digest-now.ts --userIds=id1,id2,id3
```

**Options:**
- `--studentId=<id>` — MongoDB student _id (resolves to owner + accepted contacts)
- `--userIds=<csv>` — Comma-separated user IDs

**Environment variables:** (same as above)

**Example:**
```bash
export MONGODB_URI=mongodb://localhost:27017
export SENDGRID_API_KEY=your-sendgrid-key
npx ts-node src/scripts/send-digest-now.ts --studentId=507f1f77bcf86cd799439011
```

---

## Architecture

Built with **TDD (M1)** and **ISP (M2)** mandates:

### Tested modules (`src/digest/`)

- **`digest-helpers.ts`** — Pure functions for holiday detection, slot matching, legacy digest time checks
- **`digest-sender.ts`** — `DigestSender` class implementing `IDigestSender` interface
- **`sync-client.ts`** — `SyncTrigger`, `SyncStatusPoller`, `StudentRecipientResolver` implementing ISP interfaces
- **`interfaces.ts`** — Small, focused interfaces per concern (ISP compliance)

### Tests

- `digest-helpers.test.ts` — 14 tests (holiday, slot, legacy flush logic)
- `digest-sender.test.ts` — 6 tests (send, group, filter, AI insight, comm log)
- `sync-client.test.ts` — 7 tests (trigger, poll, resolve recipients)

**All 27 tests pass** (plus 29 existing worker tests = 56 total).

### ISP Compliance

Each interface has a single responsibility:

```typescript
interface IDigestSender {
  sendDigestForUser(userId: string, itemFilter?: ...): Promise<void>;
}

interface ISyncTrigger {
  triggerAllForStudent(studentId: string): Promise<{ jobIds: string[] }>;
}

interface ISyncStatusPoller {
  getRuns(studentId: string, limit: number): Promise<...>;
}

interface IStudentRecipientResolver {
  resolveRecipients(studentId: string): Promise<string[]>;
}
```

---

## Development

```bash
# Build
npm run build

# Test (TDD)
npm test

# Run script (dev)
npx ts-node src/scripts/trigger-sync-and-digest.ts --help
```
