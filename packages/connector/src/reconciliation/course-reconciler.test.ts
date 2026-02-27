import { mergeCourses, titleSimilarity, type ISourceCourse } from './course-reconciler';

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

  it('should pick the best (highest) grade across sources', () => {
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
