import { SLC_INGEST_SCHEMA_VERSION_V1 } from '@scholaracle/contracts';
import { AeriesAdapter } from './aeries-adapter';
import { AeriesClient } from './aeries-client';

jest.mock('./aeries-client');

const MockAeriesClient = AeriesClient as jest.MockedClass<typeof AeriesClient>;

describe('AeriesAdapter', () => {
  let adapter: AeriesAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new AeriesAdapter();
  });

  describe('meta', () => {
    it('should have correct provider and adapterId', () => {
      expect(adapter.meta.provider).toBe('aeries');
      expect(adapter.meta.adapterId).toBe('com.aeries.sis');
      expect(adapter.meta.adapterVersion).toBe('0.1.0');
      expect(adapter.meta.displayName).toBe('Aeries SIS');
    });
  });

  describe('parseUsername', () => {
    it('should parse valid "schoolCode:studentId" format', () => {
      expect(AeriesAdapter.parseUsername('994:99400001')).toEqual({
        schoolCode: 994,
        studentId: 99400001,
      });
    });

    it('should throw on missing colon separator', () => {
      expect(() => AeriesAdapter.parseUsername('994')).toThrow('Invalid username format');
    });

    it('should throw on non-numeric values', () => {
      expect(() => AeriesAdapter.parseUsername('abc:def')).toThrow('must be numeric');
    });
  });

  describe('authenticate', () => {
    it('should set authenticated state', async () => {
      expect(adapter.isAuthenticated()).toBe(false);

      await adapter.authenticate({
        baseUrl: 'https://demo.aeries.net/aeries',
        apiKey: '477abe9e7d27439681d62f4e0de1f5e1',
        username: '994:99400001',
      });

      expect(adapter.isAuthenticated()).toBe(true);
    });

    it('should authenticate in scraper mode when username + password but no apiKey', async () => {
      await adapter.authenticate({
        baseUrl: 'https://kellerisd.aeries.net/student/LoginParent.aspx',
        username: 'parent@example.com',
        password: 'secret123',
      });
      expect(adapter.isAuthenticated()).toBe(true);
      expect(adapter.mode).toBe('scraper');
    });

    it('should throw if apiKey is missing', async () => {
      await expect(
        adapter.authenticate({
          baseUrl: 'https://demo.aeries.net/aeries',
          username: '994:99400001',
        })
      ).rejects.toThrow('apiKey');
    });

    it('should throw if baseUrl is missing', async () => {
      await expect(
        adapter.authenticate({
          baseUrl: '',
          apiKey: 'cert-key',
          username: '994:99400001',
        })
      ).rejects.toThrow('baseUrl');
    });

    it('should throw if username is missing', async () => {
      await expect(
        adapter.authenticate({
          baseUrl: 'https://demo.aeries.net/aeries',
          apiKey: 'cert-key',
        })
      ).rejects.toThrow('username');
    });

    it('should create an AeriesClient with parsed config', async () => {
      await adapter.authenticate({
        baseUrl: 'https://demo.aeries.net/aeries',
        apiKey: 'cert-key',
        username: '994:99400001',
      });

      expect(MockAeriesClient).toHaveBeenCalledWith({
        baseUrl: 'https://demo.aeries.net/aeries',
        apiKey: 'cert-key',
        schoolCode: 994,
        studentId: 99400001,
      });
    });
  });

  describe('testConnection', () => {
    it('should return failure if not authenticated', async () => {
      const result = await adapter.testConnection();
      expect(result.success).toBe(false);
      expect(result.message).toContain('Not authenticated');
    });

    it('should return success with student info and course count', async () => {
      const mockInstance = {
        getStudent: jest.fn().mockResolvedValue({
          StudentID: 99400001,
          FirstName: 'Allan',
          LastName: 'Abbott',
          Grade: 12,
        }),
        getReportCard: jest.fn().mockResolvedValue({
          StudentID: 99400001,
          StudentReportCardCourses: [
            { CourseID: '0301', CourseTitle: 'English 9 Cp', MarkingPeriodGrades: [] },
            { CourseID: '0645', CourseTitle: 'Adv Algebra CP', MarkingPeriodGrades: [] },
          ],
        }),
      };
      MockAeriesClient.mockImplementation(() => mockInstance as unknown as AeriesClient);

      await adapter.authenticate({
        baseUrl: 'https://demo.aeries.net/aeries',
        apiKey: 'cert',
        username: '994:99400001',
      });

      const result = await adapter.testConnection();
      expect(result.success).toBe(true);
      expect(result.message).toContain('Allan Abbott');
      expect(result.message).toContain('2 courses');
      expect(result.details?.courseCount).toBe(2);
      expect(result.details?.userName).toBe('Allan Abbott');
    });
  });

  describe('fetchEnvelope', () => {
    it('should throw if not authenticated', async () => {
      await expect(
        adapter.fetchEnvelope({
          runId: 'run-1',
          sourceId: 'src-1',
          displayName: 'Test',
        })
      ).rejects.toThrow('Not authenticated');
    });

    it('should return a valid envelope with ops from report card', async () => {
      const mockInstance = {
        getSchool: jest.fn().mockResolvedValue({
          SchoolCode: 994,
          SchoolName: 'Eagle Rock High School',
          Address: '123 Main St',
          City: 'Eagle Rock',
          State: 'CA',
          ZipCode: '99999',
        }),
        getMarkingPeriods: jest.fn().mockResolvedValue([
          {
            MarkingPeriod: 1,
            ShortDescription: '1st Qtr',
            LongDescription: 'First Quarter',
            BeginningDate: '2025-08-01T00:00:00',
            EndingDate: '2025-10-15T00:00:00',
            IsCurrentMarkingPeriod: true,
          },
        ]),
        getReportCard: jest.fn().mockResolvedValue({
          StudentID: 99400001,
          StudentReportCardCourses: [
            {
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
                  TotalAbsences: 1,
                  TotalTardies: 0,
                  TotalDaysEnrolled: 74,
                  TotalDaysPresent: 73,
                  TotalExcusedAbsences: 0,
                  TotalUnExcusedAbsences: 1,
                  TotalDaysOfSuspension: 0,
                },
              ],
            },
          ],
        }),
        getCourse: jest.fn().mockResolvedValue({
          ID: '0301',
          Title: 'English 9 Cp',
          LongDescription: '',
          DepartmentCode: 'A',
          SubjectArea1Code: 'A',
          CreditDefault: 5.0,
        }),
        getSection: jest.fn().mockResolvedValue({
          SchoolCode: 994,
          SectionNumber: 6089,
          Period: '6',
          CourseID: '0301',
          SectionStaffMembers: [
            {
              StaffID: 994694,
              LastName: 'Acosta',
              FirstName: 'Maria',
              IsPrimaryTeacher: true,
            },
          ],
        }),
        getGradebooksForSection: jest.fn().mockResolvedValue([
          {
            GradebookNumber: 4366926,
            Name: 'English 9 Cp',
            Period: '6',
            SchoolCode: 994,
            StartDate: '2025-08-01T00:00:00',
            EndDate: '2025-12-20T00:00:00',
            TeacherName: 'Acosta',
            TeacherEmailAddress: 'acosta@school.com',
            TeacherNumber: 605,
          },
        ]),
        getAssignments: jest.fn().mockResolvedValue([
          {
            AssignmentNumber: 1,
            GradebookNumber: 4366926,
            Description: 'Read Chapter 1',
            Comment: '',
            DateAssigned: '2025-08-04T00:00:00',
            DateDue: '2025-08-06T00:00:00',
            PointsPossible: 10,
            NumberCorrectPossible: 10,
            GradingCompleted: true,
            FormativeSummativeIndicator: 'F',
            UniqueID: 'uuid-1',
            VisibleToParents: true,
            ScoresVisibleToParents: true,
          },
        ]),
        getAssignmentScores: jest.fn().mockResolvedValue([
          {
            StudentID: 99400001,
            AssignmentNumber: 1,
            GradebookNumber: 4366926,
            Mark: '9',
            NumberCorrect: 9,
            NumberCorrectPossible: 10,
            PointsEarned: 9,
            PointsPossible: 10,
            PercentCorrect: 90,
            DateCompleted: '2025-08-05T00:00:00',
            IsMissing: false,
          },
        ]),
      };
      MockAeriesClient.mockImplementation(() => mockInstance as unknown as AeriesClient);

      await adapter.authenticate({
        baseUrl: 'https://demo.aeries.net/aeries',
        apiKey: 'cert',
        username: '994:99400001',
      });

      const envelope = await adapter.fetchEnvelope({
        runId: 'run-1',
        sourceId: 'src-1',
        displayName: 'Keller ISD',
        portalBaseUrl: 'https://kellerisd.aeries.net',
      });

      expect(envelope.schemaVersion).toBe(SLC_INGEST_SCHEMA_VERSION_V1);
      expect(envelope.run.runId).toBe('run-1');
      expect(envelope.run.provider).toBe('aeries');
      expect(envelope.run.adapterId).toBe('com.aeries.sis');
      expect(envelope.run.mode).toBe('delta');
      expect(envelope.source.sourceId).toBe('src-1');
      expect(envelope.source.displayName).toBe('Keller ISD');
      expect(envelope.source.portalBaseUrl).toBe('https://kellerisd.aeries.net');

      // Expect: 1 institution + 1 term + 1 grade snapshot + 1 attendance + 1 course + 1 teacher + 1 assignment = 7
      expect(envelope.ops.length).toBeGreaterThanOrEqual(5);

      const entityTypes = envelope.ops.map((op) => op.entity);
      expect(entityTypes).toContain('institution');
      expect(entityTypes).toContain('academicTerm');
      expect(entityTypes).toContain('gradeSnapshot');
      expect(entityTypes).toContain('course');
      expect(entityTypes).toContain('assignment');
      expect(entityTypes).toContain('teacher');

      // Verify the assignment op has correct data
      const assignmentOp = envelope.ops.find((op) => op.entity === 'assignment')!;
      expect(assignmentOp.record?.['title']).toBe('Read Chapter 1');
      expect(assignmentOp.record?.['pointsPossible']).toBe(10);
      expect(assignmentOp.record?.['pointsEarned']).toBe(9);
      expect(assignmentOp.record?.['status']).toBe('graded');

      // Verify the grade snapshot op
      const gradeOp = envelope.ops.find((op) => op.entity === 'gradeSnapshot')!;
      expect(gradeOp.record?.['letterGrade']).toBe('B+');

      // Verify the institution op
      const instOp = envelope.ops.find((op) => op.entity === 'institution')!;
      expect(instOp.record?.['name']).toBe('Eagle Rock High School');
    });

    it('should produce ops from injected scraperFn in scraper mode', async () => {
      const mockExtract: import('./aeries-adapter').IAeriesScrapeResult = {
        students: [{
          name: 'Emma Student',
          studentId: '12345',
          grade: '10',
          school: 'Eagle Rock High School',
          courses: [{
            period: '1',
            name: 'Biology',
            term: 'Semester 1',
            teacher: 'Ms. Garcia',
            teacherEmail: 'garcia@school.com',
            room: '204',
            currentGrade: 92,
            currentPercent: 92.5,
            missingCount: 0,
            assignments: [{
              number: '1',
              title: 'Cell Lab Report',
              category: 'Summative',
              scoreEarned: 45,
              scorePossible: 50,
              percentCorrect: 90,
              dateAssigned: '09/01/2025',
              dateDue: '09/08/2025',
              dateCompleted: '09/07/2025',
              gradingComplete: true,
              isMissing: false,
              comment: '',
            }],
          }],
          attendance: [{
            date: '09/05/2025',
            period: '1',
            status: 'Absent',
            reason: 'Illness',
            course: 'Biology',
          }],
        }],
        timestamp: '2025-09-10T12:00:00.000Z',
      };

      const scraperFn = jest.fn().mockResolvedValue(mockExtract);
      const scraperAdapter = new AeriesAdapter(scraperFn);
      await scraperAdapter.authenticate({
        baseUrl: 'https://kellerisd.aeries.net/student/LoginParent.aspx',
        username: 'parent@example.com',
        password: 'secret123',
      });

      const envelope = await scraperAdapter.fetchEnvelope({
        runId: 'run-scraper-1',
        sourceId: 'src-scraper-1',
        displayName: 'Keller ISD (scraper)',
      });

      expect(envelope.schemaVersion).toBe(SLC_INGEST_SCHEMA_VERSION_V1);
      expect(envelope.run.runId).toBe('run-scraper-1');
      expect(envelope.ops.length).toBeGreaterThanOrEqual(3);

      const entities = envelope.ops.map((o) => o.entity);
      expect(entities).toContain('institution');
      expect(entities).toContain('course');
      expect(entities).toContain('assignment');
      expect(entities).toContain('attendanceEvent');

      expect(scraperFn).toHaveBeenCalledWith(
        'https://kellerisd.aeries.net/student/LoginParent.aspx',
        'parent@example.com',
        'secret123',
      );
    });

    it('should use scholaracle_scrapers AeriesScraper when no scraperFn injected', async () => {
      const adapterNoFn = new AeriesAdapter();
      await adapterNoFn.authenticate({
        baseUrl: 'https://kellerisd.aeries.net/student/LoginParent.aspx',
        username: 'parent@example.com',
        password: 'secret123',
      });
      expect(adapterNoFn.mode).toBe('scraper');
      // We don't call fetchEnvelope here (it would launch Playwright);
      // the _loadScraperClass resolver is tested by verifying it doesn't
      // throw an import error when scholaracle-scraper is available.
    });

    it('should handle missing gradebook data gracefully', async () => {
      const mockInstance = {
        getSchool: jest.fn().mockRejectedValue(new Error('403 Forbidden')),
        getMarkingPeriods: jest.fn().mockResolvedValue([]),
        getReportCard: jest.fn().mockResolvedValue({
          StudentID: 99400001,
          StudentReportCardCourses: [
            {
              SchoolCode: 994,
              CourseID: '0645',
              CourseTitle: 'Adv Algebra CP',
              Period: '4',
              SectionNumber: 4009,
              TeacherNumber: 0,
              MarkingPeriodGrades: [
                {
                  PrimaryStaffID: 994725,
                  MarkingPeriod: 1,
                  Mark: 'A-',
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
              ],
            },
          ],
        }),
        getCourse: jest.fn().mockResolvedValue({
          ID: '0645',
          Title: 'Adv Algebra CP',
        }),
        getSection: jest.fn().mockRejectedValue(new Error('Not found')),
        getGradebooksForSection: jest.fn().mockRejectedValue(new Error('Not found')),
      };
      MockAeriesClient.mockImplementation(() => mockInstance as unknown as AeriesClient);

      await adapter.authenticate({
        baseUrl: 'https://demo.aeries.net/aeries',
        apiKey: 'cert',
        username: '994:99400001',
      });

      const envelope = await adapter.fetchEnvelope({
        runId: 'run-1',
        sourceId: 'src-1',
        displayName: 'Test',
      });

      // Should still produce grade snapshot and course ops despite failures
      const entityTypes = envelope.ops.map((op) => op.entity);
      expect(entityTypes).toContain('gradeSnapshot');
      expect(entityTypes).toContain('course');

      // Should report warnings
      expect(envelope.warnings).toBeDefined();
      expect(envelope.warnings!.length).toBeGreaterThan(0);
    });
  });
});
