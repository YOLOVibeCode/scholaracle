# Implementation Quick Reference Card (ARCHIVED)

**Status:** ⚠️ **Archived / historical**. This “build plan” was used earlier during phased implementation.

**Use instead:**
- `APP_SPECIFICATION.md` (what the app must do in v1)
- `RUN_ALL_TESTS.md` (how to validate the UX end-to-end)
- `SPECIFICATION_COVERAGE.md` (what is tested)

## TDD Cycle

```
┌─────────────────────────────────────────────────────────────┐
│                    RED → GREEN → REFACTOR                    │
├─────────────────────────────────────────────────────────────┤
│  1. RED    │ Write failing test                             │
│  2. GREEN  │ Write minimal code to pass                     │
│  3. REFACTOR │ Improve without changing behavior            │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Alerts

### Files to Create

| Order | File | Type |
|-------|------|------|
| 1 | `packages/interfaces/src/IAlertRepository.ts` | Interface |
| 2 | `packages/database/src/models/Alert/Alert.test.ts` | Test |
| 3 | `packages/database/src/models/Alert/Alert.ts` | Model |
| 4 | `packages/database/src/repositories/AlertRepository/AlertRepository.test.ts` | Test |
| 5 | `packages/database/src/repositories/AlertRepository/AlertRepository.ts` | Repository |
| 6 | `packages/api/src/routes/alerts/alerts.test.ts` | Test |
| 7 | `packages/api/src/routes/alerts/alerts.ts` | Routes (update) |

### Interface: IAlertRepository

```typescript
import type { ObjectId } from 'mongodb';

export interface IAlertData {
  readonly studentId: string;
  readonly userId: string;
  readonly type: string;
  readonly severity: string;
  readonly message: string;
  readonly relatedData?: Record<string, unknown>;
  readonly acknowledged?: boolean;
  readonly createdAt?: Date;
}

export interface IAlertRepository {
  findByUserId(userId: string): Promise<readonly IAlertData[]>;
  findById(id: string | ObjectId): Promise<IAlertData | null>;
  create(alert: IAlertData): Promise<IAlertData>;
  acknowledge(id: string | ObjectId): Promise<boolean>;
  delete(id: string | ObjectId): Promise<boolean>;
}
```

### Test Template: Alert Model

```typescript
import { Alert } from './Alert';

describe('Alert', () => {
  describe('constructor', () => {
    it('should create alert with required fields', () => {
      const data = {
        studentId: 'student-123',
        userId: 'user-123',
        type: 'MISSING_ASSIGNMENT',
        severity: 'warning',
        message: 'Assignment is missing',
      };

      const alert = new Alert(data);

      expect(alert.studentId).toBe('student-123');
      expect(alert.userId).toBe('user-123');
      expect(alert.type).toBe('MISSING_ASSIGNMENT');
      expect(alert.severity).toBe('warning');
      expect(alert.message).toBe('Assignment is missing');
    });

    it('should set acknowledged to false by default', () => {
      const data = {
        studentId: 'student-123',
        userId: 'user-123',
        type: 'MISSING_ASSIGNMENT',
        severity: 'warning',
        message: 'Test',
      };

      const alert = new Alert(data);

      expect(alert.acknowledged).toBe(false);
    });

    it('should set createdAt to current date', () => {
      const before = new Date();
      const data = {
        studentId: 'student-123',
        userId: 'user-123',
        type: 'MISSING_ASSIGNMENT',
        severity: 'warning',
        message: 'Test',
      };

      const alert = new Alert(data);
      const after = new Date();

      expect(alert.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(alert.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });
});
```

### API Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/alerts` | List user's alerts |
| GET | `/api/alerts/:id` | Get single alert |
| POST | `/api/alerts/:id/acknowledge` | Mark acknowledged |
| DELETE | `/api/alerts/:id` | Delete alert |

---

## Phase 2: Settings

### Files to Create

| Order | File | Type |
|-------|------|------|
| 1 | `packages/interfaces/src/IUserSettings.ts` | Interface |
| 2 | `packages/api/src/routes/settings/settings.test.ts` | Test |
| 3 | `packages/api/src/routes/settings/settings.ts` | Routes |

### Interface: IUserSettings

```typescript
export interface INotificationSettings {
  readonly push: boolean;
  readonly email: boolean;
  readonly sms: boolean;
  readonly quietHours?: {
    readonly enabled: boolean;
    readonly start: string;
    readonly end: string;
  };
}

export interface IAlertThresholds {
  readonly gradeDrop: number;
  readonly daysBeforeDeadline: number;
  readonly lowGradeThreshold: number;
}

export interface IUserSettings {
  readonly notifications: INotificationSettings;
  readonly alerts: IAlertThresholds;
}
```

### API Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/settings` | Get user settings |
| PUT | `/api/settings` | Update all settings |
| PUT | `/api/settings/notifications` | Update notifications only |
| PUT | `/api/settings/alerts` | Update alert thresholds only |

---

## Phase 3: Profile

### Files to Create

| Order | File | Type |
|-------|------|------|
| 1 | `packages/interfaces/src/IUserProfile.ts` | Interface |
| 2 | `packages/api/src/routes/profile/profile.test.ts` | Test |
| 3 | `packages/api/src/routes/profile/profile.ts` | Routes |

### API Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/profile` | Get user profile |
| PUT | `/api/profile` | Update profile |
| POST | `/api/profile/password` | Change password |

---

## ISP Checklist

Before implementing any interface, verify:

- [ ] Single responsibility (one clear purpose)
- [ ] No unused methods for consumers
- [ ] Can be composed when needed
- [ ] Named descriptively (`IAlertReader` not `IAlertStuff`)
- [ ] Documented with JSDoc comments

---

## Commands

```bash
# Create file
touch packages/database/src/models/Alert/Alert.test.ts

# Run specific test
pnpm --filter @scholaracle/database test Alert

# Run with watch mode
pnpm --filter @scholaracle/database test -- --watch Alert

# Coverage
pnpm --filter @scholaracle/database test:coverage

# Lint
pnpm --filter @scholaracle/database lint

# Build
pnpm --filter @scholaracle/database build
```

---

## Commit Message Format

```
type(scope): description

feat(alerts): add AlertRepository with TDD
test(alerts): add AlertRepository unit tests
fix(api): fix alert acknowledge endpoint
refactor(database): extract alert query logic
```

---

## Success Checklist

For each feature:

- [ ] Interface defined (ISP compliant)
- [ ] Tests written first (RED)
- [ ] Implementation passes tests (GREEN)
- [ ] Code refactored (REFACTOR)
- [ ] Linting passes
- [ ] Type-check passes
- [ ] Coverage ≥ 80%
- [ ] Exports added to index.ts
- [ ] Documentation updated

