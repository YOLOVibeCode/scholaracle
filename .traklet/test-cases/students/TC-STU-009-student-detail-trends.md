---
id: TC-STU-009
title: "Student detail page - Trends tab (grade trend charts)"
priority: medium
labels: [students, detail, trends, charts]
depends: [TC-STU-002]
suite: students
---

{traklet:section:objective}
## Objective
Verify the Trends tab shows grade trend charts across all courses for the student.
{/traklet:section:objective}

{traklet:section:preconditions}
## Preconditions
- User is logged in with a student that has historical grade data
{/traklet:section:preconditions}

{traklet:section:steps}
## Steps
1. Login → `/dashboard`
2. Navigate to **Students** → `/dashboard/students`
3. Click a student → `/dashboard/students/[id]?tab=trends`
4. Click the **Trends** tab
{/traklet:section:steps}

{traklet:section:expected-result}
## Expected Result
- StudentTrendsTab and AllCoursesGradeTrend charts render
- Trend lines show grade progression over time per course
- Charts are interactive (hover shows data points)
- Empty state shown if insufficient historical data
{/traklet:section:expected-result}
