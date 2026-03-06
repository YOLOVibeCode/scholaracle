# Grade Precedence & Data Source Hierarchy

## Overview

Scholaracle aggregates academic data from multiple sources per student. When data conflicts (e.g., different grade values for the same course), the system follows a strict **source hierarchy** to determine which value is authoritative.

---

## Source Hierarchy

### Tier 1: Student Information Systems (SIS) — **Authoritative**

- **Skyward** (priority: 10)
- **Aeries** (priority: 10)

**Rationale**: SIS systems contain the official grades of record that appear on report cards and transcripts. These are the "truth" from the school district's perspective.

### Tier 2: Learning Management Systems (LMS) — **Working Grades**

- **Canvas** (priority: 5)
- **Google Classroom** (priority: 5)
- **OneRoster** (priority: 5)

**Rationale**: LMS systems show current/projected grades based on assignments. These may include extra credit, dropped assignments, or weighting schemes that differ from the official SIS calculation.

---

## Implementation

### Course Reconciliation (`course-reconciler.ts`)

When merging courses from multiple sources:

1. **Match courses** by normalized title, subject, teacher, and period
2. **Select primary source** using this logic:
   - Sort sources by priority (SIS > LMS)
   - Within the same priority tier, prefer sources with grade data
   - If grades are equal priority, use highest grade as tiebreaker
3. **Use primary source's grade** as `bestGrade` and `bestLetterGrade`
4. **Set `primarySourceId`** to identify which source is authoritative

```typescript
const SOURCE_PRIORITY: Record<string, number> = {
  skyward: 10,
  aeries: 10,
  canvas: 5,
  google_classroom: 5,
  oneroster: 5,
};
```

### Example: Skyward vs Canvas Conflict

```
Student: Ava Lewis
Course: English 1 (Period 4)

Canvas Grade:  85.84%  (projected from assignments, includes extra credit)
Skyward Grade: 76%     (official grade from SIS)

Result: bestGrade = 76 (Skyward takes precedence)
```

### Period Normalization

The reconciliation engine normalizes period formats to match courses across systems:

- `"p04"` (Canvas) ↔ `"4"` (Skyward)
- `"p05"` ↔ `"5C"`
- Ignores case and leading zeros

---

## Viewing Source Data

### API Endpoints

- **`GET /api/students/:id/grades`**: Returns per-course grades with merged course IDs
- **`GET /api/students/:id/grade-history`**: Returns time-series grade snapshots per source
- **`GET /api/students/:id`**: Includes `dataSources` array showing which systems are connected

### Web UI

The grade detail view shows:

- **Primary grade** (from authoritative source, bold)
- **Source indicators** (badges: "SIS", "LMS")
- **Comparison tooltip** (hover to see grades from all sources)

---

## Data Sync Notes

1. **Sync Frequency**: SIS scrapers run less frequently (daily) than LMS scrapers (hourly) due to rate limits and data update patterns.
2. **Historical Data**: Grade snapshots from all sources are preserved for trending/history analysis.
3. **Alert Thresholds**: Alerts (e.g., grade drops) only trigger on changes to the **primary source** to avoid false alarms from LMS recalculations.

---

## Testing

See `course-reconciler.test.ts` for comprehensive test coverage:

- ✅ `should prioritize Skyward (SIS) grade over Canvas (LMS) even when Canvas grade is higher`
- ✅ `should use Skyward grade when it is higher than Canvas`
- ✅ `should merge courses with normalized periods (p04 ↔ 4)`

---

## Future Enhancements

- [ ] Add user preference to override source priority (e.g., "Always show Canvas grade")
- [ ] Display grade deltas in UI: `76% (SIS) vs 85.84% (LMS)`
- [ ] Flag large discrepancies (>10%) for review
- [ ] Support custom weighting schemes in reconciliation
