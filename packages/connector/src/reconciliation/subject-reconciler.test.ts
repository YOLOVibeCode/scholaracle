import { reconcileCourse, reconcileCourses, groupBySubject } from './subject-reconciler';

describe('reconcileCourse', () => {
  // -----------------------------------------------------------------------
  // Subject area detection
  // -----------------------------------------------------------------------

  describe('subject detection', () => {
    it.each([
      ['ALGEBRA 1', 'math', 'algebra'],
      ['Alg 2 Honors', 'math', 'algebra'],
      ['AP Calculus BC', 'math', 'calculus'],
      ['Pre-Calculus', 'math', 'precalculus'],
      ['Geometry', 'math', 'geometry'],
      ['AP Statistics', 'math', 'statistics'],
      ['Math 8', 'math', undefined],
    ])('should classify "%s" as %s/%s', (title, expectedArea, expectedSubArea) => {
      const result = reconcileCourse(title);
      expect(result.subject.area).toBe(expectedArea);
      if (expectedSubArea) expect(result.subject.subArea).toBe(expectedSubArea);
    });

    it.each([
      ['PHYSICS 2 AP', 'science', 'physics'],
      ['AP Chemistry', 'science', 'chemistry'],
      ['Biology Honors', 'science', 'biology'],
      ['Environmental Science', 'science', 'environmental'],
      ['Anatomy & Physiology', 'science', 'anatomy'],
      ['Earth Science', 'science', 'earth-science'],
      ['Science 7', 'science', undefined],
    ])('should classify "%s" as %s/%s', (title, expectedArea, expectedSubArea) => {
      const result = reconcileCourse(title);
      expect(result.subject.area).toBe(expectedArea);
      if (expectedSubArea) expect(result.subject.subArea).toBe(expectedSubArea);
    });

    it.each([
      ['English 1', 'english', undefined],
      ['AP English Literature', 'english', 'literature'],
      ['ELA 8', 'english', undefined],
      ['Creative Writing', 'english', 'creative-writing'],
      ['Language Arts 6', 'english', undefined],
    ])('should classify "%s" as %s/%s', (title, expectedArea, expectedSubArea) => {
      const result = reconcileCourse(title);
      expect(result.subject.area).toBe(expectedArea);
      if (expectedSubArea) expect(result.subject.subArea).toBe(expectedSubArea);
    });

    it.each([
      ['US History', 'social-studies', 'us-history'],
      ['AP World History', 'social-studies', 'world-history'],
      ['AP Government', 'social-studies', 'government'],
      ['Economics', 'social-studies', 'economics'],
      ['AP Psychology', 'social-studies', 'psychology'],
      ['AP Human Geography', 'social-studies', 'geography'],
    ])('should classify "%s" as %s/%s', (title, expectedArea, expectedSubArea) => {
      const result = reconcileCourse(title);
      expect(result.subject.area).toBe(expectedArea);
      expect(result.subject.subArea).toBe(expectedSubArea);
    });

    it.each([
      ['Spanish 2', 'world-languages', 'spanish'],
      ['French 3 Honors', 'world-languages', 'french'],
      ['AP Latin', 'world-languages', 'latin'],
      ['Mandarin Chinese', 'world-languages', 'chinese'],
      ['ASL 1', 'world-languages', 'asl'],
    ])('should classify "%s" as %s/%s', (title, expectedArea, expectedSubArea) => {
      const result = reconcileCourse(title);
      expect(result.subject.area).toBe(expectedArea);
      expect(result.subject.subArea).toBe(expectedSubArea);
    });

    it.each([
      ['Band', 'arts', 'music'],
      ['Orchestra', 'arts', 'music'],
      ['AP Art History', 'arts', 'visual-art'],
      ['Theater Arts', 'arts', 'theater'],
      ['Dance 1', 'arts', 'dance'],
    ])('should classify "%s" as %s/%s', (title, expectedArea, expectedSubArea) => {
      const result = reconcileCourse(title);
      expect(result.subject.area).toBe(expectedArea);
      expect(result.subject.subArea).toBe(expectedSubArea);
    });

    it.each([
      ['AP Computer Science A', 'technology', 'computer-science'],
      ['Robotics', 'technology', 'engineering'],
      ['Digital Media', 'technology', undefined],
    ])('should classify "%s" as %s/%s', (title, expectedArea, expectedSubArea) => {
      const result = reconcileCourse(title);
      expect(result.subject.area).toBe(expectedArea);
      if (expectedSubArea) expect(result.subject.subArea).toBe(expectedSubArea);
    });

    it.each([
      ['Physical Education', 'health-pe', 'pe'],
      ['Health', 'health-pe', 'health'],
      ['PE', 'health-pe', 'pe'],
    ])('should classify "%s" as %s/%s', (title, expectedArea, expectedSubArea) => {
      const result = reconcileCourse(title);
      expect(result.subject.area).toBe(expectedArea);
      expect(result.subject.subArea).toBe(expectedSubArea);
    });

    it('should return "other" for unrecognized courses', () => {
      const result = reconcileCourse('Advisory Period');
      expect(result.subject.area).toBe('other');
      expect(result.subject.confidence).toBe('low');
    });
  });

  // -----------------------------------------------------------------------
  // Course level detection
  // -----------------------------------------------------------------------

  describe('AP detection', () => {
    it('should detect AP from "AP Physics"', () => {
      expect(reconcileCourse('AP Physics').isAP).toBe(true);
    });

    it('should detect AP from "PHYSICS 2 AP"', () => {
      expect(reconcileCourse('PHYSICS 2 AP').isAP).toBe(true);
    });

    it('should detect AP from "Advanced Placement Chemistry"', () => {
      expect(reconcileCourse('Advanced Placement Chemistry').isAP).toBe(true);
    });

    it('should not detect AP from "Applied Math"', () => {
      expect(reconcileCourse('Applied Math').isAP).toBe(false);
    });
  });

  describe('Honors detection', () => {
    it('should detect Honors from "Biology Honors"', () => {
      expect(reconcileCourse('Biology Honors').isHonors).toBe(true);
    });

    it('should detect Honors from "Alg 2 H"', () => {
      expect(reconcileCourse('Alg 2 H').isHonors).toBe(true);
    });

    it('should not flag honors when AP is present', () => {
      const result = reconcileCourse('AP English Honors');
      expect(result.isAP).toBe(true);
      expect(result.isHonors).toBe(false); // AP takes precedence
    });
  });

  describe('dual enrollment detection', () => {
    it('should detect dual enrollment from "Dual Credit English"', () => {
      expect(reconcileCourse('Dual Credit English').isDualEnrollment).toBe(true);
    });

    it('should detect from "College Algebra"', () => {
      expect(reconcileCourse('College Algebra').isDualEnrollment).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Metadata extraction
  // -----------------------------------------------------------------------

  describe('period extraction', () => {
    it('should extract period from "Physics - Period 3"', () => {
      expect(reconcileCourse('Physics - Period 3').period).toBe(3);
    });

    it('should extract period from "Math Pd 5"', () => {
      expect(reconcileCourse('Math Pd 5').period).toBe(5);
    });
  });

  describe('teacher extraction', () => {
    it('should extract teacher from "Physics (Smith)"', () => {
      expect(reconcileCourse('Physics (Smith)').teacherName).toBe('Smith');
    });

    it('should prefer provided teacher over extracted', () => {
      expect(reconcileCourse('Physics (Smith)', 'Dr. Jones').teacherName).toBe('Dr. Jones');
    });

    it('should use provided teacher when title has none', () => {
      expect(reconcileCourse('PHYSICS 2 AP', 'Ms. Chen').teacherName).toBe('Ms. Chen');
    });
  });

  // -----------------------------------------------------------------------
  // Normalized title
  // -----------------------------------------------------------------------

  describe('normalized title', () => {
    it('should title-case and clean "PHYSICS 2 AP"', () => {
      const result = reconcileCourse('PHYSICS 2 AP');
      expect(result.normalizedTitle).toBe('AP Physics');
    });

    it('should title-case "ALGEBRA 1"', () => {
      const result = reconcileCourse('ALGEBRA 1');
      expect(result.normalizedTitle).toBe('Algebra');
    });

    it('should preserve Honors prefix', () => {
      const result = reconcileCourse('Biology Honors');
      expect(result.normalizedTitle).toBe('Honors Biology');
    });
  });
});

describe('reconcileCourses', () => {
  it('should reconcile a list of courses', () => {
    const results = reconcileCourses([
      { title: 'AP Physics C', teacherName: 'Dr. Smith' },
      { title: 'English 3', teacherName: 'Ms. Jones' },
      { title: 'Spanish 2' },
    ]);

    expect(results).toHaveLength(3);
    expect(results[0]!.subject.area).toBe('science');
    expect(results[0]!.teacherName).toBe('Dr. Smith');
    expect(results[1]!.subject.area).toBe('english');
    expect(results[2]!.subject.area).toBe('world-languages');
  });
});

describe('groupBySubject', () => {
  it('should group courses by subject area', () => {
    const reconciled = reconcileCourses([
      { title: 'AP Physics' },
      { title: 'Chemistry' },
      { title: 'Algebra 2' },
      { title: 'English 3' },
    ]);
    const grouped = groupBySubject(reconciled);

    expect(grouped.get('science')).toHaveLength(2);
    expect(grouped.get('math')).toHaveLength(1);
    expect(grouped.get('english')).toHaveLength(1);
  });
});
