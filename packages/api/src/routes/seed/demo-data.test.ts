/**
 * demo-data — unit tests for the pure builder functions.
 *
 * Covers the description/lmsUrl seeding added for the assignment work pack
 * and the assignmentExternalId join on course materials.
 * No MongoDB required — all builders are pure.
 */

import {
  buildDemoAssignments,
  buildDemoAssignmentDocs,
  buildDemoMaterialDocs,
  buildDemoAssetDocs,
  demoAssetByteFiles,
  DEMO_MINIMAL_PDF,
  DEMO_LAB_SAFETY_ASSET_ID,
  DEMO_LAB_SAFETY_HASH,
  DEMO_LAB_SAFETY_STORAGE_KEY,
  DEMO_STUDENT_EMMA,
  DEMO_STUDENT_USER_EMMA,
  DEMO_STUDENT_USER_LIAM,
  DEMO_USER,
} from './demo-data';

const BASE_DATE = new Date('2026-08-24T00:00:00Z');

describe('DEMO_STUDENT_USER_EMMA', () => {
  it('is a distinct student login from the parent demo user', () => {
    expect(DEMO_STUDENT_USER_EMMA.email).toBe('emma.demo@scholarmancy.com');
    expect(DEMO_STUDENT_USER_EMMA.email).not.toBe(DEMO_USER.email);
    expect(DEMO_STUDENT_USER_EMMA.password).toBe('DemoPass123!');
    expect(DEMO_STUDENT_USER_EMMA.name).toBe('Emma Mitchell');
  });
});

describe('DEMO_STUDENT_USER_LIAM', () => {
  it('is a distinct student login from the parent and from Emma', () => {
    expect(DEMO_STUDENT_USER_LIAM.email).toBe('liam.demo@scholarmancy.com');
    expect(DEMO_STUDENT_USER_LIAM.email).not.toBe(DEMO_USER.email);
    expect(DEMO_STUDENT_USER_LIAM.email).not.toBe(DEMO_STUDENT_USER_EMMA.email);
    expect(DEMO_STUDENT_USER_LIAM.password).toBe('DemoPass123!');
    expect(DEMO_STUDENT_USER_LIAM.name).toBe('Liam Mitchell');
  });
});

// ---------------------------------------------------------------------------
// buildDemoAssignments — description and lmsUrl seeding
// ---------------------------------------------------------------------------

describe('buildDemoAssignments', () => {
  const assignments = buildDemoAssignments(BASE_DATE);

  it('produces assignments for all expected courses', () => {
    const courseIds = [...new Set(assignments.map((a) => a.courseExternalId))];
    expect(courseIds).toContain('demo-emma-ap-bio');
    expect(courseIds).toContain('demo-emma-eng10');
    expect(courseIds).toContain('demo-emma-world-hist');
  });

  describe('AP Bio — cell division assignment (i=5)', () => {
    const apBioA5 = assignments.find((a) => a.externalId === 'demo-emma-ap-bio-a5');

    it('exists', () => {
      expect(apBioA5).toBeDefined();
    });

    it('has description HTML', () => {
      expect(apBioA5?.description).toMatch(/Cell Division/i);
    });

    it('description contains a Khan Academy link', () => {
      expect(apBioA5?.description).toContain('khanacademy.org');
    });

    it('has an lmsUrl pointing at the school portal', () => {
      expect(apBioA5?.lmsUrl).toMatch(/^https:\/\//);
      expect(apBioA5?.lmsUrl).toContain('cell-division');
    });
  });

  describe('English 10 — essay draft assignment (i=9)', () => {
    const engA9 = assignments.find((a) => a.externalId === 'demo-emma-eng10-a9');

    it('exists', () => {
      expect(engA9).toBeDefined();
    });

    it('title is "Essay draft"', () => {
      expect(engA9?.title).toBe('Essay draft');
    });

    it('has description HTML', () => {
      expect(engA9?.description).toMatch(/essay/i);
    });

    it('description contains a SparkNotes link', () => {
      expect(engA9?.description).toContain('sparknotes.com');
    });

    it('has an lmsUrl', () => {
      expect(engA9?.lmsUrl).toMatch(/^https:\/\//);
    });
  });

  describe('World History — chapter 2 quiz (i=1)', () => {
    const whA1 = assignments.find((a) => a.externalId === 'demo-emma-wh-a1');

    it('exists', () => {
      expect(whA1).toBeDefined();
    });

    it('has description HTML mentioning Age of Exploration', () => {
      expect(whA1?.description).toMatch(/Age of Exploration/i);
    });

    it('description contains a primary-source link', () => {
      expect(whA1?.description).toContain('example.com/primary-1');
    });

    it('has an lmsUrl', () => {
      expect(whA1?.lmsUrl).toMatch(/^https:\/\//);
    });
  });

  describe('other assignments have no description or lmsUrl', () => {
    it('AP Bio assignments other than a5 have no description', () => {
      const others = assignments.filter(
        (a) => a.courseExternalId === 'demo-emma-ap-bio' && a.externalId !== 'demo-emma-ap-bio-a5'
      );
      for (const a of others) {
        expect(a.description).toBeUndefined();
        expect(a.lmsUrl).toBeUndefined();
      }
    });
  });
});

// ---------------------------------------------------------------------------
// buildDemoAssignmentDocs — description/lmsUrl forwarded into record
// ---------------------------------------------------------------------------

describe('buildDemoAssignmentDocs', () => {
  const docs = buildDemoAssignmentDocs('user-test', BASE_DATE);

  it('produces docs for every assignment', () => {
    expect(docs.length).toBeGreaterThan(0);
  });

  it('stores description in record for the AP Bio cell-division assignment', () => {
    const doc = docs.find((d) => d['externalId'] === 'demo-emma-ap-bio-a5');
    expect(doc).toBeDefined();
    const record = doc!['record'] as Record<string, unknown>;
    expect(record['description']).toMatch(/Cell Division/i);
  });

  it('stores lmsUrl as record.url for the AP Bio cell-division assignment', () => {
    const doc = docs.find((d) => d['externalId'] === 'demo-emma-ap-bio-a5');
    const record = doc!['record'] as Record<string, unknown>;
    expect(typeof record['url']).toBe('string');
    expect(record['url'] as string).toMatch(/^https:\/\//);
  });

  it('stores description for the English essay assignment', () => {
    const doc = docs.find((d) => d['externalId'] === 'demo-emma-eng10-a9');
    const record = doc!['record'] as Record<string, unknown>;
    expect(record['description']).toMatch(/essay/i);
  });

  it('record.description is undefined for assignments without instructions', () => {
    const doc = docs.find((d) => d['externalId'] === 'demo-emma-ap-bio-a-35');
    const record = doc!['record'] as Record<string, unknown>;
    expect(record['description']).toBeUndefined();
    expect(record['url']).toBeUndefined();
  });

  it('sets userId from parameter', () => {
    const doc = docs[0];
    expect(doc!['userId']).toBe('user-test');
  });
});

// ---------------------------------------------------------------------------
// buildDemoMaterialDocs — assignmentExternalId join
// ---------------------------------------------------------------------------

describe('buildDemoMaterialDocs', () => {
  const docs = buildDemoMaterialDocs('user-mat');

  it('produces material docs', () => {
    expect(docs.length).toBeGreaterThan(0);
  });

  describe('AP Bio lab-safety handout', () => {
    const doc = docs.find((d) => d['externalId'] === 'demo-emma-ap-bio-lab-safety');

    it('exists', () => expect(doc).toBeDefined());

    it('record.assignmentExternalId links to the AP Bio a5 assignment', () => {
      const record = doc!['record'] as Record<string, unknown>;
      expect(record['assignmentExternalId']).toBe('demo-emma-ap-bio-a5');
    });
  });

  describe('Khan Academy Cell Division video', () => {
    const doc = docs.find((d) => d['externalId'] === 'demo-emma-ap-bio-khan');

    it('exists', () => expect(doc).toBeDefined());

    it('record.assignmentExternalId links to the AP Bio a5 assignment', () => {
      const record = doc!['record'] as Record<string, unknown>;
      expect(record['assignmentExternalId']).toBe('demo-emma-ap-bio-a5');
    });
  });

  describe('English essay rubric', () => {
    const doc = docs.find((d) => d['externalId'] === 'demo-emma-eng10-rubric');

    it('exists', () => expect(doc).toBeDefined());

    it('record.assignmentExternalId links to the English essay assignment', () => {
      const record = doc!['record'] as Record<string, unknown>;
      expect(record['assignmentExternalId']).toBe('demo-emma-eng10-a9');
    });
  });

  describe('SparkNotes link', () => {
    const doc = docs.find((d) => d['externalId'] === 'demo-emma-eng10-spark');

    it('exists', () => expect(doc).toBeDefined());

    it('record.assignmentExternalId links to the English essay assignment', () => {
      const record = doc!['record'] as Record<string, unknown>;
      expect(record['assignmentExternalId']).toBe('demo-emma-eng10-a9');
    });
  });

  describe('World History timeline PDF', () => {
    const doc = docs.find((d) => d['externalId'] === 'demo-emma-wh-timeline');

    it('exists', () => expect(doc).toBeDefined());

    it('record.assignmentExternalId links to the WH chapter 2 quiz', () => {
      const record = doc!['record'] as Record<string, unknown>;
      expect(record['assignmentExternalId']).toBe('demo-emma-wh-a1');
    });
  });

  describe('Primary Source — Declaration', () => {
    const doc = docs.find((d) => d['externalId'] === 'demo-emma-wh-primary1');

    it('exists', () => expect(doc).toBeDefined());

    it('record.assignmentExternalId links to the WH chapter 2 quiz', () => {
      const record = doc!['record'] as Record<string, unknown>;
      expect(record['assignmentExternalId']).toBe('demo-emma-wh-a1');
    });
  });

  describe('unlinked materials', () => {
    it('AP Bio syllabus has no assignmentExternalId', () => {
      const doc = docs.find((d) => d['externalId'] === 'demo-emma-ap-bio-syllabus');
      const record = doc!['record'] as Record<string, unknown>;
      expect(record['assignmentExternalId']).toBeUndefined();
    });

    it('Algebra II formula sheet is the hosted file for Missing assignment 1', () => {
      const doc = docs.find((d) => d['externalId'] === 'demo-emma-alg2-formula');
      const record = doc!['record'] as Record<string, unknown>;
      expect(record['assignmentExternalId']).toBe('demo-emma-alg2-missing-1');
    });
  });

  it('uses the provided userId for all docs', () => {
    for (const doc of docs) {
      expect(doc['userId']).toBe('user-mat');
    }
  });

  it('DEMO_STUDENT_EMMA.studentId is set on all Emma docs', () => {
    const emmaDocs = docs.filter((d) => d['studentExternalId'] === DEMO_STUDENT_EMMA.studentId);
    expect(emmaDocs.length).toBeGreaterThan(0);
  });
});

describe('demo asset bytes', () => {
  it('buildDemoAssetDocs uses a contentHash of the real lab-safety PDF bytes', () => {
    const docs = buildDemoAssetDocs('user-1');
    const lab = docs.find((d) => d['assetId'] === DEMO_LAB_SAFETY_ASSET_ID);
    expect(lab).toBeDefined();
    expect(lab?.['contentHash']).toBe(DEMO_LAB_SAFETY_HASH);
    expect(lab?.['storageKey']).toBe(DEMO_LAB_SAFETY_STORAGE_KEY);
    expect(lab?.['fileSize']).toBe(DEMO_MINIMAL_PDF.length);
  });

  it('demoAssetByteFiles includes readable lab-safety PDF bytes (not an empty page)', () => {
    const files = demoAssetByteFiles();
    const lab = files.find((f) => f.storageKey === DEMO_LAB_SAFETY_STORAGE_KEY);
    expect(lab).toBeDefined();
    expect(lab?.contentType).toBe('application/pdf');
    expect(Buffer.compare(lab!.bytes, DEMO_MINIMAL_PDF)).toBe(0);
    expect(lab!.bytes.subarray(0, 5).toString('utf8')).toBe('%PDF-');
    expect(lab!.bytes.toString('utf8')).toContain('Goggles');
  });

  it('SparkNotes material has extractedText for offline reading', () => {
    const docs = buildDemoMaterialDocs('user-mat');
    const spark = docs.find((d) => d['externalId'] === 'demo-emma-eng10-spark');
    const record = spark!['record'] as Record<string, unknown>;
    expect(String(record['extractedText'])).toMatch(/Scout Finch/);
  });
});
