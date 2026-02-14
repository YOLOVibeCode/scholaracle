# Seed Endpoint Usage Guide

**⚠️ PORT POLICY: API uses FIXED port 2801. DO NOT change this port.**

## Overview

The seed endpoint (`POST /api/seed`) scaffolds all test data needed for E2E tests, including:
- All test users (parent + 5 admin roles)
- Test students for the parent user
- Test alerts

## Endpoint

```
POST /api/seed
```

## Query Parameters

- `force=true` (optional): Delete and recreate existing users/data

## Security

⚠️ **IMPORTANT**: This endpoint is **disabled in production**. It only works in `development` or `test` environments.

## Usage

### Basic Seeding (Skip if exists)

```bash
curl -X POST http://localhost:2801/api/seed
```

### Force Recreate (Delete and recreate)

```bash
curl -X POST "http://localhost:2801/api/seed?force=true"
```

**Note:** Port 2801 is FIXED for the API server. Do not change it.

### Using fetch (JavaScript)

```javascript
// Basic seeding (using FIXED port 2801)
const response = await fetch('http://localhost:2801/api/seed', {
  method: 'POST',
});

const result = await response.json();
console.log(result);

// Force recreate (using FIXED port 2801)
const forceResponse = await fetch('http://localhost:2801/api/seed?force=true', {
  method: 'POST',
});

const forceResult = await forceResponse.json();
console.log(forceResult);
```

## Response Format

```json
{
  "success": true,
  "message": "Seeding completed",
  "results": {
    "users": {
      "created": ["Parent: test.parent@example.com"],
      "existing": [],
      "errors": []
    },
    "admins": {
      "created": [
        "Super Admin: super@scholarmancy.com",
        "admin: admin@scholarmancy.com",
        "support: support@scholarmancy.com",
        "billing: billing@scholarmancy.com",
        "analyst: analyst@scholarmancy.com"
      ],
      "existing": [],
      "errors": []
    },
    "students": {
      "created": [
        "Student: Student One (507f1f77bcf86cd799439011)",
        "Student: Student Two (507f1f77bcf86cd799439012)"
      ],
      "errors": []
    },
    "alerts": {
      "created": [
        "Alert: MISSING_ASSIGNMENT (507f1f77bcf86cd799439013)",
        "Alert: GRADE_DROP (507f1f77bcf86cd799439014)"
      ],
      "errors": []
    }
  },
  "totals": {
    "usersCreated": 1,
    "usersExisting": 0,
    "usersErrors": 0,
    "adminsCreated": 5,
    "adminsExisting": 0,
    "adminsErrors": 0,
    "studentsCreated": 2,
    "studentsErrors": 0,
    "alertsCreated": 2,
    "alertsErrors": 0
  }
}
```

## Test Users Created

### Parent User
- **Email**: `test.parent@example.com`
- **Password**: `TestPass123!`
- **Name**: `Test Parent`

### Admin Users

| Role | Email | Password | Name |
|------|-------|----------|------|
| super_admin | `super@scholarmancy.com` | `SuperAdmin123!` | Super Admin |
| admin | `admin@scholarmancy.com` | `Admin123!` | Admin User |
| support | `support@scholarmancy.com` | `Support123!` | Support User |
| billing | `billing@scholarmancy.com` | `Billing123!` | Billing User |
| analyst | `analyst@scholarmancy.com` | `Analyst123!` | Analyst User |

## Test Data Created

### Students (for parent user)
1. **Student One**
   - Grade: 9
   - Student ID: STU001

2. **Student Two**
   - Grade: 11
   - Student ID: STU002

### Alerts (for first student)
1. **Missing Assignment** (Warning)
   - Type: `MISSING_ASSIGNMENT`
   - Message: "Math homework due tomorrow"
   - Due date: Tomorrow

2. **Grade Drop** (Critical)
   - Type: `GRADE_DROP`
   - Message: "Science grade dropped 10%"
   - Previous grade: 90%
   - Current grade: 80%

## Integration with E2E Tests

The seed endpoint should be called before running E2E tests:

```bash
# In your E2E test setup or CI/CD pipeline (using FIXED port 2801)
curl -X POST http://localhost:2801/api/seed?force=true

# Then run tests
pnpm --filter @scholaracle/e2e test
```

Or in Playwright setup:

```typescript
// playwright.config.ts or test setup (using FIXED port 2801)
test.beforeAll(async () => {
  await fetch('http://localhost:2801/api/seed?force=true', {
    method: 'POST',
  });
});
```

**Note:** Port 2801 is FIXED for the API server. See [PORT_POLICY.md](../PORT_POLICY.md) for details.

## Error Handling

If seeding fails, the response will include error details:

```json
{
  "success": false,
  "error": "Error message here"
}
```

Or partial success with errors:

```json
{
  "success": true,
  "results": {
    "users": {
      "created": [],
      "existing": [],
      "errors": ["Parent: User already exists"]
    }
  }
}
```

## Notes

- The endpoint is idempotent - you can call it multiple times safely
- Use `force=true` to reset test data between test runs
- All passwords match the test data in `packages/e2e/fixtures/test-data.ts`
- The endpoint creates a super_admin first, then uses it to create other admin users
