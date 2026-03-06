# Ava Lewis — Missing Assignments Breakdown

**Date**: March 5, 2026  
**User**: rvegajr@noctusoft.com → Ava Lewis  
**Total Assignments**: 408  
**Missing Assignments**: **75**

---

## 📊 Overall Assignment Status

| Status | Count | Percentage |
|--------|-------|------------|
| **Submitted** | 157 | 38.5% |
| **Graded** | 109 | 26.7% |
| **Missing** | **75** | **18.4%** |
| **Late** | 64 | 15.7% |
| **Undefined** | 3 | 0.7% |
| **Total** | **408** | **100%** |

---

## 🎯 Missing Assignments by Course

| Course | Missing Count | Percentage of Total Missing |
|--------|---------------|------------------------------|
| **English 📝** | 28 | 37.3% |
| **Journalism 📰** | 25 | 33.3% |
| **World Geography 🗺️** | 8 | 10.7% |
| **Art 🎨** | 6 | 8.0% |
| **Algebra 🔢** | 3 | 4.0% |
| **Biology 🧬** | 2 | 2.7% |
| **ALGEBRA 1** | 1 | 1.3% |
| **JOURNALISM** | 1 | 1.3% |
| **ART 1** | 1 | 1.3% |
| **Total** | **75** | **100%** |

---

## 🚨 Critical Finding: All 75 Missing Assignments Have NO DUE DATE

### The Issue

**100% of the 75 missing assignments (75/75) have `dueDate: null`**

This means:
1. ❌ **Cannot filter by semester** — No due dates to compare against semester start (Jan 1 or Aug 1)
2. ❌ **Cannot determine if assignment is old** — Could be from a previous semester or current
3. ⚠️ **Potential data quality issue** — Canvas/Google Classroom may not be providing due dates
4. ⚠️ **Digest filtering ineffective** — Our semester filter (implemented in testing) won't reduce the count because all assignments have no date to check

### Sample Missing Assignments (No Due Dates)

| Assignment Title | Course | Points | Observed Date |
|------------------|--------|--------|---------------|
| M2 T1 Test Review | English | 100 | Mar 1, 2026 |
| M2T2 Review | English | 100 | Mar 1, 2026 |
| M5T1 Review | English | 100 | Mar 1, 2026 |
| Inktober reflection, 10/28/24 | Art | N/A | Mar 1, 2026 |
| Feature Study: Eye | Art | N/A | Mar 1, 2026 |
| Feature Study: Mouth and Teeth | Art | N/A | Mar 1, 2026 |
| Feature Study: Nose | Art | N/A | Mar 1, 2026 |
| Implied Texture Worksheet | Art | N/A | Mar 1, 2026 |
| Semester Exam -Art 1 | Art | N/A | Mar 1, 2026 |
| Reading Reflection - Day 1 | Journalism | N/A | Feb 22, 2026 |

---

## 📅 Date Analysis

### Observed Date Range
- **Newest**: Mar 1, 2026 (most recent sync)
- **Oldest**: Feb 22, 2026
- **Range**: ~7 days

### Term Association
- **Assignments with `termExternalId`**: 0 / 75 (0%)
- **Academic Terms in Database**: 0

**Implication**: No academic term data available to filter assignments by semester/quarter.

---

## 🔍 Why You Have 75 Missing Assignments

Based on the data, here's my analysis of how we got the number **75**:

### 1. **Data Source Reality**
Canvas/Google Classroom is reporting these 75 assignments as "missing" status, but they lack due dates. This suggests:
- Teachers may have set assignments as "missing" manually without assigning due dates
- The scraper is correctly capturing the status from the source system
- These could be:
  - ✅ **Practice/review assignments** (M2 T1 Test Review, M2T2 Review, M5T1 Review)
  - ✅ **Optional assignments** (Inktober reflection)
  - ✅ **Old assignments** from previous semesters that were never closed
  - ✅ **Extra credit** or supplementary work

### 2. **The "Real" Missing Count**
Without due dates, we cannot automatically filter to show only "current semester" missing assignments. However, based on the course names and titles:

#### Likely Current (Should Show in Digest)
- **English 📝**: 28 assignments (M2, M5 suggests current module work)
- **Journalism 📰**: 25 assignments (current course)
- **World Geography 🗺️**: 8 assignments
- **Algebra 🔢**: 3 assignments
- **Biology 🧬**: 2 assignments

**Estimated Current Missing**: ~66 assignments

#### Likely Old/Closed (Should Hide)
- **Art 🎨**: 6 assignments (many from Oct 2024, "Inktober reflection, 10/28/24")
- **Semester Exam -Art 1**: 1 assignment (semester exam is over)

**Estimated Old Missing**: ~9 assignments

---

## 🎯 Recommendations

### Option 1: Show All 75 (Current Behavior)
**Pros**: 
- Shows the complete picture from Canvas/Google Classroom
- Parents/students see everything marked as "missing"

**Cons**:
- May include old assignments that are no longer relevant
- Could cause unnecessary stress/confusion

### Option 2: Filter by `observedAt` Date
Since `dueDate` is null, we could filter by when we first observed the assignment:
- **Keep**: Assignments first seen after Jan 1, 2026 (current semester)
- **Hide**: Assignments first seen before Jan 1, 2026

**Analysis**: All 75 assignments were observed between Feb 22 - Mar 1, 2026, so this filter would keep all 75.

### Option 3: Manual Course-Based Filter
Add a "ignore list" for specific old assignments:
- Filter out any assignment with "Semester Exam" in title
- Filter out art assignments from Oct 2024 (e.g., "Inktober reflection, 10/28/24")

### Option 4: Add "Mark as Resolved" Feature
Allow parents/students to mark old missing assignments as "resolved" or "ignore" in the UI, which would:
- Keep them in the database but hide from digest
- Track in a separate `slc_assignment_resolution` collection

---

## 📋 Next Steps

### Before Running Another Scrape

**Question for you**: Do you want to:

1. ✅ **Run the scrape as-is** and accept that all 75 missing assignments will be included (no filtering possible without due dates)?

2. ✅ **Manually review the missing assignments** in Canvas/Google Classroom to see which are truly current vs old?

3. ✅ **Add a "Mark as Resolved" feature** so you can manually hide old assignments from the digest?

4. ✅ **Accept the 75 count** and focus on other metrics (late assignments, grade drops, etc.) in the digest?

### If You Run Another Scrape

Running another scrape will:
- ✅ Refresh the assignment statuses
- ✅ Potentially update the missing count if teachers marked assignments as complete
- ✅ Pull in any new assignments from the last few days
- ⚠️ **May not change the 75 count** if Canvas/Google Classroom still reports the same missing assignments

---

## 💡 The Bottom Line

**You have exactly 75 missing assignments in the database because:**
1. ✅ Canvas/Google Classroom reports 75 assignments with `status: "missing"`
2. ✅ The scraper correctly captured this data on Mar 1, 2026
3. ⚠️ **100% of them have no due date** (`dueDate: null`)
4. ⚠️ **0% have term association** (`termExternalId: null`)
5. ⚠️ This makes semester-based filtering impossible without additional data

**The number is accurate based on the source data**, but the lack of due dates means we can't automatically filter out old/irrelevant assignments.

---

*Generated by Cursor AI Agent on March 5, 2026*
