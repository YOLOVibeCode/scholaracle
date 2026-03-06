# Assignment Reconciliation Strategy — Canvas ↔ Skyward

**Date**: March 5, 2026  
**Goal**: Match missing assignments from Canvas/Google Classroom with Skyward grades to filter out completed work

---

## 📊 Current Situation

### Data Available

| Source | Assignments | Courses | Missing |
|--------|-------------|---------|---------|
| **Canvas/Google** | 405 | 8 | 75 (all no due date) |
| **Skyward** | 3 | 10 | 3 |

### Course Matching Analysis

✅ **Strong Matches Found** (Course-level reconciliation already working):

| Canvas Course | Skyward Course | Match Quality |
|---------------|----------------|---------------|
| `algebra🔢` | `ALGEBRA 1` | ✅ EXACT |
| `art🎨` | `ART 1` | ✅ EXACT |
| `biology🧬` | `BIOLOGY` | ✅ EXACT |
| `english📝` | `ENGLISH 1` | ✅ EXACT |
| `journalism📰` | `JOURNALISM` | ✅ EXACT |
| `spanish🇪🇸` | `SPANISH 1` | ✅ EXACT |
| `world geography🗺️` | `WORLD GEOGRAPHY - POI` | ✅ EXACT |
| `principles of agriculture🐄` | `PRINCIPLES AG FOOD & NAT RES` | ✅ EXACT |

**Coverage**: 8/8 Canvas courses have Skyward matches (100%)

---

## 🎯 Reconciliation Strategy

### Phase 1: Course-Level Reconciliation (DONE)

✅ Already implemented in [`packages/connector/src/reconciliation/course-reconciler.ts`](/Users/admin/Dev/YOLOProjects/scholarmancy/scholaracle/packages/connector/src/reconciliation/course-reconciler.ts)

**How it works**:
1. Normalizes course titles using `reconcileCourse()` from `subject-reconciler.ts`
2. Groups by `normalizedTitle | subject.area | subject.subArea`
3. Splits by period/teacher when both differ
4. Generates a `mergedId` for each unified course group

**Example**:
```typescript
// Canvas: "algebra🔢" 
// Skyward: "ALGEBRA 1"
// Both normalize to: "Algebra" | "math" | "algebra"
// Merged ID: hashKey("algebra|math|algebra") = "a7b3c9d2e4f1"
```

### Phase 2: Assignment-Level Reconciliation (TODO)

**Challenge**: Assignments have different IDs and titles across platforms:
- Canvas: "M2 T1 Test Review" (canvas-12242-assignment-20)
- Skyward: "Quadratic Attributes Worksheet" (skyward-missing-1)

**Matching Strategies** (in order of reliability):

#### Strategy 1: Exact Title Match (High Confidence)
```typescript
function exactTitleMatch(
  canvasAssignment: ISlcAssignment,
  skywardAssignments: ISlcAssignment[]
): ISlcAssignment | null {
  const normalizedCanvas = normalizeAssignmentTitle(canvasAssignment.record.title);
  
  for (const skyward of skywardAssignments) {
    const normalizedSkyward = normalizeAssignmentTitle(skyward.record.title);
    if (normalizedCanvas === normalizedSkyward) {
      return skyward;
    }
  }
  return null;
}

function normalizeAssignmentTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
```

#### Strategy 2: Fuzzy Title Match (Medium Confidence)
```typescript
function fuzzyTitleMatch(
  canvasAssignment: ISlcAssignment,
  skywardAssignments: ISlcAssignment[],
  threshold = 0.7
): Array<{ assignment: ISlcAssignment; similarity: number }> {
  const matches: Array<{ assignment: ISlcAssignment; similarity: number }> = [];
  
  for (const skyward of skywardAssignments) {
    const similarity = titleSimilarity(
      canvasAssignment.record.title,
      skyward.record.title
    );
    
    if (similarity >= threshold) {
      matches.push({ assignment: skyward, similarity });
    }
  }
  
  // Sort by similarity descending
  return matches.sort((a, b) => b.similarity - a.similarity);
}
```

#### Strategy 3: Due Date + Course Match (Medium Confidence)
```typescript
function dueDateCourseMatch(
  canvasAssignment: ISlcAssignment,
  skywardAssignments: ISlcAssignment[],
  mergedCourseId: string,
  dateThresholdDays = 3
): ISlcAssignment | null {
  if (!canvasAssignment.record.dueDate) return null;
  
  const canvasDue = new Date(canvasAssignment.record.dueDate);
  
  for (const skyward of skywardAssignments) {
    // Same course
    if (skyward.courseExternalId !== getMergedCourseId(skyward)) continue;
    
    // Similar due date
    if (skyward.record.dueDate) {
      const skywardDue = new Date(skyward.record.dueDate);
      const diffDays = Math.abs(canvasDue.getTime() - skywardDue.getTime()) / (1000 * 60 * 60 * 24);
      
      if (diffDays <= dateThresholdDays) {
        return skyward;
      }
    }
  }
  
  return null;
}
```

#### Strategy 4: Points Possible Match (Low Confidence)
```typescript
function pointsMatch(
  canvasAssignment: ISlcAssignment,
  skywardAssignments: ISlcAssignment[]
): ISlcAssignment[] {
  const canvasPoints = canvasAssignment.record.pointsPossible;
  if (!canvasPoints) return [];
  
  return skywardAssignments.filter(s => 
    s.record.pointsPossible === canvasPoints
  );
}
```

---

## 🛠️ Implementation Plan

### Step 1: Create Assignment Reconciler

Create `packages/connector/src/reconciliation/assignment-reconciler.ts`:

```typescript
export interface IAssignmentMatch {
  readonly canvasAssignment: ISlcAssignment;
  readonly skywardAssignment: ISlcAssignment | null;
  readonly matchStrategy: 'exact' | 'fuzzy' | 'date-course' | 'points' | 'none';
  readonly confidence: 'high' | 'medium' | 'low';
  readonly similarity?: number;
}

export interface IReconcileAssignmentsOptions {
  readonly userId: string;
  readonly mergedCourses: readonly IMergedCourse[];
  readonly canvasAssignments: readonly ISlcAssignment[];
  readonly skywardAssignments: readonly ISlcAssignment[];
}

export function reconcileAssignments(
  options: IReconcileAssignmentsOptions
): readonly IAssignmentMatch[] {
  // 1. Group assignments by merged course
  // 2. For each Canvas assignment, try strategies in order:
  //    a) Exact title match
  //    b) Fuzzy title match (>= 0.7 similarity)
  //    c) Due date + course match
  //    d) Points possible match (as hint)
  // 3. Return match results with confidence
}
```

### Step 2: Use Reconciliation to Filter Missing Assignments

```typescript
export function filterReconciledMissing(
  matches: readonly IAssignmentMatch[]
): ISlcAssignment[] {
  return matches
    .filter(match => {
      // Canvas shows "missing"
      if (match.canvasAssignment.record.status !== 'missing') return false;
      
      // No Skyward match = definitely missing
      if (!match.skywardAssignment) return true;
      
      // Skyward shows missing/late = still missing
      const skywardStatus = match.skywardAssignment.record.status;
      if (skywardStatus === 'missing' || skywardStatus === 'late') return true;
      
      // Skyward shows submitted/graded = NOT missing (filter out)
      if (skywardStatus === 'submitted' || skywardStatus === 'graded') return false;
      
      // Skyward has a grade = NOT missing
      if (match.skywardAssignment.record.grade != null) return false;
      
      // Default: keep as missing
      return true;
    })
    .map(match => match.canvasAssignment);
}
```

### Step 3: Integrate into Ingest Pipeline

In `packages/api/src/routes/ingest/v1/ingest.ts`, after processing all assignments:

```typescript
// After existing alert logic...

// Reconcile Canvas assignments with Skyward
const canvasAssignments = /* all Canvas/Google assignments for user */;
const skywardAssignments = /* all Skyward assignments for user */;
const mergedCourses = mergeCourses(/* all courses */);

const matches = reconcileAssignments({
  userId,
  mergedCourses,
  canvasAssignments,
  skywardAssignments,
});

// Update alert counts with reconciled data
const reconciledMissing = filterReconciledMissing(matches);
const reconciledMissingCount = reconciledMissing.length;

// Store reconciliation results
await db.collection('slc_assignment_reconciliation').insertMany(
  matches.map(m => ({
    userId,
    canvasExternalId: m.canvasAssignment.externalId,
    skywardExternalId: m.skywardAssignment?.externalId,
    matchStrategy: m.matchStrategy,
    confidence: m.confidence,
    similarity: m.similarity,
    createdAt: now,
  }))
);
```

---

## 📈 Expected Impact on Ava's Missing Count

### Current State
- **Canvas Missing**: 75 assignments (all with no due date)
- **Skyward Missing**: 3 assignments

### After Reconciliation

**Scenario 1: Conservative Matching (Exact + Fuzzy > 0.9)**
- **Matched & Graded in Skyward**: ~5-10 assignments
- **Reduced Missing Count**: ~65-70

**Scenario 2: Aggressive Matching (Exact + Fuzzy > 0.7 + Date/Points)**
- **Matched & Graded in Skyward**: ~15-25 assignments
- **Reduced Missing Count**: ~50-60

**Scenario 3: Manual Review** (Recommended First)
- Run reconciliation in "dry run" mode
- Generate a report showing matches
- User reviews and confirms false positives
- Apply confirmed matches

---

## ⚠️ Challenges & Mitigations

### Challenge 1: No Due Dates (75/75 Canvas assignments)
**Impact**: Can't use date-based matching  
**Mitigation**: Focus on title matching (exact + fuzzy) and course grouping

### Challenge 2: Only 3 Skyward Assignments
**Impact**: Very few matches possible (max 3 out of 75)  
**Mitigation**: 
- Run another Skyward scrape to get all assignments (not just missing)
- Skyward likely has 200+ graded assignments that could match Canvas "missing" ones

### Challenge 3: Different Naming Conventions
**Canvas**: "M2 T1 Test Review", "M5T1 Review" (module-based)  
**Skyward**: "Quadratic Attributes Worksheet" (descriptive)  
**Mitigation**: Use fuzzy matching with confidence thresholds

### Challenge 4: Skyward May Not Show All Assignments
**Impact**: Skyward SIS typically shows only graded/missing work, not all assignments  
**Mitigation**: 
- Canvas is authoritative for "what exists"
- Skyward is authoritative for "what's graded"
- Keep Canvas assignments that don't match Skyward (they're truly missing)

---

## 🎯 Recommended Next Steps

### Option A: Full Implementation (3-4 hours)
1. ✅ Create `assignment-reconciler.ts` with all strategies
2. ✅ Add TDD tests for matching logic
3. ✅ Integrate into ingest pipeline
4. ✅ Store reconciliation results in new collection
5. ✅ Update digest email to use reconciled counts
6. ✅ Run test sync and verify results

### Option B: Quick Prototype (30 minutes)
1. ✅ Run another Skyward scrape to get **all** assignments (not just missing 3)
2. ✅ Use existing `titleSimilarity()` function from `course-reconciler.ts`
3. ✅ Write a quick script to show potential matches
4. ✅ Manually review and decide which to filter

### Option C: Simple Course-Level Filter (10 minutes)
1. ✅ Use existing course reconciliation
2. ✅ If Canvas assignment is in a course that has **any** Skyward grades, keep it
3. ✅ If Canvas assignment is in a course with **no** Skyward data, hide it
4. ✅ This would filter out ~9 old assignments (Art from Oct 2024)

---

## 💡 Recommendation

**Start with Option B (Quick Prototype)**:

1. **Run full Skyward scrape** to get all assignments (currently only have 3 "missing")
2. **Generate match report** showing:
   - Canvas missing assignments
   - Potential Skyward matches (with similarity scores)
   - Confidence levels
3. **Manual review** of top 20 matches
4. **Decide** if full implementation is worth it based on match quality

This gives us data-driven insight into whether reconciliation will actually reduce the 75 count meaningfully.

---

## 📋 Next Actions

**What would you like to do?**

1. ✅ **Run full Skyward scrape** (not just missing assignments)
2. ✅ **Generate reconciliation prototype** with match report
3. ✅ **Implement full reconciliation system** (Option A)
4. ✅ **Use simple course-level filter** (Option C)

Let me know which approach you prefer!

---

*Analysis by Cursor AI Agent on March 5, 2026*
