/**
 * resourcePartition — assignment/course material split + link classification.
 */

import type { ICourseMaterial, IStudentMaterialsResponse } from '@scholaracle/contracts';
import { classifyResource, partitionMaterials } from './resourcePartition';

const API_BASE = 'https://api.test.local';

function makeMaterial(overrides: Partial<ICourseMaterial> = {}): ICourseMaterial {
  return {
    externalId: 'm-1',
    title: 'Chapter 5 Notes',
    type: 'file',
    assignmentExternalId: null,
    ...overrides,
  };
}

function makeResponse(
  materialsByCourse: ReadonlyArray<readonly ICourseMaterial[]>
): IStudentMaterialsResponse {
  return {
    studentId: 'stu-1',
    studentName: 'Emma Lewis',
    totalMaterials: materialsByCourse.reduce((n, materials) => n + materials.length, 0),
    courses: materialsByCourse.map((materials, index) => ({
      courseExternalId: `course-${index + 1}`,
      courseName: `Course ${index + 1}`,
      materials,
    })),
  };
}

describe('partitionMaterials', () => {
  it('should split exact assignment matches from course-scoped materials', () => {
    const res = makeResponse([
      [
        makeMaterial({ externalId: 'm-1', assignmentExternalId: 'a-1' }),
        makeMaterial({ externalId: 'm-2', assignmentExternalId: null }),
        makeMaterial({ externalId: 'm-3', assignmentExternalId: 'a-2' }),
      ],
    ]);

    const { forAssignment, courseMaterials } = partitionMaterials(res, 'a-1');

    expect(forAssignment.map((m) => m.externalId)).toEqual(['m-1']);
    expect(courseMaterials.map((m) => m.externalId).sort()).toEqual(['m-2', 'm-3']);
  });

  it('should treat an absent assignmentExternalId (old server) as course-scoped', () => {
    // Old servers omit the field entirely — build the object without it.
    const legacy = {
      externalId: 'm-legacy',
      title: 'Old Syllabus',
      type: 'file',
    } as ICourseMaterial;
    const res = makeResponse([
      [legacy, makeMaterial({ externalId: 'm-new', assignmentExternalId: 'a-1' })],
    ]);

    const { forAssignment, courseMaterials } = partitionMaterials(res, 'a-1');

    expect(forAssignment.map((m) => m.externalId)).toEqual(['m-new']);
    expect(courseMaterials.map((m) => m.externalId)).toEqual(['m-legacy']);
  });

  it('should flatten materials across ALL courses in the response', () => {
    const res = makeResponse([
      [makeMaterial({ externalId: 'm-1', assignmentExternalId: 'a-1' })],
      [
        makeMaterial({ externalId: 'm-2', assignmentExternalId: 'a-1' }),
        makeMaterial({ externalId: 'm-3' }),
      ],
    ]);

    const { forAssignment, courseMaterials } = partitionMaterials(res, 'a-1');

    expect(forAssignment.map((m) => m.externalId).sort()).toEqual(['m-1', 'm-2']);
    expect(courseMaterials.map((m) => m.externalId)).toEqual(['m-3']);
  });

  it('should sort each bucket postedAt-descending with undated materials last', () => {
    const res = makeResponse([
      [
        makeMaterial({ externalId: 'c-none' }),
        makeMaterial({ externalId: 'c-old', postedAt: '2026-01-10T12:00:00Z' }),
        makeMaterial({ externalId: 'c-bad', postedAt: 'garbage' }),
        makeMaterial({ externalId: 'c-new', postedAt: '2026-04-01T12:00:00Z' }),
        makeMaterial({
          externalId: 'a-old',
          assignmentExternalId: 'a-1',
          postedAt: '2026-02-01T12:00:00Z',
        }),
        makeMaterial({
          externalId: 'a-new',
          assignmentExternalId: 'a-1',
          postedAt: '2026-03-01T12:00:00Z',
        }),
      ],
    ]);

    const { forAssignment, courseMaterials } = partitionMaterials(res, 'a-1');

    expect(forAssignment.map((m) => m.externalId)).toEqual(['a-new', 'a-old']);
    const courseIds = courseMaterials.map((m) => m.externalId);
    expect(courseIds.slice(0, 2)).toEqual(['c-new', 'c-old']);
    // Undated and unparseable postedAt sink to the bottom (relative order free).
    expect(courseIds.slice(2).sort()).toEqual(['c-bad', 'c-none']);
  });

  it('should return two empty buckets for an empty response', () => {
    const { forAssignment, courseMaterials } = partitionMaterials(makeResponse([]), 'a-1');
    expect(forAssignment).toEqual([]);
    expect(courseMaterials).toEqual([]);
  });
});

describe('classifyResource', () => {
  it('should prefer a signed downloadUrl even when a raw url is present', () => {
    const link = classifyResource(
      { downloadUrl: `${API_BASE}/api/assets/abc?sig=xyz`, url: 'https://portal.school.edu/f/1' },
      API_BASE
    );
    expect(link).toEqual({ href: `${API_BASE}/api/assets/abc?sig=xyz`, kind: 'download' });
  });

  it('should classify a foreign-host url as portal (tappable)', () => {
    const link = classifyResource({ url: 'https://portal.school.edu/files/1' }, API_BASE);
    expect(link).toEqual({ href: 'https://portal.school.edu/files/1', kind: 'portal' });
  });

  it('should classify an unsigned url on our own host as own-unsigned (would 401)', () => {
    const link = classifyResource({ url: `${API_BASE}/api/assets/abc` }, API_BASE);
    expect(link).toEqual({ href: null, kind: 'own-unsigned' });
  });

  it('should compare hosts case-insensitively', () => {
    const link = classifyResource({ url: 'HTTPS://API.TEST.LOCAL/api/assets/abc' }, API_BASE);
    expect(link).toEqual({ href: null, kind: 'own-unsigned' });
  });

  it('should ignore the port when matching our own host', () => {
    const link = classifyResource({ url: 'https://api.test.local:8443/api/assets/abc' }, API_BASE);
    expect(link).toEqual({ href: null, kind: 'own-unsigned' });
  });

  it('should classify a relative /api/assets path as own-unsigned', () => {
    const link = classifyResource({ url: '/api/assets/abc' }, API_BASE);
    expect(link).toEqual({ href: null, kind: 'own-unsigned' });
  });

  it('should classify a missing url as none', () => {
    expect(classifyResource({}, API_BASE)).toEqual({ href: null, kind: 'none' });
    expect(classifyResource({ url: '' }, API_BASE)).toEqual({ href: null, kind: 'none' });
  });

  it('should treat an empty downloadUrl as absent and fall through to the url', () => {
    const link = classifyResource(
      { downloadUrl: '', url: 'https://portal.school.edu/files/1' },
      API_BASE
    );
    expect(link).toEqual({ href: 'https://portal.school.edu/files/1', kind: 'portal' });
  });

  it('should let scheme-only links (mailto:) through as portal for the OS to handle', () => {
    const link = classifyResource({ url: 'mailto:teacher@school.edu' }, API_BASE);
    expect(link).toEqual({ href: 'mailto:teacher@school.edu', kind: 'portal' });
  });
});
