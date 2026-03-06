# 🎯 Skyward Browser Scraper — Root Cause & Solution

**Date**: March 5, 2026  
**Issue**: Only 3 missing assignments from Skyward, need ALL assignments for reconciliation  
**Root Cause**: Browser scraper returns empty `assignments` array

---

## ❌ Root Cause Identified

**File**: `/Users/admin/Dev/YOLOProjects/scholaracle_scrapers/src/scrapers/skyward/skyward-scraper.ts`  
**Line**: 367

```typescript
return { courses, assignments: [], missingAssignments };
//                ^^^^^^^^^^^^^^ EMPTY ARRAY!
```

The `extractGradebook()` function correctly extracts:
- ✅ **Courses** (with grades from gradebook summary)
- ✅ **Missing assignments** (from "Missing Assignments" section)
- ❌ **All assignments** — Returns empty array instead of extracting individual assignments

---

## 📊 Current vs Needed

### What We Have Now
```typescript
{
  courses: [
    { name: "JOURNALISM", period: "1", currentGrade: "95", grades: {...} },
    { name: "ALGEBRA 1", period: "4", currentGrade: "88", grades: {...} },
    // ... 10 courses total
  ],
  missingAssignments: [
    { title: "#5 Paragraph Creed Questions", course: "JOURNALISM", ... },
    { title: "Quadratic Attributes Worksheet", course: "ALGEBRA 1", ... },
    { title: "Value Practice 1", course: "ART 1", ... }
  ],
  assignments: [] // ❌ EMPTY!
}
```

### What We Need
```typescript
{
  courses: [...], // Same
  missingAssignments: [...], // Same  
  assignments: [
    // ALL assignments from gradebook, not just missing
    { title: "Homework 1", course: "JOURNALISM", grade: "95", points: "95/100", dueDate: "..." },
    { title: "Quiz 2", course: "ALGEBRA 1", grade: "88", points: "88/100", dueDate: "..." },
    { title: "Test 1", course: "ENGLISH 1", grade: "92", points: "92/100", dueDate: "..." },
    // ... 200+ assignments with grades
  ]
}
```

---

## 🔧 Solution: Implement Assignment Extraction

The Skyward gradebook has a detailed view for each course that shows ALL assignments with:
- Assignment title
- Category (Major, Minor, etc.)
- Due date
- Points earned / possible
- Grade
- Status (graded, missing, etc.)

### Implementation Strategy

**Step 1**: Navigate to each course's gradebook detail page  
**Step 2**: Extract all assignments from the assignment table  
**Step 3**: Return complete assignment data

### Proposed Code Changes

Update `skyward-scraper.ts`:

```typescript
private async extractGradebook(page: Page): Promise<{
  courses: ISkywardCourseExtract[];
  assignments: ISkywardAssignmentExtract[]; // Now will have data!
  missingAssignments: ISkywardMissingAssignment[];
}> {
  // ... existing course extraction code (lines 255-323) ...
  
  // NEW: Extract all assignments from gradebook detail pages
  const allAssignments: ISkywardAssignmentExtract[] = [];
  
  for (const course of courses) {
    try {
      // Click on course link to view detailed gradebook
      const courseLink = page.locator(`a:has-text("${course.name}")`).first();
      await courseLink.click({ timeout: 5000 });
      await page.waitForTimeout(2000);
      
      // Extract assignments from the detail view
      const courseAssignments = await page.evaluate((courseName, period) => {
        const assignments: Array<{
          title: string;
          course: string;
          period: string;
          category: string;
          dueDate: string;
          pointsEarned: string;
          pointsPossible: string;
          grade: string;
          status: string;
        }> = [];
        
        // Find assignment table (varies by Skyward version)
        const tables = document.querySelectorAll('table');
        for (const table of tables) {
          const headerText = table.querySelector('tr')?.textContent ?? '';
          if (!headerText.includes('Assignment') && !headerText.includes('Category')) continue;
          
          // Parse assignment rows
          const rows = table.querySelectorAll('tr');
          for (let i = 1; i < rows.length; i++) {
            const cells = rows[i].querySelectorAll('td');
            if (cells.length < 3) continue;
            
            // Extract assignment data (adjust column indices based on your Skyward layout)
            const title = cells[0]?.textContent?.trim() ?? '';
            const category = cells[1]?.textContent?.trim() ?? '';
            const dueDate = cells[2]?.textContent?.trim() ?? '';
            const points = cells[3]?.textContent?.trim() ?? '';
            const grade = cells[4]?.textContent?.trim() ?? '';
            
            if (title && title !== 'Total') {
              const [earned, possible] = points.split('/').map(p => p.trim());
              assignments.push({
                title,
                course: courseName,
                period,
                category,
                dueDate,
                pointsEarned: earned ?? '',
                pointsPossible: possible ?? '',
                grade: grade || '',
                status: grade ? 'graded' : 'unknown'
              });
            }
          }
        }
        
        return assignments;
      }, course.name, course.period);
      
      allAssignments.push(...courseAssignments);
      
      // Navigate back to main gradebook
      await page.goBack({ timeout: 5000 });
      await page.waitForTimeout(1000);
      
    } catch (err) {
      console.error(`Failed to extract assignments for ${course.name}:`, err);
      // Continue with other courses
    }
  }
  
  // ... existing missing assignments code (lines 325-365) ...
  
  return { courses, assignments: allAssignments, missingAssignments };
}
```

### Interface Update

Update `skyward-transformer.ts` to match:

```typescript
export interface ISkywardAssignmentExtract {
  title: string;        // "Homework 1"
  course: string;       // "JOURNALISM"
  period: string;       // "1"
  category: string;     // "Major", "Minor", etc.
  dueDate: string;      // "02/15/2026"
  pointsEarned: string; // "95"
  pointsPossible: string; // "100"
  grade: string;        // "95" or "A"
  status: string;       // "graded", "missing", "late"
}
```

### Transformer Update

Update `transformSkywardExtract()` to create assignment ops from the `assignments` array:

```typescript
// Add after missing assignments processing
for (const assignment of extract.assignments) {
  const courseExtId = `skyward-course-${assignment.period}-${slugify(assignment.course)}`;
  const assignmentExtId = `skyward-assignment-${assignment.period}-${slugify(assignment.title)}`;
  
  ops.push({
    op: 'upsert',
    entity: 'assignment',
    key: { ...baseKey, externalId: assignmentExtId, courseExternalId: courseExtId },
    observedAt: now,
    record: {
      title: assignment.title,
      status: assignment.status,
      dueAt: parseSkywardDate(assignment.dueDate),
      pointsEarned: parseFloat(assignment.pointsEarned) || undefined,
      pointsPossible: parseFloat(assignment.pointsPossible) || undefined,
      grade: parseFloat(assignment.grade) || undefined,
      category: assignment.category,
    },
  });
}
```

---

## 🎯 Alternative: Quick Fix for Reconciliation

If implementing full assignment extraction is too complex, we can use a **simpler approach**:

### Option: Use Grade Snapshots for Reconciliation

Since we already have:
- ✅ Course grades from Skyward (16 grade snapshots)
- ✅ Course matching working (100% match rate)

We can filter Canvas missing assignments by:
1. Check if the course has a grade in Skyward
2. If Skyward shows a grade >= 70%, assume most assignments are complete
3. Keep Canvas "missing" only if:
   - No Skyward grade for that course, OR
   - Skyward grade < 70% (failing)

This won't give perfect reconciliation, but it's a reasonable heuristic without scraping all individual assignments.

---

## 📋 Recommended Action Plan

### Option A: Full Implementation (Recommended for Production)
1. ✅ Implement assignment extraction in `extractGradebook()`
2. ✅ Update `ISkywardAssignmentExtract` interface
3. ✅ Update `transformSkywardExtract()` to process assignments
4. ✅ Add TDD tests for assignment extraction
5. ✅ Re-run Skyward scrape
6. ✅ Verify we get 200+ assignments
7. ✅ Implement assignment reconciliation (title matching)

**Time**: 3-4 hours  
**Benefit**: Accurate assignment-level reconciliation

### Option B: Quick Heuristic (Fast, Good Enough)
1. ✅ Use existing course-level grades
2. ✅ Filter Canvas missing by course grade threshold
3. ✅ Keep missing if no Skyward grade or grade < 70%
4. ✅ Document limitations

**Time**: 30 minutes  
**Benefit**: Immediate reduction in missing count (estimated 20-30 assignments filtered)

---

## 🤔 Decision Point

**What would you like to do?**

1. **Implement full assignment extraction** (Option A) — Scrape all assignments from Skyward gradebook detail pages
2. **Use course-level heuristic** (Option B) — Filter based on course grades only
3. **Manual verification first** — Check Skyward portal to see if individual assignments are accessible

---

*Analysis by Cursor AI Agent on March 5, 2026*
