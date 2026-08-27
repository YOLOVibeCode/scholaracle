# Scholaracle Data Extraction Checklist

> Version 1.0 — 2026-02-16
>
> This checklist defines **everything** a scraper should extract from an educational platform.
> It is embedded into AI prompts for scraper generation and serves as the field catalog
> for what the Scholaracle system can ingest.
>
> **Join keys, provider roles, and intelligence layers** live in
> [`CLIENT_SCRAPER_SPEC.md`](./CLIENT_SCRAPER_SPEC.md). Extract the fields below
> **and** emit the join keys in that spec, or subjects / grades / resources
> cannot be stitched together.
>
> **Rule: If the platform shows it on any page, scrape it. Navigate to every page necessary.
> If a data point is not available on the platform, omit the field — but always check.**

---

## How This Document Is Used

1. **AI scraper generation** — the full text of this checklist is included in the system prompt
   when an AI generates a new scraper. The AI is instructed to extract every item listed below.
2. **Manual scraper development** — developers use this as a spec for what their scraper
   should output.
3. **Scraper validation** — the validator warns when expected data categories are empty,
   helping identify scrapers that miss available data.

---

## Entity Types and Required Fields

Each section below maps to a `SlcEntityType` in the ingest envelope. Fields marked
**[required]** must be present for the record to pass validation. All other fields are
optional but should be populated whenever the platform makes them available.

---

### 1. Student Profile (`studentProfile`)

Extract once per scraper run. This tells the system who the child is.

| Field | Type | Notes |
|-------|------|-------|
| **name** [required] | string | Full display name as shown on portal |
| firstName | string | First name |
| lastName | string | Last name |
| studentId | string | School-issued student ID number |
| gradeLevel | string | "9th", "10th", "Junior", "Senior", etc. |
| school | string | School name |
| district | string | District name |
| enrollmentStatus | string | "active", "withdrawn", etc. |
| counselor | string | Assigned counselor name |
| advisor | string | Assigned advisor name |
| homeroom | string | Homeroom identifier |

**Where to find:** Usually on the student profile/info page, dashboard header, or account settings.

---

### 2. Courses (`course`)

Extract one record per course the student is enrolled in.

`key.externalId` is the hub other entities point at. Prefer a native platform
id (`canvas-course-12345`). Always emit `title` plus at least one join hint:
`teacherName`, `period`, or `courseCode`.

| Field | Type | Notes |
|-------|------|-------|
| **title** [required] | string | Course name: "AP Mathematics", "English 10 Honors" |
| courseCode | string | Course code: "MATH-301", "ENG-10H" |
| subjectArea | string | Subject: "Mathematics", "English", "Science" |
| teacherName | string | Primary teacher's display name |
| teacherEmail | string | Teacher's email address |
| period | string | Class period: "1st", "3rd", "A Block" |
| room | string | Room number or location |
| startTime | string | Daily start time HH:MM (24h or 12h) |
| endTime | string | Daily end time HH:MM |
| daysOfWeek | number[] | Days class meets: 0=Sun, 1=Mon, ... 6=Sat |
| termExternalId | string | Link to the academic term entity |
| description | string | Course description or syllabus summary |
| url | string | Direct link to course page on the platform |

**Where to find:** Course list page, class schedule, individual course pages, student schedule view.

---

### 3. Assignments (`assignment`)

Extract **every assignment** for the current term at minimum. Historical terms are valuable too.

`key.courseExternalId` and `record.courseExternalId` MUST equal the parent
course's `key.externalId`. Prefer a native assignment id, never an array index.

| Field | Type | Notes |
|-------|------|-------|
| **title** [required] | string | Assignment name |
| description | string | Full instructions/description (HTML or text) |
| dueAt | string (ISO) | Due date and time |
| assignedAt | string (ISO) | When it was posted/assigned |
| status | string | One of: "missing", "submitted", "graded", "late", "not_started", "in_progress", "excused", "unknown" |
| pointsPossible | number | Maximum points |
| pointsEarned | number | Points the student received |
| percentScore | number | Percentage score if shown |
| letterGrade | string | Per-assignment letter grade if available |
| category | string | Grading category: "Tests", "Homework", "Projects", "Classwork", "Labs", "Participation" |
| categoryWeight | number | Weight of this category (0-100) |
| submittedAt | string (ISO) | When the student submitted |
| gradedAt | string (ISO) | When the teacher graded it |
| teacherFeedback | string | Teacher comments on the submission |
| rubricScores | array | Per-criterion rubric breakdown (see below) |
| isLate | boolean | Was it turned in late? |
| isMissing | boolean | Is it missing? |
| isExcused | boolean | Is it excused? |
| turnedInLateBy | string | Human-readable lateness: "2 days", "3 hours" |
| attachments | array | Attached files or links (see below) |
| submissionType | string | "online", "paper", "external_tool" |
| url | string | Direct link to assignment on platform |
| courseExternalId | string | Link to parent course entity |
| termExternalId | string | Link to grading period |

**Rubric score fields:**
| Field | Type | Notes |
|-------|------|-------|
| criterion | string | "Thesis Statement", "Evidence", "Grammar" |
| score | number | Points earned for this criterion |
| possiblePoints | number | Maximum points for this criterion |
| rating | string | "Excellent", "Proficient", "Needs Work" |
| comments | string | Per-criterion teacher comments |

**Attachment fields:**
| Field | Type | Notes |
|-------|------|-------|
| name | string | File name or link title |
| url | string | Download URL or link |
| type | string | MIME type or "file", "link", "video" |
| size | number | File size in bytes |

**Where to find:** Course assignments page, gradebook, to-do list, calendar, individual assignment detail pages. **Navigate into each assignment** to get description, rubric scores, and teacher feedback — these are usually not visible on the list view.

---

### 4. Grade Snapshots (`gradeSnapshot`)

Extract one per course per grading period. This is the "report card" view.

`record.courseExternalId` MUST equal the parent course's `key.externalId`.
SIS snapshots are the official grade; LMS snapshots are working grades.

| Field | Type | Notes |
|-------|------|-------|
| **courseExternalId** [required] | string | Which course this grade is for |
| **asOfDate** [required] | string (date) | Date the grade was captured (YYYY-MM-DD) |
| letterGrade | string | "A", "B+", "C-", "F" |
| percentGrade | number | Percentage: 95.5, 82.0 |
| gpa | number | GPA points for this course |
| earnedPoints | number | Total points earned |
| possiblePoints | number | Total points possible |
| missingCount | number | Number of missing assignments |
| lateCount | number | Number of late assignments |
| categories | array | Per-category breakdown (see below) |
| trend | string | "improving", "declining", "stable", "unknown" |
| classAverage | number | Class average if platform shows it |
| classRank | string | Rank or percentile if shown: "3/28", "Top 10%" |
| teacherComments | string | Report card comments from teacher |
| termExternalId | string | Which grading period |

**Grade category fields:**
| Field | Type | Notes |
|-------|------|-------|
| name | string | "Tests", "Homework", "Projects" |
| weight | number | Percentage weight (0-100) |
| earnedPoints | number | Points earned in this category |
| possiblePoints | number | Points possible in this category |
| percentScore | number | Category percentage |
| letterGrade | string | Category letter grade |

**Where to find:** Gradebook/grades page (overall view), report card page, progress report page. Category breakdowns are often on a "grade details" or "category" sub-view within each course.

---

### 5. Attendance Events (`attendanceEvent`)

Extract every attendance record available.

| Field | Type | Notes |
|-------|------|-------|
| **date** [required] | string (date) | Date of attendance (YYYY-MM-DD) |
| **status** [required] | string | One of: "present", "absent", "tardy", "excused", "unexcused", "partial", "field_trip" |
| periodName | string | Which period: "1st Period", "3rd", "A Block" |
| courseName | string | Course name for this period |
| courseExternalId | string | Link to course entity |
| notes | string | Any notes or details |
| minutesMissed | number | Minutes of class missed |
| excuseReason | string | Reason: "illness", "appointment", "family" |

**Where to find:** Attendance page, attendance history, daily/weekly attendance view. Some platforms show attendance per-period, others show daily summary.

---

### 6. Teachers (`teacher`)

Extract one record per teacher the student has.

| Field | Type | Notes |
|-------|------|-------|
| **name** [required] | string | Display name: "Mrs. Johnson", "Dr. Smith" |
| email | string | Email address |
| phone | string | Phone number if listed |
| department | string | "Mathematics", "English", "Science" |
| title | string | Honorific: "Mr.", "Mrs.", "Dr.", "Coach" |
| officeHours | string | Free text: "Mon/Wed 3:30-4:30 PM" |
| preferredContact | string | "email", "phone", "portal message" |
| courseExternalIds | string[] | Which courses they teach |

**Where to find:** Course pages (teacher info section), staff directory, contact page, teacher profile pages.

---

### 7. Course Materials (`courseMaterial`)

Extract all documents, files, and resources posted to courses.

`record.courseExternalId` is required. Set `record.assignmentExternalId` when
the portal groups the file with an assignment (module, description link,
attachment). Unmatched files still upload — server LLM matching fills the gap.

| Field | Type | Notes |
|-------|------|-------|
| **title** [required] | string | Document/resource title |
| **courseExternalId** [required] | string | Which course this belongs to |
| **type** [required] | string | One of: "document", "link", "syllabus", "handout", "rubric", "study_guide", "presentation", "video", "other" |
| url | string | **Download** URL (e.g. Canvas `/files/{id}/download`). Never a viewer page URL. |
| fileName | string | File name including extension: "ch5-study-guide.pdf". MUST be set for `type: document`. |
| mimeType | string | MIME type: "application/pdf", "image/png". MUST be set for `type: document`. |
| linkAccessibility | string | `'public'` (no auth needed) \| `'authenticated'` (requires school login) \| `'unknown'`. Set for `type: link`. |
| extractedText | string | Readable text extracted from the page (cap 50 KB; strip nav/scripts/styles). Set when `type: link` and the page is accessible. Used for offline reading. |
| postedAt | string (ISO) | When it was posted |
| description | string | Description or notes |
| fileSize | number | File size in bytes |

**Where to find:** Course files page, modules/units page, resources page, assignment attachments. Syllabi are often on the course home page or a dedicated syllabus tab.

**Capture order for offline readiness** (see [`CLASS_OFFLINE_PACK.md §3`](./CLASS_OFFLINE_PACK.md)):
1. Native file → rehost via `IAssetHost`; set `fileName` + `mimeType`.
2. Link whose `Content-Type` is a binary file type → treat as (1).
3. Accessible HTML page → `extractedText` (50 KB cap); keep `type: link`.
4. Authenticated viewer with no export → `linkAccessibility: 'authenticated'`; no `extractedText`.

---

### 8. Messages (`message`)

Extract all messages and announcements visible to the parent/student.

| Field | Type | Notes |
|-------|------|-------|
| **subject** [required] | string | Subject line |
| **body** [required] | string | Full message content (HTML or text) |
| **senderName** [required] | string | Who sent it |
| **sentAt** [required] | string (ISO) | When it was sent |
| senderRole | string | One of: "teacher", "admin", "counselor", "system", "parent", "student" |
| read | boolean | Has it been read? |
| courseExternalId | string | Associated course if any |
| attachments | array | Attached files (same format as assignment attachments) |
| recipients | string | Audience: "all parents", "Period 3", "Grade 10" |
| importance | string | "normal", "important", "urgent" |
| category | string | "academic", "administrative", "event", "reminder", "behavioral", "other" |

**Where to find:** Inbox/messages page, announcements feed, notifications page, course announcements tab. Check both school-wide and course-specific announcements.

---

### 9. Academic Terms (`academicTerm`)

Extract all grading periods, semesters, quarters.

| Field | Type | Notes |
|-------|------|-------|
| **title** [required] | string | "Spring 2026", "Q3", "Semester 1" |
| **startDate** [required] | string (date) | Start date (YYYY-MM-DD) |
| **endDate** [required] | string (date) | End date (YYYY-MM-DD) |
| type | string | "semester", "quarter", "trimester", "year", "other" |

**Where to find:** Gradebook (term/quarter selector), school calendar, academic calendar page.

---

### 10. Institutions (`institution`)

Extract school and district information.

| Field | Type | Notes |
|-------|------|-------|
| **name** [required] | string | School name |
| type | string | "school", "district", "other" |
| address | string | Physical address |

**Where to find:** School info page, footer, about page, student profile.

---

### 11. Event Series (`eventSeries`)

Extract calendar events, recurring schedules.

| Field | Type | Notes |
|-------|------|-------|
| **title** [required] | string | Event name |
| category | string | "test", "quiz", "classwork", "project", "meeting", "field_trip", "activity", "deadline", "other" |
| timezone | string | IANA timezone: "America/Chicago" |
| startsAt | string (ISO) | Start date/time |
| endsAt | string (ISO) | End date/time |
| durationMinutes | number | Duration in minutes |
| recurrence.rrule | string | RFC 5545 recurrence rule |

**Where to find:** Calendar page, upcoming events, course calendar, school events page.

---

### 12. Event Overrides (`eventOverride`)

Extract cancellations or modifications to recurring events.

| Field | Type | Notes |
|-------|------|-------|
| **seriesExternalId** [required] | string | Which event series this modifies |
| occurrenceStartAt | string (ISO) | Which occurrence is affected |
| op | string | "modify" or "cancel" |
| startsAt | string (ISO) | New start time (if modify) |
| title | string | New title (if modify) |

**Where to find:** Calendar (cancelled events), school announcements about schedule changes.

---

## Platform-Specific Navigation Guides

### Canvas LMS

Pages to visit per course:
1. **Dashboard** → student name, to-do items, upcoming events
2. **Courses list** → all enrolled courses
3. **Per course: Assignments** → assignment list with due dates, points, status
4. **Per course: Each assignment detail page** → description, rubric, submission, teacher comments
5. **Per course: Grades** → current grade, category breakdown, individual scores
6. **Per course: Modules** → course materials organized by unit
7. **Per course: Files** → all uploaded files and documents
8. **Per course: Announcements** → teacher announcements
9. **Per course: Syllabus** → syllabus content
10. **Calendar** → events across all courses
11. **Inbox** → messages from teachers
12. **Profile** → student info

### Aeries Parent Portal

Pages to visit:
1. **Dashboard/Home** → student name, ID, grade level, school
2. **Grades Summary** → all courses with current grades
3. **Per course: Grade details** → category breakdown, assignments list
4. **Per course: Each assignment** → score, status, teacher comments
5. **Attendance** → daily/period attendance records
6. **Schedule** → class schedule with periods, rooms, teachers
7. **Teacher Info** → teacher names, emails, phone numbers
8. **Documents** → report cards, transcripts, notices
9. **Messages/Notifications** → communications from school

### Skyward Family Access

Pages to visit (note: Skyward uses popup windows):
1. **Gradebook** → course grades by grading period
2. **Per course: Assignment details** → individual assignment scores
3. **Missing Assignments** → all missing work across courses
4. **Attendance** → attendance history
5. **Schedule** → daily class schedule
6. **Student Info** → demographics, counselor
7. **Messages** → school and teacher communications
8. **Calendar** → school events and deadlines
9. **Report Card** → official grades by term

### Generic / Unknown Platforms

When generating a scraper for an unknown platform, the AI should:
1. Navigate to the login page and authenticate
2. Explore the main navigation/sidebar to discover available pages
3. Visit every page linked from the main navigation
4. Look for patterns: "Grades", "Assignments", "Attendance", "Schedule", "Messages", "Files", "Calendar"
5. For each course found, navigate into it and explore sub-pages
6. For each assignment found, navigate into its detail page
7. Check the student profile/account page for personal information
8. Check for a staff directory or teacher contact page

---

## Data Quality Guidelines

### Completeness
- Scrape ALL terms/quarters, not just the current one
- Scrape ALL assignments including past ones (at least current school year)
- Scrape ALL attendance records, not just recent
- Include both graded and ungraded assignments

### Accuracy
- Use exact values from the platform (don't compute grades, report what's shown)
- Preserve HTML in descriptions and message bodies (the server will process it)
- Use ISO 8601 for all dates and timestamps
- Use the platform's timezone for the `run.timezone` field

### Freshness
- Include `observedAt` timestamp on every op (when the data was scraped)
- Use the current date for `gradeSnapshot.asOfDate`

### Error Handling
- If a page fails to load, log a warning but continue with other pages
- If a specific data point can't be parsed, set the field to `undefined` (omit it)
- Never let one course's failure prevent scraping other courses
- Save screenshots on error for debugging (to `output/screenshots/`)
