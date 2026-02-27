import {
  mapAeriesAssignmentStatus,
  transformAssignmentToOp,
  transformReportCardToGradeOps,
  transformReportCardAttendanceToOps,
  transformCourseToOp,
  transformMarkingPeriodToOp,
  transformSchoolToInstitutionOp,
  transformSectionToTeacherOp,
} from './aeries-transformer';
import type {
  IAeriesAssignment,
  IAeriesAssignmentScore,
  IAeriesReportCardCourse,
  IAeriesCourse,
  IAeriesSection,
  IAeriesMarkingPeriod,
  IAeriesSchool,
} from './aeries-client';

const BASE_KEY = {
  provider: 'aeries',
  adapterId: 'com.aeries.sis',
  studentExternalId: 'self',
  institutionExternalId: 'aeries-instance',
};

describe('mapAeriesAssignmentStatus', () => {
  const makeAssignment = (overrides?: Partial<IAeriesAssignment>): IAeriesAssignment =>
    ({
      AssignmentNumber: 1,
      GradebookNumber: 100,
      Description: 'HW1',
      DateDue: '2025-09-01T00:00:00',
      PointsPossible: 10,
      GradingCompleted: false,
      ...overrides,
    }) as IAeriesAssignment;

  it('should return "missing" when score has IsMissing=true', () => {
    const score = { IsMissing: true } as IAeriesAssignmentScore;
    expect(mapAeriesAssignmentStatus(makeAssignment(), score)).toBe('missing');
  });

  it('should return "graded" when points earned > 0', () => {
    const score = { PointsEarned: 8, IsMissing: false } as IAeriesAssignmentScore;
    expect(mapAeriesAssignmentStatus(makeAssignment(), score)).toBe('graded');
  });

  it('should return "graded" when mark is non-empty', () => {
    const score = { Mark: 'A', PointsEarned: 0, IsMissing: false } as IAeriesAssignmentScore;
    expect(mapAeriesAssignmentStatus(makeAssignment(), score)).toBe('graded');
  });

  it('should return "submitted" when date completed is set', () => {
    const score = {
      Mark: '',
      PointsEarned: 0,
      DateCompleted: '2025-09-01',
      IsMissing: false,
    } as IAeriesAssignmentScore;
    expect(mapAeriesAssignmentStatus(makeAssignment(), score)).toBe('submitted');
  });

  it('should return "missing" when grading completed but no score', () => {
    expect(mapAeriesAssignmentStatus(makeAssignment({ GradingCompleted: true }), undefined)).toBe(
      'missing'
    );
  });

  it('should return "unknown" with no score and grading not completed', () => {
    expect(mapAeriesAssignmentStatus(makeAssignment(), undefined)).toBe('unknown');
  });
});

describe('transformAssignmentToOp', () => {
  it('should transform an assignment with score into a delta op', () => {
    const assignment: IAeriesAssignment = {
      AssignmentNumber: 5,
      GradebookNumber: 100,
      Description: 'Read Chapter 2',
      Comment: '',
      DateAssigned: '2025-09-01T00:00:00',
      DateDue: '2025-09-05T00:00:00',
      PointsPossible: 20,
      NumberCorrectPossible: 20,
      GradingCompleted: true,
      FormativeSummativeIndicator: 'F',
      UniqueID: 'uid-5',
      VisibleToParents: true,
      ScoresVisibleToParents: true,
    };

    const score: IAeriesAssignmentScore = {
      StudentID: 99400001,
      AssignmentNumber: 5,
      GradebookNumber: 100,
      Mark: '18',
      NumberCorrect: 18,
      NumberCorrectPossible: 20,
      PointsEarned: 18,
      PointsPossible: 20,
      PercentCorrect: 90,
      DateCompleted: '2025-09-04T00:00:00',
      IsMissing: false,
    };

    const op = transformAssignmentToOp(assignment, score, '0301', BASE_KEY);

    expect(op.op).toBe('upsert');
    expect(op.entity).toBe('assignment');
    expect(op.key.externalId).toBe('aeries-assignment-100-5');
    expect(op.key.courseExternalId).toBe('aeries-course-0301');
    expect(op.record!.title).toBe('Read Chapter 2');
    expect(op.record!.pointsPossible).toBe(20);
    expect(op.record!.pointsEarned).toBe(18);
    expect(op.record!.status).toBe('graded');
  });
});

describe('transformReportCardToGradeOps', () => {
  it('should create grade snapshot ops for each marking period with a mark', () => {
    const course: IAeriesReportCardCourse = {
      SchoolCode: 994,
      CourseID: '0301',
      CourseTitle: 'English 9 Cp',
      Period: '6',
      SectionNumber: 6089,
      TeacherNumber: 0,
      MarkingPeriodGrades: [
        {
          PrimaryStaffID: 994694,
          MarkingPeriod: 1,
          Mark: 'B+',
          Credit: 5.0,
          Comment1Code: '',
          Comment2Code: '',
          Comment3Code: '',
          CitizenshipCode: '',
          WorkHabitsCode: '',
          TotalAbsences: 0,
          TotalTardies: 0,
          TotalDaysEnrolled: 74,
          TotalDaysPresent: 74,
          TotalExcusedAbsences: 0,
          TotalUnExcusedAbsences: 0,
          TotalDaysOfSuspension: 0,
        },
        {
          PrimaryStaffID: 994694,
          MarkingPeriod: 2,
          Mark: '',
          Credit: 0,
          Comment1Code: '',
          Comment2Code: '',
          Comment3Code: '',
          CitizenshipCode: '',
          WorkHabitsCode: '',
          TotalAbsences: 0,
          TotalTardies: 0,
          TotalDaysEnrolled: 0,
          TotalDaysPresent: 0,
          TotalExcusedAbsences: 0,
          TotalUnExcusedAbsences: 0,
          TotalDaysOfSuspension: 0,
        },
      ],
    };

    const ops = transformReportCardToGradeOps(course, BASE_KEY);

    // Only MP1 has a mark, MP2 is empty
    expect(ops).toHaveLength(1);
    expect(ops[0]!.entity).toBe('gradeSnapshot');
    expect(ops[0]!.record!.letterGrade).toBe('B+');
    expect(ops[0]!.key.courseExternalId).toBe('aeries-course-0301');
    expect(ops[0]!.key.termExternalId).toBe('aeries-term-mp1');
  });
});

describe('transformReportCardAttendanceToOps', () => {
  it('should create attendance ops for absences', () => {
    const course: IAeriesReportCardCourse = {
      SchoolCode: 994,
      CourseID: '0301',
      CourseTitle: 'English 9 Cp',
      Period: '6',
      SectionNumber: 6089,
      TeacherNumber: 0,
      MarkingPeriodGrades: [
        {
          PrimaryStaffID: 994694,
          MarkingPeriod: 1,
          Mark: 'B+',
          Credit: 5.0,
          Comment1Code: '',
          Comment2Code: '',
          Comment3Code: '',
          CitizenshipCode: '',
          WorkHabitsCode: '',
          TotalAbsences: 2,
          TotalTardies: 1,
          TotalDaysEnrolled: 74,
          TotalDaysPresent: 72,
          TotalExcusedAbsences: 1,
          TotalUnExcusedAbsences: 1,
          TotalDaysOfSuspension: 0,
        },
      ],
    };

    const ops = transformReportCardAttendanceToOps(course, BASE_KEY);
    expect(ops.length).toBeGreaterThan(0);
    expect(ops[0]!.entity).toBe('attendanceEvent');
    expect(ops[0]!.record!.status).toBe('excused');
  });

  it('should create tardy ops when only tardies exist', () => {
    const course: IAeriesReportCardCourse = {
      SchoolCode: 994,
      CourseID: '0301',
      CourseTitle: 'English 9 Cp',
      Period: '6',
      SectionNumber: 6089,
      TeacherNumber: 0,
      MarkingPeriodGrades: [
        {
          PrimaryStaffID: 994694,
          MarkingPeriod: 1,
          Mark: 'A',
          Credit: 5.0,
          Comment1Code: '',
          Comment2Code: '',
          Comment3Code: '',
          CitizenshipCode: '',
          WorkHabitsCode: '',
          TotalAbsences: 0,
          TotalTardies: 3,
          TotalDaysEnrolled: 74,
          TotalDaysPresent: 74,
          TotalExcusedAbsences: 0,
          TotalUnExcusedAbsences: 0,
          TotalDaysOfSuspension: 0,
        },
      ],
    };

    const ops = transformReportCardAttendanceToOps(course, BASE_KEY);
    expect(ops).toHaveLength(1);
    expect(ops[0]!.record!.status).toBe('tardy');
  });
});

describe('transformCourseToOp', () => {
  it('should transform a course with section teacher info', () => {
    const course: IAeriesCourse = {
      ID: '0301',
      Title: 'English 9 Cp',
      LongDescription: '',
      DepartmentCode: 'A',
      SubjectArea1Code: 'A',
      SubjectArea2Code: '',
      CreditDefault: 5.0,
      TermTypeCode: 'Y',
      LowGrade: 9,
      HighGrade: 12,
      NonAcademicOrHonorsCode: '',
      PhysicalEducationIndicator: false,
    };

    const section: IAeriesSection = {
      SchoolCode: 994,
      SectionNumber: 6089,
      Period: '6',
      Semester: 'Y',
      CourseID: '0301',
      SectionStaffMembers: [
        {
          StaffID: 994694,
          LastName: 'Acosta',
          FirstName: 'Maria',
          IsPrimaryTeacher: true,
        },
      ],
      Room: '201',
      TotalStudents: 30,
    };

    const op = transformCourseToOp(course, section, BASE_KEY);

    expect(op.entity).toBe('course');
    expect(op.key.externalId).toBe('aeries-course-0301');
    expect(op.record!.courseCode).toBe('0301');
    expect(op.record!.teacherName).toBe('Maria Acosta');
  });
});

describe('transformMarkingPeriodToOp', () => {
  it('should transform a marking period into an academic term op', () => {
    const mp: IAeriesMarkingPeriod = {
      BeginningDate: '2025-08-01T00:00:00',
      EndingDate: '2025-10-15T00:00:00',
      StateReportingCode: '',
      MarkingPeriod: 1,
      ShortDescription: '1st Qtr',
      LongDescription: 'First Quarter',
      IsCurrentMarkingPeriod: true,
    };

    const op = transformMarkingPeriodToOp(mp, BASE_KEY);

    expect(op.entity).toBe('academicTerm');
    expect(op.key.externalId).toBe('aeries-term-mp1');
    expect(op.record!.title).toBe('First Quarter');
    expect(op.record!.startDate).toBe('2025-08-01');
    expect(op.record!.endDate).toBe('2025-10-15');
    expect(op.record!.type).toBe('quarter');
  });

  it('should infer semester type', () => {
    const mp: IAeriesMarkingPeriod = {
      BeginningDate: '2025-08-01T00:00:00',
      EndingDate: '2025-12-20T00:00:00',
      StateReportingCode: '',
      MarkingPeriod: 2,
      ShortDescription: '1st Sem',
      LongDescription: 'First Semester',
      IsCurrentMarkingPeriod: false,
    };

    const op = transformMarkingPeriodToOp(mp, BASE_KEY);
    expect(op.record!.type).toBe('semester');
  });
});

describe('transformSchoolToInstitutionOp', () => {
  it('should transform school info into an institution op', () => {
    const school: IAeriesSchool = {
      SchoolCode: 994,
      SchoolName: 'Eagle Rock High School',
      Address: '123 Main St',
      City: 'Eagle Rock',
      State: 'CA',
      ZipCode: '99999',
      PrincipalName: 'Dr. Smith',
      PrincipalEmailAddress: 'smith@school.com',
      AttendancePeriod: '',
    };

    const op = transformSchoolToInstitutionOp(school, BASE_KEY);

    expect(op.entity).toBe('institution');
    expect(op.key.externalId).toBe('aeries-school-994');
    expect(op.record!.name).toBe('Eagle Rock High School');
    expect(op.record!.type).toBe('school');
    expect(op.record!.address).toContain('Eagle Rock');
  });
});

describe('transformSectionToTeacherOp', () => {
  it('should return teacher op for section with primary teacher', () => {
    const section: IAeriesSection = {
      SchoolCode: 994,
      SectionNumber: 6089,
      Period: '6',
      Semester: 'Y',
      CourseID: '0301',
      SectionStaffMembers: [
        {
          StaffID: 994694,
          LastName: 'Acosta',
          FirstName: 'Maria',
          IsPrimaryTeacher: true,
        },
        {
          StaffID: 994695,
          LastName: 'Jones',
          FirstName: 'Bob',
          IsPrimaryTeacher: false,
        },
      ],
      Room: '201',
      TotalStudents: 30,
    };

    const op = transformSectionToTeacherOp(section, BASE_KEY);

    expect(op).not.toBeNull();
    expect(op!.entity).toBe('teacher');
    expect(op!.record!.name).toBe('Maria Acosta');
    expect(op!.key.externalId).toBe('aeries-teacher-994694');
  });

  it('should return null for section with no primary teacher', () => {
    const section: IAeriesSection = {
      SchoolCode: 994,
      SectionNumber: 6089,
      Period: '6',
      Semester: 'Y',
      CourseID: '0301',
      SectionStaffMembers: [],
      Room: '201',
      TotalStudents: 30,
    };

    expect(transformSectionToTeacherOp(section, BASE_KEY)).toBeNull();
  });
});
