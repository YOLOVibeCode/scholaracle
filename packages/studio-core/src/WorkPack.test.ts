/**
 * Slice 2 — WorkPack table-driven tests.
 *
 * Fake IWorkPackSource only. No Express, no React.
 * Primary CTA is the hosted file, never “View on LMS”.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertNoGradeLeak, type IStudentSession } from '@scholaracle/contracts';
import type { ICourseMaterial, IStudentMaterialsResponse } from '@scholaracle/contracts';
import type { IWorkPackAssignment, IWorkPackSource } from '@scholaracle/interfaces';
import { WorkPack } from './WorkPack';
import { loadEmmaFixtureWorkPack } from './fixtures/emma';

const SESSION_OFF: IStudentSession = {
  studentId: 'stu-emma',
  displayName: 'Emma Mitchell',
  showGrades: false,
};

const SESSION_ON: IStudentSession = { ...SESSION_OFF, showGrades: true };

const LMS = 'https://school.instructure.com/courses/bio101/assignments/cell-division';
const KHAN = 'https://www.khanacademy.org/science/ap-biology/cell-communication-and-cell-cycle';
const CANVAS_FILE = 'https://school.instructure.com/files/555/download';

const CELL_DIVISION: IWorkPackAssignment = {
  assignmentExternalId: 'demo-emma-ap-bio-a5',
  title: 'Cell Division',
  courseName: 'AP Biology',
  dueAt: '2026-08-20T16:00:00.000Z',
  status: 'missing',
  descriptionHtml:
    '<p>Complete the <strong>Cell Division</strong> worksheet below and submit via Canvas.</p>' +
    `<p>Reference materials: <a href="${KHAN}">Khan Academy – Cell Cycle</a>.</p>` +
    '<p>Lab safety rules apply — review the handout before lab time.</p>',
  lmsUrl: LMS,
  pointsEarned: 0,
  pointsPossible: 10,
  letterGrade: 'F',
};

function material(
  overrides: Partial<ICourseMaterial> & Pick<ICourseMaterial, 'externalId' | 'title'>
): ICourseMaterial {
  return {
    type: 'document',
    assignmentExternalId: null,
    ...overrides,
  };
}

function materialsResponse(materials: readonly ICourseMaterial[]): IStudentMaterialsResponse {
  return {
    studentId: 'stu-emma',
    studentName: 'Emma Mitchell',
    totalMaterials: materials.length,
    courses: [
      {
        courseExternalId: 'demo-emma-ap-bio',
        courseName: 'AP Biology',
        materials,
      },
    ],
  };
}

const LAB_SAFETY: ICourseMaterial = material({
  externalId: 'demo-emma-ap-bio-lab-safety',
  title: 'Lab Safety Handout',
  type: 'handout',
  fileName: 'lab-safety.pdf',
  mimeType: 'application/pdf',
  assignmentExternalId: 'demo-emma-ap-bio-a5',
  assetId: 'demo-asset-demo-emma-ap-bio-lab-safety',
  contentHash: 'demo-demo-emma-ap-bio-lab-safety-hash',
  downloadUrl: 'https://cdn.example.test/assets/lab-safety.pdf?sig=ticket',
});

const KHAN_MATERIAL: ICourseMaterial = material({
  externalId: 'demo-emma-ap-bio-khan',
  title: 'Khan Academy - Cell Division',
  type: 'video',
  url: KHAN,
  linkAccessibility: 'public',
  assignmentExternalId: 'demo-emma-ap-bio-a5',
});

const SYLLABUS: ICourseMaterial = material({
  externalId: 'demo-emma-ap-bio-syllabus',
  title: 'AP Biology Syllabus',
  type: 'syllabus',
  fileName: 'syllabus.pdf',
  assignmentExternalId: null,
  assetId: 'demo-asset-demo-emma-ap-bio-syllabus',
  contentHash: 'demo-demo-emma-ap-bio-syllabus-hash',
});

const STUDY_GUIDE: ICourseMaterial = material({
  externalId: 'demo-emma-ap-bio-study-guide',
  title: 'Chapter 5 Study Guide',
  type: 'study_guide',
  fileName: 'ch5-study.pdf',
  assignmentExternalId: null,
  assetId: 'demo-asset-demo-emma-ap-bio-study-guide',
  contentHash: 'demo-demo-emma-ap-bio-study-guide-hash',
});

const YOUTUBE: ICourseMaterial = material({
  externalId: 'demo-emma-ap-bio-yt',
  title: 'YouTube - AP Bio Review',
  type: 'video',
  url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  linkAccessibility: 'public',
  assignmentExternalId: null,
});

const EMMA_MATERIALS = materialsResponse([
  SYLLABUS,
  LAB_SAFETY,
  KHAN_MATERIAL,
  YOUTUBE,
  STUDY_GUIDE,
]);

function fakeSource(
  assignment: IWorkPackAssignment,
  materials: IStudentMaterialsResponse
): IWorkPackSource {
  return {
    loadAssignment: async (id) => {
      if (id !== assignment.assignmentExternalId) {
        throw new Error(`unknown assignment ${id}`);
      }
      return assignment;
    },
    loadMaterials: async () => materials,
  };
}

describe('WorkPack', () => {
  it('primary CTA is the first hosted file, not View on LMS', async () => {
    const view = await new WorkPack(fakeSource(CELL_DIVISION, EMMA_MATERIALS)).load(
      SESSION_OFF,
      'demo-emma-ap-bio-a5'
    );
    expect(view.primaryAsset).not.toBeNull();
    expect(view.primaryAsset?.assetId).toBe('demo-asset-demo-emma-ap-bio-lab-safety');
    expect(view.primaryAsset?.contentHash).toBe('demo-demo-emma-ap-bio-lab-safety-hash');
    expect(view.primaryAsset?.fileName).toBe('lab-safety.pdf');
    expect(view.primaryAsset?.downloadUrl).toContain('lab-safety.pdf');
    expect(view.needsSchoolLogin.map((l) => l.label).join(' ')).not.toMatch(/view on lms/i);
  });

  it('rehosted PDF + public Khan → primary is the PDF; Khan is not primary', async () => {
    const view = await new WorkPack(fakeSource(CELL_DIVISION, EMMA_MATERIALS)).load(
      SESSION_OFF,
      'demo-emma-ap-bio-a5'
    );
    expect(view.primaryAsset?.fileName).toBe('lab-safety.pdf');
    expect(view.needsSchoolLogin.some((l) => l.href === KHAN)).toBe(true);
    expect(view.needsSchoolLogin.find((l) => l.href === KHAN)?.kind).toBe('external');
  });

  it('authenticated description links go in needsSchoolLogin, not primary', async () => {
    const assignment: IWorkPackAssignment = {
      ...CELL_DIVISION,
      descriptionHtml: `<p>Download <a href="${CANVAS_FILE}">worksheet from Canvas</a>.</p>`,
    };
    const view = await new WorkPack(fakeSource(assignment, materialsResponse([LAB_SAFETY]))).load(
      SESSION_OFF,
      'demo-emma-ap-bio-a5'
    );
    expect(view.primaryAsset?.fileName).toBe('lab-safety.pdf');
    const canvas = view.needsSchoolLogin.find((l) => l.href === CANVAS_FILE);
    expect(canvas).toEqual({
      label: 'worksheet from Canvas',
      href: CANVAS_FILE,
      kind: 'school-login',
    });
  });

  it('public http(s) that is not our CDN is Open link (external); authenticated is school-login', async () => {
    const view = await new WorkPack(fakeSource(CELL_DIVISION, EMMA_MATERIALS)).load(
      SESSION_OFF,
      'demo-emma-ap-bio-a5'
    );
    const khan = view.needsSchoolLogin.find((l) => l.href === KHAN);
    expect(khan?.kind).toBe('external');
    const lms = view.needsSchoolLogin.find((l) => l.href === LMS);
    expect(lms?.kind).toBe('school-login');
  });

  it('course-level syllabus / study guide / YouTube are moreFromCourse, never primary', async () => {
    const view = await new WorkPack(fakeSource(CELL_DIVISION, EMMA_MATERIALS)).load(
      SESSION_OFF,
      'demo-emma-ap-bio-a5'
    );
    expect(view.primaryAsset?.fileName).toBe('lab-safety.pdf');
    const moreTitles = view.moreFromCourse.map((i) => i.title);
    expect(moreTitles).toEqual(
      expect.arrayContaining([
        'AP Biology Syllabus',
        'Chapter 5 Study Guide',
        'YouTube - AP Bio Review',
      ])
    );
    expect(moreTitles).not.toContain('Lab Safety Handout');
    expect(
      view.moreFromCourse.find((i) => i.title === 'AP Biology Syllabus')?.asset?.fileName
    ).toBe('syllabus.pdf');
    expect(view.moreFromCourse.find((i) => i.title === 'YouTube - AP Bio Review')?.href).toContain(
      'youtube.com'
    );
  });

  it('empty materials → primaryAsset null; LMS url is last-resort only', async () => {
    const noLinks: IWorkPackAssignment = {
      ...CELL_DIVISION,
      descriptionHtml: '<p>Complete the worksheet and submit via Canvas.</p>',
    };
    const view = await new WorkPack(fakeSource(noLinks, materialsResponse([]))).load(
      SESSION_OFF,
      'demo-emma-ap-bio-a5'
    );
    expect(view.primaryAsset).toBeNull();
    expect(view.moreFromCourse).toEqual([]);
    expect(view.needsSchoolLogin).toEqual([
      { label: 'View in Canvas', href: LMS, kind: 'school-login' },
    ]);
  });

  it('status token missing becomes Not turned in; no raw missing/submitted in humanStatus', async () => {
    const view = await new WorkPack(fakeSource(CELL_DIVISION, EMMA_MATERIALS)).load(
      SESSION_OFF,
      'demo-emma-ap-bio-a5'
    );
    expect(view.humanStatus).toBe('Not turned in');
    expect(view.humanStatus).not.toMatch(/missing|submitted/i);
  });

  it('lmsUrl is not a top-level peer of dueAt — it lives in the fallback list', async () => {
    const view = await new WorkPack(fakeSource(CELL_DIVISION, EMMA_MATERIALS)).load(
      SESSION_OFF,
      'demo-emma-ap-bio-a5'
    );
    expect(view.dueAt).toBe('2026-08-20T16:00:00.000Z');
    expect('lmsUrl' in view).toBe(false);
    expect(view.needsSchoolLogin.some((l) => l.href === LMS)).toBe(true);
  });

  it('showGrades false → pack copy has no points, letter, or percent even if the assignment doc has them', async () => {
    const view = await new WorkPack(fakeSource(CELL_DIVISION, EMMA_MATERIALS)).load(
      SESSION_OFF,
      'demo-emma-ap-bio-a5'
    );
    const blob = JSON.stringify(view);
    expect(blob).not.toMatch(/\d+\s*%/);
    expect(blob).not.toMatch(/\b[ABCDF][+-]/);
    expect(view.humanStatus).not.toMatch(/\bpoints?\b/i);
    expect(view.instructionsText).not.toMatch(/\b\d+\s*\/\s*\d+\b/);
    expect(() => assertNoGradeLeak(view, false)).not.toThrow();
  });

  it('showGrades true still omits scores from the pack view until product asks', async () => {
    const view = await new WorkPack(fakeSource(CELL_DIVISION, EMMA_MATERIALS)).load(
      SESSION_ON,
      'demo-emma-ap-bio-a5'
    );
    expect(view.humanStatus).toBe('Not turned in');
    expect(JSON.stringify(view)).not.toMatch(/\b10\b.*\b10\b/);
  });

  it('downloadUrl + assetId without contentHash still becomes primary (hash lands in slice 3)', async () => {
    const unsignedHash: ICourseMaterial = {
      ...LAB_SAFETY,
      contentHash: undefined,
    };
    const view = await new WorkPack(
      fakeSource(CELL_DIVISION, materialsResponse([unsignedHash]))
    ).load(SESSION_OFF, 'demo-emma-ap-bio-a5');
    expect(view.primaryAsset?.assetId).toBe('demo-asset-demo-emma-ap-bio-lab-safety');
    expect(view.primaryAsset?.downloadUrl).toContain('lab-safety.pdf');
    expect(view.primaryAsset?.contentHash).toBe('pending:demo-asset-demo-emma-ap-bio-lab-safety');
  });

  it('Khan from description is not duplicated when it is also an assignment material', async () => {
    const view = await new WorkPack(fakeSource(CELL_DIVISION, EMMA_MATERIALS)).load(
      SESSION_OFF,
      'demo-emma-ap-bio-a5'
    );
    const khanHits = view.needsSchoolLogin.filter((l) => l.href === KHAN);
    expect(khanHits).toHaveLength(1);
  });

  it('Emma fixture: Cell Division, lab-safety primary, collapsed course extras', async () => {
    const view = await loadEmmaFixtureWorkPack();
    expect(view.title).toBe('Cell Division');
    expect(view.courseName).toBe('AP Biology');
    expect(view.humanStatus).toBe('Not turned in');
    expect(view.primaryAsset?.fileName).toBe('lab-safety.pdf');
    expect(view.primaryAsset?.downloadUrl).toBe('/studio/fixtures/lab-safety.pdf');
    expect(view.primaryAsset?.downloadUrl).not.toContain('sig=');
    expect(view.instructionsText).toMatch(/Cell Division/i);
    expect(view.needsSchoolLogin.some((l) => l.href === KHAN)).toBe(true);
    expect(view.needsSchoolLogin.some((l) => l.href === LMS)).toBe(true);
    expect(view.moreFromCourse.length).toBeGreaterThanOrEqual(3);
    expect(() => assertNoGradeLeak(view, false)).not.toThrow();
  });

  it('Emma fixture v2 uses a new contentHash and fixture URL so the cache replaces', async () => {
    const view = await loadEmmaFixtureWorkPack('v2');
    expect(view.primaryAsset?.contentHash).toBe('demo-demo-emma-ap-bio-lab-safety-hash-v2');
    expect(view.primaryAsset?.downloadUrl).toBe('/studio/fixtures/lab-safety-v2.pdf');
  });
});

describe('ISP — WorkPack stays host-agnostic', () => {
  it('WorkPack.ts does not import Express, React, Next, or grades', () => {
    const src = readFileSync(join(__dirname, 'WorkPack.ts'), 'utf8');
    expect(src).not.toMatch(/from ['"]express['"]/);
    expect(src).not.toMatch(/from ['"]react['"]/);
    expect(src).not.toMatch(/from ['"]next/);
    expect(src).not.toMatch(/IStudentGradesResponse/);
    expect(src).not.toMatch(/letterGrade/);
    expect(src).not.toMatch(/pointsEarned/);
  });
});
