# Multi-Tenant Student ID Design

## Problem

**Before:** `Student.studentId` used raw external IDs like `"avery-sample"`, which could collide across:
- Different users with students of the same name
- Different institutions (two "avery-sample" students at different schools)
- Different data sources

This created a **critical security vulnerability** where User A could potentially access User B's student data if their external IDs collided.

## Solution: Composite Key Architecture

### Student Record Structure

```typescript
{
  userId: ObjectId,           // Owner of this student
  name: "Avery Sample",
  studentId: "exampleisd.instructure.com:avery-sample",  // Composite: "institution:student"
  dataSources: [
    {
      id: "canvas-avery-sample",
      provider: "canvas",
      pluginId: "canvas-browser",
      baseUrl: "https://exampleisd.instructure.com"
    }
  ]
}
```

### Composite Key Format

```
studentId = "${institutionExternalId}:${studentExternalId}"
```

**Examples:**
- `"exampleisd.instructure.com:avery-sample"` - Canvas at EXAMPLEISD
- `"skyward.exampleisd.edu:12345"` - Skyward SIS at EXAMPLEISD
- `"classroom.google.com:avery@school.edu"` - Google Classroom

**Backwards Compatibility:**
- If no institution is provided: `studentId = "avery-sample"` (legacy format)
- Queries parse the composite key and match accordingly

### Data Storage (slc_* collections)

Each ingested entity stores both fields separately:

```json
{
  "userId": "69a4f0c73671c632ca591c7c",
  "provider": "canvas",
  "adapterId": "canvas-browser",
  "studentExternalId": "avery-sample",
  "institutionExternalId": "exampleisd.instructure.com",
  "externalId": "canvas-12242-assignment-68",
  "record": { /* assignment data */ }
}
```

### Query Logic

When fetching student data:

```typescript
// Parse composite studentId
const parts = student.studentId.split(':', 2);
const studentExternalId = parts.length === 2 ? parts[1] : student.studentId;
const institutionExternalId = parts.length === 2 ? parts[0] : undefined;

// Query with proper scoping
const query = {
  userId: userId,  // ← User isolation (primary)
  $or: [
    { studentId: student._id },  // MongoDB _id fallback
    // Match composite key
    { studentExternalId, institutionExternalId },
    // Legacy: studentExternalId only (no institution)
    ...(institutionExternalId ? [] : [{ studentExternalId }])
  ]
};
```

## Security Guarantees

### 1. User Isolation
✅ All queries filter by `userId` first
✅ No cross-user data leakage possible

### 2. Institution Isolation
✅ Composite key prevents "avery-sample" at School A from matching "avery-sample" at School B
✅ Students from different institutions are distinct entities

### 3. Database Constraint
✅ Unique index: `{ userId: 1, studentId: 1 }` on `students` collection
✅ MongoDB enforces uniqueness at insert time

### 4. Source Tracking
✅ Each student has a `dataSources` array linking to their portals
✅ Data provenance is always traceable

## Migration Strategy

### Existing Data
- Legacy students with `studentId = "avery-sample"` continue to work
- Queries handle both formats (composite and simple)
- No data migration required

### New Data
- All new student auto-creation uses composite keys
- Scrapers provide `institutionExternalId` in every op
- System automatically builds `"institution:student"` format

## Edge Cases Handled

1. **No institution provided**: Falls back to simple `studentId`
2. **Multiple data sources per student**: `dataSources` array tracks all
3. **Same student at multiple schools**: Creates separate Student records (correct behavior)
4. **Institution domain changes**: Students tied to original institution ID

## Implementation Files

### Auto-Create Logic
- `packages/api/src/routes/ingest/v1/ingest.ts` - `autoCreateStudentsFromOps()`
  - Builds composite keys: `"${institutionExternalId}:${studentExternalId}"`
  - Creates Student records with proper scoping

### Query Logic
- `packages/api/src/routes/students/students.ts` - `/grades` endpoint
  - Parses composite `studentId`
  - Matches by `studentExternalId + institutionExternalId`

### Database Indexes
- `packages/database/src/indexes.ts`
  - `{ userId: 1, studentId: 1 }` unique index enforces uniqueness

## Testing Multi-Tenancy

### Scenario 1: Same student name, different users
```
User A: student "avery-sample" → studentId: "schoolA.com:avery-sample"
User B: student "avery-sample" → studentId: "schoolB.com:avery-sample"
Result: ✅ Two distinct Student records, no collision
```

### Scenario 2: Same institution, different students
```
User A: student "avery-sample" → studentId: "exampleisd.com:avery-sample"
User A: student "emma-smith" → studentId: "exampleisd.com:emma-smith"
Result: ✅ Two distinct Student records for same user
```

### Scenario 3: Cross-user query attempt
```
User A queries studentId "schoolB.com:avery-sample" (belongs to User B)
Query: { userId: UserA, studentId: "schoolB.com:avery-sample" }
Result: ✅ No match, no data leakage
```

## Conclusion

The composite key design ensures **multi-tenant safety** while maintaining backwards compatibility and supporting complex scenarios like:
- Students with multiple data sources
- Same student names across users/institutions  
- Institutional context preservation
- Data provenance tracking

All queries are **scoped by userId first**, making cross-user access impossible even with ID collisions.
