import type { IAeriesFullExtract } from '../extractors/aeries/aeries-extractors';
import { SyncError, STUDENT_MISMATCH_MESSAGE } from './types';
import { narrowStudentExtractForTransform } from './narrowStudentExtract';

const NOW = '2026-01-15T10:00:00.000Z';

function twoStudentExtract(): IAeriesFullExtract {
  return {
    timestamp: NOW,
    students: [
      {
        name: 'Ann Example',
        studentId: '728001',
        grade: '10',
        school: 'North High School',
        courses: [
          {
            period: '1',
            name: 'Spanish 2 a',
            term: 'Quarter 2',
            teacher: 'Rivera',
            teacherEmail: '',
            room: 'S108',
            currentGrade: 92,
            currentPercent: 92,
            missingCount: 0,
            assignments: [],
          },
        ],
        attendance: [],
      },
      {
        name: 'Ben Example',
        studentId: '826002',
        grade: '8',
        school: 'West Middle School',
        courses: [
          {
            period: '7',
            name: 'Math 8',
            term: 'Quarter 2',
            teacher: 'Lindqvist',
            teacherEmail: '',
            room: 'B12',
            currentGrade: 100,
            currentPercent: 100,
            missingCount: 0,
            assignments: [],
          },
        ],
        attendance: [],
      },
    ],
  };
}

describe('narrowStudentExtractForTransform', () => {
  it('returns the raw extract unchanged when studentNameHint is absent', () => {
    const raw = twoStudentExtract() as unknown as Record<string, unknown>;
    expect(narrowStudentExtractForTransform(raw)).toBe(raw);
  });

  it('narrows to one student when hint matches and leaves original raw intact', () => {
    const extract = twoStudentExtract();
    const raw = extract as unknown as Record<string, unknown>;
    const narrowed = narrowStudentExtractForTransform(raw, 'Ben Example');
    const students = narrowed['students'] as IAeriesFullExtract['students'];
    expect(students).toHaveLength(1);
    expect(students[0]?.name).toBe('Ben Example');
    expect((raw['students'] as IAeriesFullExtract['students']).length).toBe(2);
  });

  it('throws STUDENT_MISMATCH when hint matches no portal student', () => {
    const raw = twoStudentExtract() as unknown as Record<string, unknown>;
    let err: unknown;
    try {
      narrowStudentExtractForTransform(raw, 'Nobody Example');
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(SyncError);
    expect((err as SyncError).phase).toBe('STUDENT_MISMATCH');
    expect((err as SyncError).message).toBe(STUDENT_MISMATCH_MESSAGE);
  });
});
