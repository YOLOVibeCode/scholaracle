# Scholaracle - Next Steps Implementation Plan

## Overview

This document provides a detailed implementation plan for the remaining features using **Test-Driven Development (TDD)** and **Interface Segregation Principle (ISP)**. Each feature is broken down into small, testable units with clear interfaces.

---

## Current State Analysis

### Completed
- ✅ Authentication (register, login, JWT)
- ✅ Student CRUD operations
- ✅ Dashboard with real data integration
- ✅ Frontend UI for all pages
- ✅ Notification system (agents, delivery, scheduling)

### Pending Backend Integration
- ⬜ Alerts API (fetch, acknowledge, mark read)
- ⬜ Settings API (user preferences)
- ⬜ User profile API (update profile)
- ⬜ Courses API (future)

---

## Implementation Priority

| Priority | Feature | Complexity | Dependencies |
|----------|---------|------------|--------------|
| 1 | Alerts Repository & Service | Medium | None |
| 2 | Alerts API Routes | Medium | Alerts Repository |
| 3 | User Settings Repository | Low | None |
| 4 | Settings API Routes | Low | User Settings Repository |
| 5 | User Profile Update | Low | User Repository |
| 6 | Courses/Grades API | High | Student Repository |

---

## 1. Alerts Repository & Service

### 1.1 Interface Definitions (ISP)

Create these interfaces in `packages/interfaces/src/`:

```typescript
// IAlertRepository.ts
export interface IAlertRepository {
  findByUserId(userId: string): Promise<readonly Alert[]>;
  findById(id: string): Promise<Alert | null>;
  create(alert: IAlertData): Promise<Alert>;
  acknowledge(id: string): Promise<boolean>;
  delete(id: string): Promise<boolean>;
}

// IAlertService.ts
export interface IAlertService {
  getAlertsForUser(userId: string): Promise<readonly Alert[]>;
  acknowledgeAlert(alertId: string, userId: string): Promise<boolean>;
  createAlert(data: ICreateAlertRequest): Promise<Alert>;
}
```

### 1.2 TDD Implementation Steps

#### Step 1: Write Alert Model Tests
```
packages/database/src/models/Alert/Alert.test.ts
```

**Test Cases:**
1. `should create alert with required fields`
2. `should set default values for optional fields`
3. `should set acknowledged to false by default`
4. `should set createdAt to current date`

#### Step 2: Implement Alert Model
```
packages/database/src/models/Alert/Alert.ts
```

#### Step 3: Write AlertRepository Tests
```
packages/database/src/repositories/AlertRepository/AlertRepository.test.ts
```

**Test Cases:**
1. `should create alert successfully`
2. `should find alerts by userId`
3. `should return empty array when no alerts exist`
4. `should find alert by id`
5. `should return null when alert not found`
6. `should acknowledge alert successfully`
7. `should return false when acknowledging non-existent alert`
8. `should delete alert successfully`

#### Step 4: Implement AlertRepository
```
packages/database/src/repositories/AlertRepository/AlertRepository.ts
```

### 1.3 Data Contracts

Add to `packages/contracts/src/`:

```typescript
// Alert.ts (enhance existing)
export interface IAlertData {
  readonly studentId: string;
  readonly userId: string;
  readonly type: AlertType;
  readonly severity: string;
  readonly message: string;
  readonly relatedData?: Record<string, unknown>;
  readonly acknowledged?: boolean;
  readonly acknowledgedAt?: Date;
  readonly createdAt?: Date;
}

export class Alert {
  public readonly _id?: ObjectId;
  public readonly studentId: string;
  public readonly userId: string;
  public readonly type: AlertType;
  public readonly severity: string;
  public readonly message: string;
  public readonly relatedData: Record<string, unknown>;
  public readonly acknowledged: boolean;
  public readonly acknowledgedAt?: Date;
  public readonly createdAt: Date;

  constructor(data: IAlertData, id?: ObjectId) {
    // Implementation
  }
}
```

---

## 2. Alerts API Routes

### 2.1 Interface Definitions (ISP)

```typescript
// IAlertRoutes.ts (in contracts or interfaces)
export interface IGetAlertsResponse {
  readonly success: boolean;
  readonly alerts: readonly IAlertDTO[];
}

export interface IAcknowledgeAlertResponse {
  readonly success: boolean;
  readonly message?: string;
}

export interface IAlertDTO {
  readonly id: string;
  readonly studentId: string;
  readonly type: string;
  readonly severity: string;
  readonly message: string;
  readonly acknowledged: boolean;
  readonly createdAt: string;
}
```

### 2.2 TDD Implementation Steps

#### Step 1: Write Route Tests
```
packages/api/src/routes/alerts/alerts.test.ts
```

**Test Cases:**
1. `GET /api/alerts - should return 401 without auth`
2. `GET /api/alerts - should return empty array when no alerts`
3. `GET /api/alerts - should return user's alerts`
4. `GET /api/alerts - should not return other user's alerts`
5. `POST /api/alerts/:id/acknowledge - should acknowledge alert`
6. `POST /api/alerts/:id/acknowledge - should return 404 for non-existent alert`
7. `POST /api/alerts/:id/acknowledge - should return 403 for other user's alert`

#### Step 2: Implement Routes

**Endpoint Specifications:**

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/alerts` | Required | Get all alerts for authenticated user |
| GET | `/api/alerts/:id` | Required | Get single alert by ID |
| POST | `/api/alerts/:id/acknowledge` | Required | Mark alert as acknowledged |
| DELETE | `/api/alerts/:id` | Required | Delete alert |

---

## 3. User Settings Repository

### 3.1 Interface Definitions (ISP)

```typescript
// IUserSettingsRepository.ts
export interface IUserSettingsRepository {
  getByUserId(userId: string): Promise<IUserSettings | null>;
  update(userId: string, settings: Partial<IUserSettings>): Promise<IUserSettings | null>;
}

// IUserSettings.ts
export interface IUserSettings {
  readonly userId: string;
  readonly notifications: INotificationSettings;
  readonly alerts: IAlertSettings;
  readonly preferences: IUserPreferences;
}

export interface INotificationSettings {
  readonly push: boolean;
  readonly email: boolean;
  readonly sms: boolean;
  readonly quietHours?: IQuietHours;
}

export interface IAlertSettings {
  readonly gradeDrop: number;
  readonly daysBeforeDeadline: number;
  readonly lowGradeThreshold: number;
}
```

### 3.2 TDD Implementation Steps

#### Step 1: Write Tests
```
packages/database/src/repositories/UserSettingsRepository/UserSettingsRepository.test.ts
```

**Test Cases:**
1. `should get settings by userId`
2. `should return null when settings not found`
3. `should update notification settings`
4. `should update alert thresholds`
5. `should merge partial updates`

#### Step 2: Implement Repository

**Note:** Settings are stored in the `users` collection as embedded document (preferences field).

---

## 4. Settings API Routes

### 4.1 TDD Implementation Steps

#### Step 1: Write Route Tests
```
packages/api/src/routes/settings/settings.test.ts
```

**Test Cases:**
1. `GET /api/settings - should return 401 without auth`
2. `GET /api/settings - should return user settings`
3. `GET /api/settings - should return defaults for new user`
4. `PUT /api/settings - should update notification preferences`
5. `PUT /api/settings - should update alert thresholds`
6. `PUT /api/settings - should validate threshold values`

#### Step 2: Implement Routes

**Endpoint Specifications:**

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/settings` | Required | Get user settings |
| PUT | `/api/settings` | Required | Update user settings |
| PUT | `/api/settings/notifications` | Required | Update notification preferences only |
| PUT | `/api/settings/alerts` | Required | Update alert thresholds only |

---

## 5. User Profile Update

### 5.1 Interface Definitions (ISP)

```typescript
// IUserProfileService.ts
export interface IUserProfileService {
  getProfile(userId: string): Promise<IUserProfile | null>;
  updateProfile(userId: string, data: IUpdateProfileRequest): Promise<IUserProfile | null>;
  changePassword(userId: string, oldPassword: string, newPassword: string): Promise<boolean>;
}

export interface IUpdateProfileRequest {
  readonly name?: string;
  readonly phone?: string;
}

export interface IUserProfile {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly phone?: string;
  readonly phoneVerified: boolean;
  readonly createdAt: Date;
}
```

### 5.2 TDD Implementation Steps

#### Step 1: Write Tests
```
packages/api/src/routes/profile/profile.test.ts
```

**Test Cases:**
1. `GET /api/profile - should return user profile`
2. `PUT /api/profile - should update name`
3. `PUT /api/profile - should update phone`
4. `PUT /api/profile - should not update email`
5. `POST /api/profile/password - should change password with valid old password`
6. `POST /api/profile/password - should reject with invalid old password`

---

## 6. Implementation Checklist

### Phase 1: Alerts (Priority 1-2)

```
[ ] packages/interfaces/src/IAlertRepository.ts
[ ] packages/interfaces/src/IAlertService.ts
[ ] packages/contracts/src/models/AlertData.ts
[ ] packages/database/src/models/Alert/Alert.test.ts
[ ] packages/database/src/models/Alert/Alert.ts
[ ] packages/database/src/models/Alert/index.ts
[ ] packages/database/src/repositories/AlertRepository/AlertRepository.test.ts
[ ] packages/database/src/repositories/AlertRepository/AlertRepository.ts
[ ] packages/database/src/repositories/AlertRepository/index.ts
[ ] packages/database/src/index.ts (export new modules)
[ ] packages/api/src/routes/alerts/alerts.test.ts (update existing)
[ ] packages/api/src/routes/alerts/alerts.ts (update existing)
```

### Phase 2: Settings (Priority 3-4)

```
[ ] packages/interfaces/src/IUserSettings.ts
[ ] packages/interfaces/src/ISettingsRepository.ts
[ ] packages/api/src/routes/settings/settings.test.ts
[ ] packages/api/src/routes/settings/settings.ts
[ ] packages/api/src/server.ts (add settings route)
```

### Phase 3: Profile (Priority 5)

```
[ ] packages/interfaces/src/IUserProfile.ts
[ ] packages/api/src/routes/profile/profile.test.ts
[ ] packages/api/src/routes/profile/profile.ts
[ ] packages/api/src/server.ts (add profile route)
```

---

## TDD Workflow Reminder

For each component, follow the **Red-Green-Refactor** cycle:

### 1. RED - Write Failing Test
```bash
# Run test (should fail)
pnpm --filter @scholaracle/database test AlertRepository
```

### 2. GREEN - Write Minimal Implementation
```bash
# Run test (should pass)
pnpm --filter @scholaracle/database test AlertRepository
```

### 3. REFACTOR - Improve Code
```bash
# Ensure tests still pass
pnpm --filter @scholaracle/database test AlertRepository

# Run linting
pnpm --filter @scholaracle/database lint

# Run type-check
pnpm --filter @scholaracle/database type-check
```

---

## ISP Guidelines

### Interface Design Rules

1. **Single Responsibility**: Each interface should have one clear purpose
2. **No Fat Interfaces**: Split large interfaces into smaller, focused ones
3. **Client-Specific**: Design interfaces based on what clients need
4. **No Unused Methods**: Clients should not depend on methods they don't use

### Example: Splitting Alert Interfaces

**BAD - Fat Interface:**
```typescript
interface IAlertManager {
  findAll(): Promise<Alert[]>;
  findById(id: string): Promise<Alert | null>;
  create(data: IAlertData): Promise<Alert>;
  update(id: string, data: Partial<IAlertData>): Promise<Alert | null>;
  delete(id: string): Promise<boolean>;
  acknowledge(id: string): Promise<boolean>;
  sendNotification(alert: Alert): Promise<void>;
  generateReport(): Promise<Report>;
}
```

**GOOD - Segregated Interfaces:**
```typescript
interface IAlertReader {
  findAll(): Promise<Alert[]>;
  findById(id: string): Promise<Alert | null>;
}

interface IAlertWriter {
  create(data: IAlertData): Promise<Alert>;
  update(id: string, data: Partial<IAlertData>): Promise<Alert | null>;
  delete(id: string): Promise<boolean>;
}

interface IAlertAcknowledger {
  acknowledge(id: string): Promise<boolean>;
}

// Repository composes what it needs
interface IAlertRepository extends IAlertReader, IAlertWriter, IAlertAcknowledger {}
```

---

## Testing Strategy

### Unit Tests
- Test each method in isolation
- Mock dependencies (database, external services)
- Focus on business logic

### Integration Tests
- Test full request/response cycle
- Use real database (test instance)
- Verify data persistence

### Test File Structure
```
src/
├── models/
│   └── Alert/
│       ├── Alert.ts
│       ├── Alert.test.ts      # Unit tests
│       └── index.ts
└── repositories/
    └── AlertRepository/
        ├── AlertRepository.ts
        ├── AlertRepository.test.ts      # Unit tests
        ├── AlertRepository.integration.test.ts  # Integration tests
        └── index.ts
```

---

## Commands Reference

```bash
# Run specific package tests
pnpm --filter @scholaracle/database test

# Run specific test file
pnpm --filter @scholaracle/database test AlertRepository

# Run with coverage
pnpm --filter @scholaracle/database test:coverage

# Run all tests
pnpm test

# Lint specific package
pnpm --filter @scholaracle/api lint

# Build specific package
pnpm --filter @scholaracle/api build

# Build all packages
pnpm build
```

---

## Success Criteria

Each feature is considered complete when:

1. ✅ All tests pass (unit + integration)
2. ✅ Test coverage ≥ 80%
3. ✅ Linting passes with no errors
4. ✅ TypeScript compiles with no errors
5. ✅ Interfaces are properly segregated
6. ✅ Documentation is updated
7. ✅ Frontend integration works

---

## Timeline Estimate

| Phase | Feature | Estimated Time |
|-------|---------|----------------|
| 1 | Alerts Repository & Model | 2-3 hours |
| 1 | Alerts API Routes | 2-3 hours |
| 2 | Settings Repository | 1-2 hours |
| 2 | Settings API Routes | 1-2 hours |
| 3 | User Profile API | 1-2 hours |
| 4 | Frontend Integration | 1-2 hours |
| - | Testing & Refinement | 2-3 hours |

**Total: ~12-17 hours**

---

## Next Actions

1. **Start with Phase 1**: Alerts Repository
2. **Create interface files first** (ISP)
3. **Write tests before implementation** (TDD)
4. **Commit after each green test**
5. **Document as you go**

Ready to begin implementation? Start with:
```bash
cd /Users/admin/Dev/YOLOProjects/scholarmancy/scholaracle
# Create interfaces first
touch packages/interfaces/src/IAlertRepository.ts
```

