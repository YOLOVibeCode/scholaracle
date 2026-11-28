import {
  mergeCourses,
  teachersAgree,
  titleSimilarity,
  type ISourceCourse,
} from './course-reconciler';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSource(
  overrides: Partial<ISourceCourse> & Pick<ISourceCourse, 'title' | 'provider'>
): ISourceCourse {
  return {
    externalId: `ext-${overrides.provider}-${overrides.title.slice(0, 8)}`,
    sourceId: `src-${overrides.provider}`,
    courseCode: undefined,
    ...overrides,
  };
}

/** One class as the gradebook names it and as the school's class feed names it. */
const sisBand = makeSource({
  provider: 'aeries',
  title: 'CHAMBER WINDS',
  teacherName: 'Rivera, Ana',
  period: '2',
  grade: 96,
  letterGrade: 'A',
});
const feedBand = makeSource({
  provider: 'parentsquare',
  title: 'Jazz Band',
  teacherName: 'Ana Rivera',
  period: '2',
});
const pottery = makeSource({
  provider: 'canvas',
  title: 'Pottery',
  teacherName: 'Tomas Okafor',
  period: '4',
});

// ---------------------------------------------------------------------------
// mergeCourses
// ---------------------------------------------------------------------------

describe('mergeCourses', () => {
  it('should return empty array for empty input', () => {
    expect(mergeCourses([])).toEqual([]);
  });

  it('should pass through single-source courses as single-source groups', () => {
    const courses: ISourceCourse[] = [
      makeSource({ provider: 'canvas', title: 'AP Biology', teacherName: 'Dr. Smith' }),
      makeSource({ provider: 'canvas', title: 'Algebra 2', teacherName: 'Ms. Jones' }),
    ];

    const merged = mergeCourses(courses);

    expect(merged).toHaveLength(2);
    for (const m of merged) {
      expect(m.sources).toHaveLength(1);
    }
  });

  it('should merge "AP Biology" from Canvas and "AP BIOLOGY" from Skyward', () => {
    const courses: ISourceCourse[] = [
      makeSource({
        provider: 'canvas',
        title: 'AP Biology',
        teacherName: 'Dr. Smith',
        grade: 92,
        letterGrade: 'A',
      }),
      makeSource({
        provider: 'skyward',
        title: 'AP BIOLOGY',
        teacherName: 'Dr. Smith',
        grade: 88,
        letterGrade: 'B+',
      }),
    ];

    const merged = mergeCourses(courses);

    expect(merged).toHaveLength(1);
    const bio = merged[0]!;
    expect(bio.sources).toHaveLength(2);
    expect(bio.isAP).toBe(true);
    expect(bio.subject.area).toBe('science');
    expect(bio.subject.subArea).toBe('biology');
    expect(bio.normalizedTitle).toBe('AP Biology');
    expect(bio.sources.map((s) => s.provider).sort()).toEqual(['canvas', 'skyward']);
  });

  it('should NOT merge different courses (AP Biology vs AP Chemistry)', () => {
    const courses: ISourceCourse[] = [
      makeSource({ provider: 'canvas', title: 'AP Biology' }),
      makeSource({ provider: 'canvas', title: 'AP Chemistry' }),
    ];

    const merged = mergeCourses(courses);

    expect(merged).toHaveLength(2);
    const subjects = merged.map((m) => m.subject.subArea).sort();
    expect(subjects).toEqual(['biology', 'chemistry']);
  });

  it('should merge when only period differs but teacher is the same', () => {
    const courses: ISourceCourse[] = [
      makeSource({
        provider: 'canvas',
        title: 'Physics - Period 3',
        teacherName: 'Dr. Newton',
      }),
      makeSource({
        provider: 'skyward',
        title: 'PHYSICS',
        teacherName: 'Dr. Newton',
        period: '5',
      }),
    ];

    const merged = mergeCourses(courses);

    expect(merged).toHaveLength(1);
    expect(merged[0]!.sources).toHaveLength(2);
    expect(merged[0]!.teacherName).toBe('Dr. Newton');
  });

  it('should prioritize Skyward (SIS) grade over Canvas (LMS) even when Canvas grade is higher', () => {
    const courses: ISourceCourse[] = [
      makeSource({
        provider: 'canvas',
        title: 'Algebra 1',
        teacherName: 'Noah Chang',
        period: 'p04',
        grade: 85.84, // Higher Canvas grade
      }),
      makeSource({
        provider: 'skyward',
        title: 'ALGEBRA 1',
        teacherName: 'Noah Chang',
        period: '4',
        grade: 76, // Lower Skyward grade (but authoritative)
        letterGrade: 'C',
      }),
    ];

    const merged = mergeCourses(courses);

    expect(merged).toHaveLength(1);
    const algebra = merged[0]!;
    expect(algebra.sources).toHaveLength(2);
    expect(algebra.bestGrade).toBe(76); // Skyward grade takes precedence
    expect(algebra.bestLetterGrade).toBe('C');
    expect(algebra.sources.find((s) => s.provider === 'skyward')?.sourceId).toBe(
      algebra.primarySourceId
    );
  });

  it('should split when both teacher AND period differ', () => {
    const courses: ISourceCourse[] = [
      makeSource({
        provider: 'canvas',
        title: 'AP Biology',
        teacherName: 'Dr. Smith',
        period: '3',
      }),
      makeSource({
        provider: 'skyward',
        title: 'AP BIOLOGY',
        teacherName: 'Ms. Chen',
        period: '6',
      }),
    ];

    const merged = mergeCourses(courses);

    expect(merged).toHaveLength(2);
    expect(merged[0]!.mergedId).not.toBe(merged[1]!.mergedId);
    for (const m of merged) {
      expect(m.sources).toHaveLength(1);
      expect(m.isAP).toBe(true);
      expect(m.subject.subArea).toBe('biology');
    }
  });

  it('should use Skyward grade when it is higher than Canvas', () => {
    const courses: ISourceCourse[] = [
      makeSource({
        provider: 'canvas',
        title: 'Algebra 2',
        grade: 85,
        letterGrade: 'B',
      }),
      makeSource({
        provider: 'skyward',
        title: 'ALGEBRA 2',
        grade: 91,
        letterGrade: 'A-',
      }),
    ];

    const merged = mergeCourses(courses);

    expect(merged).toHaveLength(1);
    expect(merged[0]!.bestGrade).toBe(91);
    expect(merged[0]!.bestLetterGrade).toBe('A-');
  });

  it('should generate a stable deterministic mergedId', () => {
    const courses: ISourceCourse[] = [makeSource({ provider: 'canvas', title: 'AP Chemistry' })];

    const a = mergeCourses(courses);
    const b = mergeCourses(courses);

    expect(a[0]!.mergedId).toBe(b[0]!.mergedId);
    expect(a[0]!.mergedId).toMatch(/^[0-9a-f]{12}$/);
  });

  it('should set primarySourceId to the source that has a grade', () => {
    const courses: ISourceCourse[] = [
      makeSource({ provider: 'canvas', title: 'English 3' }),
      makeSource({
        provider: 'skyward',
        title: 'ENGLISH 3',
        grade: 90,
        letterGrade: 'A-',
      }),
    ];

    const merged = mergeCourses(courses);

    expect(merged).toHaveLength(1);
    expect(merged[0]!.primarySourceId).toBe('src-skyward');
  });
});

describe('mergeCourses — one class named differently by two sources', () => {
  it('joins the class when period and teacher agree', () => {
    const merged = mergeCourses([sisBand, feedBand]);

    expect(merged).toHaveLength(1);
    expect(merged[0]!.sources.map((s) => s.provider).sort()).toEqual(['aeries', 'parentsquare']);
  });

  it('keeps the ID and title of the gradebook source and lists the other ID as an alias', () => {
    const sisAlone = mergeCourses([sisBand])[0]!;
    const feedAlone = mergeCourses([feedBand])[0]!;

    const joined = mergeCourses([feedBand, sisBand]);

    expect(joined).toHaveLength(1);
    expect(joined[0]!.mergedId).toBe(sisAlone.mergedId);
    expect(joined[0]!.normalizedTitle).toBe(sisAlone.normalizedTitle);
    expect(joined[0]!.aliasMergedIds).toEqual([feedAlone.mergedId]);
    expect(joined[0]!.primarySourceId).toBe('src-aeries');
    expect(joined[0]!.bestGrade).toBe(96);
  });

  it('joins on a co-teacher that the other source lists', () => {
    const sisTeam = makeSource({
      provider: 'aeries',
      title: 'FENCING 8TH PERIOD',
      teacherName: 'Okafor, Tomas',
      period: '8',
    });
    const feedTeam = makeSource({
      provider: 'parentsquare',
      title: 'Archery',
      teacherName: 'Ana Lindqvist',
      coTeacherNames: ['Tomas Okafor', 'Ana Moreno'],
      period: '8',
    });

    expect(mergeCourses([sisTeam, feedTeam])).toHaveLength(1);
  });

  it('joins when one source writes the period as an ordinal', () => {
    expect(mergeCourses([sisBand, { ...feedBand, period: '2nd' }])).toHaveLength(1);
  });

  it('does not join when the teachers differ', () => {
    const merged = mergeCourses([sisBand, { ...feedBand, teacherName: 'Ana Moreno' }]);

    expect(merged).toHaveLength(2);
    expect(merged.every((m) => m.aliasMergedIds === undefined)).toBe(true);
  });

  it('does not join when the periods differ', () => {
    expect(mergeCourses([sisBand, { ...feedBand, period: '5' }])).toHaveLength(2);
  });

  it('does not join when one side has no period', () => {
    expect(mergeCourses([sisBand, { ...feedBand, period: undefined }])).toHaveLength(2);
  });

  it('does not join two classes from the same source', () => {
    const stagecraft = makeSource({
      provider: 'aeries',
      title: 'STAGECRAFT',
      teacherName: 'Rivera, Ana',
      period: '2',
    });

    expect(mergeCourses([sisBand, stagecraft])).toHaveLength(2);
  });

  it('does not guess when the other source has two candidate classes', () => {
    const secondFeedClass = makeSource({
      provider: 'parentsquare',
      title: 'Stagecraft',
      teacherName: 'Ana Rivera',
      period: '2',
    });

    expect(mergeCourses([sisBand, feedBand, secondFeedClass])).toHaveLength(3);
  });

  it('does not treat a placeholder teacher as a match', () => {
    const merged = mergeCourses([
      { ...sisBand, teacherName: 'Staff' },
      { ...feedBand, teacherName: 'Staff' },
    ]);

    expect(merged).toHaveLength(2);
  });

  it('leaves the IDs of classes that are not joined unchanged', () => {
    const alone = mergeCourses([pottery])[0]!.mergedId;

    const merged = mergeCourses([sisBand, pottery, feedBand]);

    expect(merged.find((m) => m.sources.includes(pottery))?.mergedId).toBe(alone);
  });
});

describe('mergeCourses — students', () => {
  it("never merges two students' classes, even with the same name and teacher", () => {
    const merged = mergeCourses([
      { ...pottery, externalId: 'ext-a', studentExternalId: 'stu-a' },
      { ...pottery, externalId: 'ext-b', studentExternalId: 'stu-b' },
    ]);

    expect(merged).toHaveLength(2);
    expect(merged[0]!.mergedId).not.toBe(merged[1]!.mergedId);
    expect(merged.map((m) => m.sources.map((s) => s.studentExternalId))).toEqual([
      ['stu-a'],
      ['stu-b'],
    ]);
  });

  it('never joins on period and teacher across students', () => {
    const merged = mergeCourses([
      { ...sisBand, studentExternalId: 'stu-a' },
      { ...feedBand, studentExternalId: 'stu-b' },
    ]);

    expect(merged).toHaveLength(2);
  });

  it('gives one student the same IDs whether or not the student is named', () => {
    const courses = [sisBand, pottery];

    const unnamed = mergeCourses(courses).map((m) => m.mergedId);
    const named = mergeCourses(courses.map((c) => ({ ...c, studentExternalId: 'stu-a' }))).map(
      (m) => m.mergedId
    );

    expect(named).toEqual(unnamed);
  });

  it('merges a course saved without a student into the only named student', () => {
    const merged = mergeCourses([
      makeSource({ provider: 'canvas', title: 'Pottery', studentExternalId: 'stu-a' }),
      makeSource({ provider: 'skyward', title: 'POTTERY' }),
    ]);

    expect(merged).toHaveLength(1);
  });

  it('keeps IDs unique when unnamed courses sit beside several students', () => {
    const merged = mergeCourses([
      { ...pottery, externalId: 'ext-a', studentExternalId: 'stu-a' },
      { ...pottery, externalId: 'ext-b', studentExternalId: 'stu-b' },
      makeSource({ provider: 'skyward', title: 'POTTERY', externalId: 'ext-legacy' }),
    ]);

    const ids = merged.map((m) => m.mergedId);
    expect(merged).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// teachersAgree
// ---------------------------------------------------------------------------

describe('teachersAgree', () => {
  it.each([
    ['Rivera, Ana', 'Ana Rivera'],
    ['Rivera, A', 'Ana Rivera'],
    ['Mrs. Rivera', 'Ana Rivera'],
    ['Dr. Rivera', 'Rivera, Ana'],
    ['arivera', 'Ana Rivera'],
    ['ARIVERA', 'Rivera, Ana'],
    ['Lindqvist Okafor, Ana', 'Ana Lindqvist Okafor'],
    ['Ana Rivera', 'ana rivera'],
  ])('treats "%s" and "%s" as the same teacher', (a, b) => {
    expect(teachersAgree(a, b)).toBe(true);
    expect(teachersAgree(b, a)).toBe(true);
  });

  it.each([
    ['Rivera, Ana', 'Ben Rivera'],
    ['Ana Rivera', 'Ana Moreno'],
    ['Staff', 'Staff'],
    ['TBA', 'TBA'],
    ['', 'Ana Rivera'],
  ])('does not treat "%s" and "%s" as the same teacher', (a, b) => {
    expect(teachersAgree(a, b)).toBe(false);
    expect(teachersAgree(b, a)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// titleSimilarity
// ---------------------------------------------------------------------------

describe('titleSimilarity', () => {
  it('should return 1.0 for identical titles', () => {
    expect(titleSimilarity('AP Biology', 'AP Biology')).toBe(1);
  });

  it('should return 1.0 for case-insensitive identical titles', () => {
    expect(titleSimilarity('AP Biology', 'ap biology')).toBe(1);
  });

  it('should return high score for similar titles', () => {
    const score = titleSimilarity('AP Biology', 'AP BIOLOGY');
    expect(score).toBeGreaterThanOrEqual(0.9);
  });

  it('should return low score for different titles', () => {
    const score = titleSimilarity('AP Biology', 'US History');
    expect(score).toBeLessThan(0.2);
  });

  it('should return 0 for completely disjoint titles', () => {
    expect(titleSimilarity('Chemistry', 'Orchestra')).toBe(0);
  });

  it('should return 1 for two empty strings', () => {
    expect(titleSimilarity('', '')).toBe(1);
  });

  it('should return 0 when one title is empty', () => {
    expect(titleSimilarity('AP Biology', '')).toBe(0);
  });
});
