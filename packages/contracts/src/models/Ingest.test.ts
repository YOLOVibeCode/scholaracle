import {
  type SlcEntityType,
  type ISlcAssignment,
  type ISlcGradeSnapshot,
  type ISlcGradeCategory,
  type ISlcCourse,
  type ISlcAcademicTerm,
  type ISlcAttendanceEvent,
  type ISlcInstitution,
  type ISlcTeacher,
  type ISlcCourseMaterial,
  type ISlcMessage,
  type ISlcEventSeries,
  type ISlcEventOverride,
  type ISlcStudentProfile,
  SLC_ENTITY_TYPES,
  validateEntityRecord,
} from './Ingest';

// ---------------------------------------------------------------------------
// SLC_ENTITY_TYPES constant
// ---------------------------------------------------------------------------

describe('SLC_ENTITY_TYPES', () => {
  it('should include all 12 entity types', () => {
    expect(SLC_ENTITY_TYPES).toContain('assignment');
    expect(SLC_ENTITY_TYPES).toContain('eventSeries');
    expect(SLC_ENTITY_TYPES).toContain('eventOverride');
    expect(SLC_ENTITY_TYPES).toContain('academicTerm');
    expect(SLC_ENTITY_TYPES).toContain('institution');
    expect(SLC_ENTITY_TYPES).toContain('course');
    expect(SLC_ENTITY_TYPES).toContain('gradeSnapshot');
    expect(SLC_ENTITY_TYPES).toContain('attendanceEvent');
    expect(SLC_ENTITY_TYPES).toContain('teacher');
    expect(SLC_ENTITY_TYPES).toContain('courseMaterial');
    expect(SLC_ENTITY_TYPES).toContain('message');
    expect(SLC_ENTITY_TYPES).toContain('studentProfile');
  });

  it('should have exactly 12 entity types', () => {
    expect(SLC_ENTITY_TYPES).toHaveLength(12);
  });
});

// ---------------------------------------------------------------------------
// validateEntityRecord — assignment
// ---------------------------------------------------------------------------

describe('validateEntityRecord — assignment', () => {
  const validAssignment: ISlcAssignment = {
    title: 'Chapter 5 Homework',
    dueAt: '2026-03-01T23:59:00Z',
    status: 'graded',
    pointsPossible: 100,
    pointsEarned: 92,
    description: 'Complete problems 1-20 from Chapter 5.',
    category: 'Homework',
    categoryWeight: 30,
    submittedAt: '2026-02-28T15:30:00Z',
    gradedAt: '2026-03-02T10:00:00Z',
    teacherFeedback: 'Great work! Watch your signs on #14.',
    isLate: false,
    isMissing: false,
  };

  it('should pass for a fully populated assignment', () => {
    const result = validateEntityRecord('assignment', validAssignment);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should pass for a minimal assignment with only title', () => {
    const result = validateEntityRecord('assignment', { title: 'Quiz 3' });
    expect(result.valid).toBe(true);
  });

  it('should fail when title is missing', () => {
    const result = validateEntityRecord('assignment', {} as ISlcAssignment);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('assignment.title is required');
  });

  it('should fail when title is empty string', () => {
    const result = validateEntityRecord('assignment', { title: '' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('assignment.title must be non-empty');
  });

  it('should accept all valid status values', () => {
    const statuses = [
      'missing',
      'submitted',
      'graded',
      'late',
      'not_started',
      'in_progress',
      'excused',
      'unknown',
    ] as const;
    for (const status of statuses) {
      const result = validateEntityRecord('assignment', { title: 'Test', status });
      expect(result.valid).toBe(true);
    }
  });

  it('should accept assignment with rubric scores', () => {
    const withRubric: ISlcAssignment = {
      ...validAssignment,
      rubricScores: [
        { criterion: 'Thesis', score: 9, possiblePoints: 10, rating: 'Excellent' },
        {
          criterion: 'Evidence',
          score: 7,
          possiblePoints: 10,
          rating: 'Proficient',
          comments: 'Need more sources',
        },
      ],
    };
    const result = validateEntityRecord('assignment', withRubric);
    expect(result.valid).toBe(true);
  });

  it('should accept assignment with attachments', () => {
    const withAttachments: ISlcAssignment = {
      ...validAssignment,
      attachments: [
        {
          name: 'worksheet.pdf',
          url: 'https://canvas.com/files/123',
          type: 'application/pdf',
          size: 524288,
        },
      ],
    };
    const result = validateEntityRecord('assignment', withAttachments);
    expect(result.valid).toBe(true);
  });

  it('should accept new enriched fields', () => {
    const enriched: ISlcAssignment = {
      title: 'Essay',
      assignedAt: '2026-02-15T08:00:00Z',
      percentScore: 92.5,
      letterGrade: 'A-',
      isExcused: false,
      turnedInLateBy: '2 days',
      submissionType: 'online',
      url: 'https://canvas.com/assignments/456',
      courseExternalId: 'course-math-101',
      termExternalId: 'term-spring-2026',
    };
    const result = validateEntityRecord('assignment', enriched);
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateEntityRecord — gradeSnapshot
// ---------------------------------------------------------------------------

describe('validateEntityRecord — gradeSnapshot', () => {
  const validSnapshot: ISlcGradeSnapshot = {
    courseExternalId: 'course-math-101',
    asOfDate: '2026-02-16',
    letterGrade: 'A',
    percentGrade: 95.5,
    earnedPoints: 478,
    possiblePoints: 500,
    missingCount: 1,
    lateCount: 2,
    categories: [
      { name: 'Tests', weight: 40, earnedPoints: 185, possiblePoints: 200, percentScore: 92.5 },
      { name: 'Homework', weight: 30, earnedPoints: 145, possiblePoints: 150, percentScore: 96.7 },
      { name: 'Projects', weight: 30, earnedPoints: 148, possiblePoints: 150, percentScore: 98.7 },
    ],
  };

  it('should pass for a fully populated grade snapshot', () => {
    const result = validateEntityRecord('gradeSnapshot', validSnapshot);
    expect(result.valid).toBe(true);
  });

  it('should fail when courseExternalId is missing', () => {
    const result = validateEntityRecord('gradeSnapshot', {
      asOfDate: '2026-02-16',
    } as ISlcGradeSnapshot);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('gradeSnapshot.courseExternalId is required');
  });

  it('should fail when asOfDate is missing', () => {
    const result = validateEntityRecord('gradeSnapshot', {
      courseExternalId: 'c1',
    } as ISlcGradeSnapshot);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('gradeSnapshot.asOfDate is required');
  });

  it('should accept enriched fields: trend, classAverage, teacherComments', () => {
    const enriched: ISlcGradeSnapshot = {
      ...validSnapshot,
      trend: 'improving',
      classAverage: 82.3,
      classRank: 'Top 10%',
      teacherComments: 'Excellent progress this quarter.',
    };
    const result = validateEntityRecord('gradeSnapshot', enriched);
    expect(result.valid).toBe(true);
  });

  it('should accept all valid trend values', () => {
    const trends = ['improving', 'declining', 'stable', 'unknown'] as const;
    for (const trend of trends) {
      const result = validateEntityRecord('gradeSnapshot', { ...validSnapshot, trend });
      expect(result.valid).toBe(true);
    }
  });

  it('should accept grade categories with full detail', () => {
    const cat: ISlcGradeCategory = {
      name: 'Tests',
      weight: 40,
      earnedPoints: 185,
      possiblePoints: 200,
      percentScore: 92.5,
      letterGrade: 'A-',
    };
    const result = validateEntityRecord('gradeSnapshot', {
      ...validSnapshot,
      categories: [cat],
    });
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateEntityRecord — course
// ---------------------------------------------------------------------------

describe('validateEntityRecord — course', () => {
  it('should pass for a fully populated course', () => {
    const course: ISlcCourse = {
      title: 'AP Mathematics',
      courseCode: 'MATH-301',
      subjectArea: 'Mathematics',
      teacherName: 'Mrs. Johnson',
      teacherEmail: 'johnson@school.edu',
      period: '3rd',
      room: 'B204',
      startTime: '09:15',
      endTime: '10:05',
      daysOfWeek: [1, 2, 3, 4, 5],
      termExternalId: 'term-spring-2026',
      description: 'Advanced Placement Mathematics covering calculus.',
      url: 'https://canvas.com/courses/123',
    };
    const result = validateEntityRecord('course', course);
    expect(result.valid).toBe(true);
  });

  it('should fail when title is missing', () => {
    const result = validateEntityRecord('course', {} as ISlcCourse);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('course.title is required');
  });

  it('should pass for minimal course with only title', () => {
    const result = validateEntityRecord('course', { title: 'English' });
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateEntityRecord — studentProfile (NEW entity)
// ---------------------------------------------------------------------------

describe('validateEntityRecord — studentProfile', () => {
  const validProfile: ISlcStudentProfile = {
    name: 'Emma Lewis',
    firstName: 'Emma',
    lastName: 'Lewis',
    studentId: '12345',
    gradeLevel: '10th',
    school: 'Lake Dallas High School',
    district: 'Lake Dallas ISD',
    enrollmentStatus: 'active',
    counselor: 'Ms. Garcia',
  };

  it('should pass for a fully populated student profile', () => {
    const result = validateEntityRecord('studentProfile', validProfile);
    expect(result.valid).toBe(true);
  });

  it('should fail when name is missing', () => {
    const result = validateEntityRecord('studentProfile', {} as ISlcStudentProfile);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('studentProfile.name is required');
  });

  it('should pass for minimal profile with only name', () => {
    const result = validateEntityRecord('studentProfile', { name: 'Jake' });
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateEntityRecord — attendanceEvent
// ---------------------------------------------------------------------------

describe('validateEntityRecord — attendanceEvent', () => {
  it('should pass for fully populated attendance event', () => {
    const event: ISlcAttendanceEvent = {
      date: '2026-02-14',
      status: 'tardy',
      periodName: '1st Period',
      courseName: 'English',
      courseExternalId: 'course-eng-101',
      notes: 'Arrived 10 minutes late',
      minutesMissed: 10,
      excuseReason: 'traffic',
    };
    const result = validateEntityRecord('attendanceEvent', event);
    expect(result.valid).toBe(true);
  });

  it('should fail when date is missing', () => {
    const result = validateEntityRecord('attendanceEvent', {
      status: 'present',
    } as ISlcAttendanceEvent);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('attendanceEvent.date is required');
  });

  it('should fail when status is missing', () => {
    const result = validateEntityRecord('attendanceEvent', {
      date: '2026-02-14',
    } as ISlcAttendanceEvent);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('attendanceEvent.status is required');
  });

  it('should accept all valid status values including new ones', () => {
    const statuses = [
      'present',
      'absent',
      'tardy',
      'excused',
      'unexcused',
      'partial',
      'field_trip',
    ] as const;
    for (const status of statuses) {
      const result = validateEntityRecord('attendanceEvent', { date: '2026-02-14', status });
      expect(result.valid).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// validateEntityRecord — teacher
// ---------------------------------------------------------------------------

describe('validateEntityRecord — teacher', () => {
  it('should pass for fully populated teacher', () => {
    const teacher: ISlcTeacher = {
      name: 'Mrs. Johnson',
      email: 'johnson@school.edu',
      phone: '555-0123',
      department: 'Mathematics',
      title: 'Mrs.',
      officeHours: 'Mon/Wed 3:30-4:30 PM',
      preferredContact: 'email',
      courseExternalIds: ['course-math-101', 'course-math-201'],
    };
    const result = validateEntityRecord('teacher', teacher);
    expect(result.valid).toBe(true);
  });

  it('should fail when name is missing', () => {
    const result = validateEntityRecord('teacher', {} as ISlcTeacher);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('teacher.name is required');
  });
});

// ---------------------------------------------------------------------------
// validateEntityRecord — courseMaterial
// ---------------------------------------------------------------------------

describe('validateEntityRecord — courseMaterial', () => {
  it('should pass for fully populated course material', () => {
    const material: ISlcCourseMaterial = {
      title: 'Chapter 5 Study Guide',
      courseExternalId: 'course-math-101',
      type: 'study_guide',
      url: 'https://canvas.com/files/789',
      fileName: 'ch5-study-guide.pdf',
      mimeType: 'application/pdf',
      postedAt: '2026-02-10T08:00:00Z',
      description: 'Review guide for the Chapter 5 exam.',
      extractedText: 'Key concepts: derivatives, integrals, limits...',
      fileSize: 1048576,
    };
    const result = validateEntityRecord('courseMaterial', material);
    expect(result.valid).toBe(true);
  });

  it('should fail when title is missing', () => {
    const result = validateEntityRecord('courseMaterial', {
      courseExternalId: 'c1',
      type: 'document',
    } as ISlcCourseMaterial);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('courseMaterial.title is required');
  });

  it('should fail when courseExternalId is missing', () => {
    const result = validateEntityRecord('courseMaterial', {
      title: 'Doc',
      type: 'document',
    } as ISlcCourseMaterial);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('courseMaterial.courseExternalId is required');
  });

  it('should fail when type is missing', () => {
    const result = validateEntityRecord('courseMaterial', {
      title: 'Doc',
      courseExternalId: 'c1',
    } as ISlcCourseMaterial);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('courseMaterial.type is required');
  });

  it('should accept all valid type values including new ones', () => {
    const types = [
      'document',
      'link',
      'syllabus',
      'handout',
      'rubric',
      'study_guide',
      'presentation',
      'video',
      'other',
    ] as const;
    for (const type of types) {
      const result = validateEntityRecord('courseMaterial', {
        title: 'Doc',
        courseExternalId: 'c1',
        type,
      });
      expect(result.valid).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// validateEntityRecord — message
// ---------------------------------------------------------------------------

describe('validateEntityRecord — message', () => {
  it('should pass for fully populated message', () => {
    const message: ISlcMessage = {
      subject: 'Upcoming Parent-Teacher Conference',
      body: '<p>Dear parents, we have conferences scheduled for next week...</p>',
      senderName: 'Mrs. Johnson',
      senderRole: 'teacher',
      sentAt: '2026-02-15T14:00:00Z',
      read: false,
      courseExternalId: 'course-math-101',
      attachments: [
        {
          name: 'schedule.pdf',
          url: 'https://school.com/files/schedule.pdf',
          type: 'application/pdf',
        },
      ],
      recipients: 'Period 3 Parents',
      importance: 'important',
      category: 'event',
    };
    const result = validateEntityRecord('message', message);
    expect(result.valid).toBe(true);
  });

  it('should fail when subject is missing', () => {
    const result = validateEntityRecord('message', {
      body: 'hi',
      senderName: 'A',
      sentAt: '2026-01-01T00:00:00Z',
    } as ISlcMessage);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('message.subject is required');
  });

  it('should fail when body is missing', () => {
    const result = validateEntityRecord('message', {
      subject: 'Hi',
      senderName: 'A',
      sentAt: '2026-01-01T00:00:00Z',
    } as ISlcMessage);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('message.body is required');
  });

  it('should fail when senderName is missing', () => {
    const result = validateEntityRecord('message', {
      subject: 'Hi',
      body: 'text',
      sentAt: '2026-01-01T00:00:00Z',
    } as ISlcMessage);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('message.senderName is required');
  });

  it('should fail when sentAt is missing', () => {
    const result = validateEntityRecord('message', {
      subject: 'Hi',
      body: 'text',
      senderName: 'A',
    } as ISlcMessage);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('message.sentAt is required');
  });

  it('should accept all valid senderRole values including new ones', () => {
    const roles = ['teacher', 'admin', 'counselor', 'system', 'parent', 'student'] as const;
    for (const senderRole of roles) {
      const result = validateEntityRecord('message', {
        subject: 'Hi',
        body: 'x',
        senderName: 'A',
        sentAt: '2026-01-01T00:00:00Z',
        senderRole,
      });
      expect(result.valid).toBe(true);
    }
  });

  it('should accept all valid importance values', () => {
    const levels = ['normal', 'important', 'urgent'] as const;
    for (const importance of levels) {
      const result = validateEntityRecord('message', {
        subject: 'Hi',
        body: 'x',
        senderName: 'A',
        sentAt: '2026-01-01T00:00:00Z',
        importance,
      });
      expect(result.valid).toBe(true);
    }
  });

  it('should accept all valid category values', () => {
    const cats = [
      'academic',
      'administrative',
      'event',
      'reminder',
      'behavioral',
      'other',
    ] as const;
    for (const category of cats) {
      const result = validateEntityRecord('message', {
        subject: 'Hi',
        body: 'x',
        senderName: 'A',
        sentAt: '2026-01-01T00:00:00Z',
        category,
      });
      expect(result.valid).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// validateEntityRecord — academicTerm
// ---------------------------------------------------------------------------

describe('validateEntityRecord — academicTerm', () => {
  it('should pass for fully populated academic term', () => {
    const term: ISlcAcademicTerm = {
      title: 'Spring 2026',
      startDate: '2026-01-13',
      endDate: '2026-05-22',
      type: 'semester',
    };
    const result = validateEntityRecord('academicTerm', term);
    expect(result.valid).toBe(true);
  });

  it('should fail when title is missing', () => {
    const result = validateEntityRecord('academicTerm', {
      startDate: '2026-01-13',
      endDate: '2026-05-22',
    } as ISlcAcademicTerm);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('academicTerm.title is required');
  });

  it('should fail when startDate is missing', () => {
    const result = validateEntityRecord('academicTerm', {
      title: 'Spring',
      endDate: '2026-05-22',
    } as ISlcAcademicTerm);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('academicTerm.startDate is required');
  });

  it('should fail when endDate is missing', () => {
    const result = validateEntityRecord('academicTerm', {
      title: 'Spring',
      startDate: '2026-01-13',
    } as ISlcAcademicTerm);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('academicTerm.endDate is required');
  });
});

// ---------------------------------------------------------------------------
// validateEntityRecord — institution
// ---------------------------------------------------------------------------

describe('validateEntityRecord — institution', () => {
  it('should pass for fully populated institution', () => {
    const inst: ISlcInstitution = {
      name: 'Lake Dallas High School',
      type: 'school',
      address: '500 Swisher Rd, Lake Dallas, TX 75065',
    };
    const result = validateEntityRecord('institution', inst);
    expect(result.valid).toBe(true);
  });

  it('should fail when name is missing', () => {
    const result = validateEntityRecord('institution', {} as ISlcInstitution);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('institution.name is required');
  });
});

// ---------------------------------------------------------------------------
// validateEntityRecord — eventSeries (unchanged shape, just verify)
// ---------------------------------------------------------------------------

describe('validateEntityRecord — eventSeries', () => {
  it('should pass for valid event series', () => {
    const series: ISlcEventSeries = {
      title: 'AP Math Exam',
      category: 'test',
      timezone: 'America/Chicago',
      startsAt: '2026-03-15T09:00:00',
      recurrence: { rrule: 'FREQ=DAILY;COUNT=1' },
    };
    const result = validateEntityRecord('eventSeries', series);
    expect(result.valid).toBe(true);
  });

  it('should fail when title is missing', () => {
    const result = validateEntityRecord('eventSeries', {
      category: 'test',
      timezone: 'America/Chicago',
      startsAt: '2026-03-15T09:00:00',
      recurrence: { rrule: 'FREQ=DAILY;COUNT=1' },
    } as ISlcEventSeries);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('eventSeries.title is required');
  });
});

// ---------------------------------------------------------------------------
// validateEntityRecord — eventOverride (unchanged shape, just verify)
// ---------------------------------------------------------------------------

describe('validateEntityRecord — eventOverride', () => {
  it('should pass for valid event override', () => {
    const override: ISlcEventOverride = {
      seriesExternalId: 'series-1',
      occurrenceStartAt: '2026-03-15T09:00:00',
      op: 'cancel',
    };
    const result = validateEntityRecord('eventOverride', override);
    expect(result.valid).toBe(true);
  });

  it('should fail when seriesExternalId is missing', () => {
    const result = validateEntityRecord('eventOverride', {
      occurrenceStartAt: '2026-03-15T09:00:00',
      op: 'cancel',
    } as ISlcEventOverride);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('eventOverride.seriesExternalId is required');
  });
});

// ---------------------------------------------------------------------------
// validateEntityRecord — unknown entity
// ---------------------------------------------------------------------------

describe('validateEntityRecord — unknown entity', () => {
  it('should fail for unknown entity type', () => {
    const result = validateEntityRecord('foobar' as SlcEntityType, { title: 'test' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Unknown entity type: foobar');
  });
});

// ---------------------------------------------------------------------------
// Type-level compile checks (these compile = types exist correctly)
// ---------------------------------------------------------------------------

describe('type-level checks (compile-time)', () => {
  it('should allow constructing a complete enriched assignment', () => {
    const a: ISlcAssignment = {
      title: 'Essay',
      dueAt: '2026-03-01T23:59:00Z',
      assignedAt: '2026-02-15T08:00:00Z',
      status: 'graded',
      pointsPossible: 100,
      pointsEarned: 92,
      percentScore: 92,
      letterGrade: 'A-',
      description: 'Write a 5-paragraph essay on the causes of WWI.',
      category: 'Essays',
      categoryWeight: 25,
      submittedAt: '2026-02-28T20:00:00Z',
      gradedAt: '2026-03-02T10:00:00Z',
      teacherFeedback: 'Strong thesis, but needs more evidence in paragraph 3.',
      rubricScores: [
        { criterion: 'Thesis', score: 9, possiblePoints: 10, rating: 'Excellent' },
        {
          criterion: 'Evidence',
          score: 7,
          possiblePoints: 10,
          comments: 'Needs more primary sources',
        },
      ],
      isLate: false,
      isMissing: false,
      isExcused: false,
      attachments: [
        {
          name: 'rubric.pdf',
          url: 'https://canvas.com/files/r1',
          type: 'application/pdf',
          size: 102400,
        },
      ],
      submissionType: 'online',
      url: 'https://canvas.com/courses/1/assignments/5',
      courseExternalId: 'course-hist-201',
      termExternalId: 'term-spring-2026',
    };
    expect(a.title).toBe('Essay');
  });

  it('should allow constructing a studentProfile', () => {
    const p: ISlcStudentProfile = {
      name: 'Emma Lewis',
      firstName: 'Emma',
      lastName: 'Lewis',
      studentId: '12345',
      gradeLevel: '10th',
      school: 'Lake Dallas High School',
      district: 'Lake Dallas ISD',
      enrollmentStatus: 'active',
      counselor: 'Ms. Garcia',
      advisor: 'Mr. Thompson',
      homeroom: 'Room 101',
    };
    expect(p.name).toBe('Emma Lewis');
  });

  it('should allow constructing an enriched gradeSnapshot with categories', () => {
    const g: ISlcGradeSnapshot = {
      courseExternalId: 'course-math-101',
      asOfDate: '2026-02-16',
      letterGrade: 'A',
      percentGrade: 95.5,
      gpa: 4.0,
      earnedPoints: 478,
      possiblePoints: 500,
      missingCount: 1,
      lateCount: 2,
      categories: [
        {
          name: 'Tests',
          weight: 40,
          earnedPoints: 185,
          possiblePoints: 200,
          percentScore: 92.5,
          letterGrade: 'A-',
        },
      ],
      trend: 'improving',
      classAverage: 82.3,
      classRank: 'Top 10%',
      teacherComments: 'Outstanding work this quarter.',
    };
    expect(g.percentGrade).toBe(95.5);
  });

  it('should allow constructing an enriched course', () => {
    const c: ISlcCourse = {
      title: 'AP Mathematics',
      courseCode: 'MATH-301',
      subjectArea: 'Mathematics',
      teacherName: 'Mrs. Johnson',
      teacherEmail: 'johnson@school.edu',
      period: '3rd',
      room: 'B204',
      startTime: '09:15',
      endTime: '10:05',
      daysOfWeek: [1, 2, 3, 4, 5],
      termExternalId: 'term-spring-2026',
      description: 'Advanced Placement Mathematics.',
      url: 'https://canvas.com/courses/123',
    };
    expect(c.title).toBe('AP Mathematics');
  });

  it('should allow constructing an enriched teacher', () => {
    const t: ISlcTeacher = {
      name: 'Mrs. Johnson',
      email: 'johnson@school.edu',
      phone: '555-0123',
      department: 'Mathematics',
      title: 'Mrs.',
      officeHours: 'Mon/Wed 3:30-4:30 PM',
      preferredContact: 'email',
      courseExternalIds: ['course-math-101'],
    };
    expect(t.name).toBe('Mrs. Johnson');
  });

  it('should allow constructing an enriched message with attachments', () => {
    const m: ISlcMessage = {
      subject: 'Conference Reminder',
      body: 'Please attend the conference next Tuesday.',
      senderName: 'Mrs. Johnson',
      senderRole: 'teacher',
      sentAt: '2026-02-15T14:00:00Z',
      read: false,
      courseExternalId: 'course-math-101',
      attachments: [{ name: 'schedule.pdf' }],
      recipients: 'All Period 3 Parents',
      importance: 'important',
      category: 'event',
    };
    expect(m.subject).toBe('Conference Reminder');
  });

  it('should allow constructing an enriched attendance event', () => {
    const ae: ISlcAttendanceEvent = {
      date: '2026-02-14',
      status: 'unexcused',
      periodName: '1st Period',
      courseName: 'English',
      courseExternalId: 'course-eng-101',
      notes: 'Absent without notification',
      minutesMissed: 55,
      excuseReason: undefined,
    };
    expect(ae.status).toBe('unexcused');
  });

  it('should allow constructing enriched course material with extracted text', () => {
    const cm: ISlcCourseMaterial = {
      title: 'Unit 5 Study Guide',
      courseExternalId: 'course-math-101',
      type: 'study_guide',
      url: 'https://canvas.com/files/789',
      fileName: 'study-guide-unit5.pdf',
      mimeType: 'application/pdf',
      postedAt: '2026-02-10T08:00:00Z',
      description: 'Covers derivatives and integrals.',
      extractedText: 'Key Concepts: 1. Derivatives measure rate of change...',
      fileSize: 2097152,
    };
    expect(cm.type).toBe('study_guide');
  });
});
