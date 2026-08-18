/**
 * Canvas transformer tests — TDD for native IDs, announcement body, and
 * material-to-assignment matching.
 *
 * RED → implement → GREEN
 */

import {
  transformCanvasExtract,
  matchMaterialsToAssignments,
  type ICanvasBrowserExtract,
  type ICanvasBrowserCourse,
} from '../../index';
import type { ITransformContext } from '../../types';

const ctx: ITransformContext = {
  provider: 'canvas',
  adapterId: 'com.instructure.canvas',
  studentExternalId: 'stu-emma',
  institutionExternalId: 'inst-test',
};

function makeCourse(overrides: Partial<ICanvasBrowserCourse> = {}): ICanvasBrowserCourse {
  return {
    id: '101',
    name: 'AP Math',
    courseCode: 'MATH-AP',
    teachers: [],
    url: 'https://school.instructure.com/courses/101',
    grade: undefined,
    assignments: [],
    modules: [],
    files: [],
    ...overrides,
  };
}

function makeExtract(overrides: Partial<ICanvasBrowserExtract> = {}): ICanvasBrowserExtract {
  return {
    user: 'Emma Lewis',
    courses: [],
    toDoItems: [],
    upcomingEvents: [],
    announcements: [],
    timestamp: '2026-01-15T10:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// NATIVE IDs
// ---------------------------------------------------------------------------

describe('native IDs — Canvas', () => {
  it('assignment externalId uses native Canvas assignment ID, not array index', () => {
    const extract = makeExtract({
      courses: [
        makeCourse({
          assignments: [
            { id: '987', name: 'Homework 1', dueDate: '2026-01-20T23:59:00Z', points: '10 pts' },
            { id: '988', name: 'Homework 2', dueDate: '2026-01-27T23:59:00Z', points: '10 pts' },
          ],
        }),
      ],
    });
    const ops = transformCanvasExtract(extract, ctx);
    const assignOps = ops.filter((o) => o.entity === 'assignment');
    expect(assignOps).toHaveLength(2);
    expect(assignOps[0]?.key.externalId).toBe('canvas-assignment-987');
    expect(assignOps[1]?.key.externalId).toBe('canvas-assignment-988');
    // must NOT look like an index-based ID
    expect(assignOps[0]?.key.externalId).not.toMatch(/-assignment-\d$/);
  });

  it('assignment externalId falls back to course+index when id absent', () => {
    const extract = makeExtract({
      courses: [
        makeCourse({
          assignments: [{ name: 'Untitled', dueDate: undefined, points: undefined }],
        }),
      ],
    });
    const ops = transformCanvasExtract(extract, ctx);
    const assignOp = ops.find((o) => o.entity === 'assignment');
    // fallback must still be stable and include courseId
    expect(assignOp?.key.externalId).toMatch(/^canvas-assignment-101-/);
  });

  it('courseMaterial externalId uses native Canvas file ID, not file name', () => {
    const extract = makeExtract({
      courses: [
        makeCourse({ files: [{ id: '555', name: 'notes.pdf', url: '/files/555/download' }] }),
      ],
    });
    const ops = transformCanvasExtract(extract, ctx);
    const matOp = ops.find((o) => o.entity === 'courseMaterial');
    expect(matOp?.key.externalId).toBe('canvas-file-555');
  });

  it('courseMaterial externalId falls back to course+slug when file id absent', () => {
    const extract = makeExtract({
      courses: [makeCourse({ files: [{ name: 'notes.pdf', url: '/files/download' }] })],
    });
    const ops = transformCanvasExtract(extract, ctx);
    const matOp = ops.find((o) => o.entity === 'courseMaterial');
    expect(matOp?.key.externalId).toMatch(/^canvas-file-101-/);
  });
});

// ---------------------------------------------------------------------------
// matchMaterialsToAssignments — returns native IDs, not array indices
// ---------------------------------------------------------------------------

describe('matchMaterialsToAssignments — native IDs', () => {
  it('maps file ID to native assignment ID via module co-occurrence', () => {
    const course = makeCourse({
      assignments: [
        { id: '987', name: 'HW 1' },
        { id: '988', name: 'HW 2' },
      ],
      files: [{ id: '555', name: 'worksheet.pdf', url: '' }],
      modules: [
        {
          id: 'mod-1',
          name: 'Module 1',
          position: 1,
          items: [
            { title: 'HW 1', type: 'Assignment', contentId: '987', position: 1 },
            { title: 'worksheet.pdf', type: 'File', contentId: '555', position: 2 },
          ],
        },
      ],
    });
    const result = matchMaterialsToAssignments(course);
    // Key is fileId, value is native assignment externalId
    expect(result.get('555')).toBe('canvas-assignment-987');
  });

  it('maps file ID to native assignment ID via description link', () => {
    const course = makeCourse({
      assignments: [{ id: '987', name: 'HW 1', description: 'Download /files/555' }],
      files: [{ id: '555', name: 'handout.pdf', url: '' }],
      modules: [],
    });
    const result = matchMaterialsToAssignments(course);
    expect(result.get('555')).toBe('canvas-assignment-987');
  });
});

// ---------------------------------------------------------------------------
// Announcement body
// ---------------------------------------------------------------------------

describe('announcement body', () => {
  it('emits body field in message op when present', () => {
    const extract = makeExtract({
      courses: [makeCourse()],
      announcements: [
        {
          title: 'HW Due',
          course: '101',
          date: '2026-01-10T00:00:00Z',
          body: 'Chapter 5 is due Friday',
        },
      ],
    });
    const ops = transformCanvasExtract(extract, ctx);
    const msgOp = ops.find((o) => o.entity === 'message');
    expect(msgOp?.record?.['body']).toBe('Chapter 5 is due Friday');
  });

  it('falls back to title when body absent', () => {
    const extract = makeExtract({
      courses: [makeCourse()],
      announcements: [{ title: 'Reminder', course: '101' }],
    });
    const ops = transformCanvasExtract(extract, ctx);
    const msgOp = ops.find((o) => o.entity === 'message');
    expect(msgOp?.record?.['body']).toBe('Reminder');
  });
});

// ---------------------------------------------------------------------------
// Events and to-do items are transformed
// ---------------------------------------------------------------------------

describe('upcoming events and to-do items', () => {
  it('emits eventSeries ops for upcomingEvents', () => {
    const extract = makeExtract({
      upcomingEvents: [{ title: 'Math Test', date: '2026-01-20T09:00:00Z', course: 'AP Math' }],
    });
    const ops = transformCanvasExtract(extract, ctx);
    expect(ops.some((o) => o.entity === 'eventSeries')).toBe(true);
  });

  it('emits assignment ops with status not_started for toDoItems', () => {
    const extract = makeExtract({
      toDoItems: [{ title: 'Read Ch 3', course: 'AP Math', dueDate: '2026-01-18T23:59:00Z' }],
    });
    const ops = transformCanvasExtract(extract, ctx);
    const todoOp = ops.find(
      (o) => o.entity === 'assignment' && o.record?.['status'] === 'not_started'
    );
    expect(todoOp).toBeDefined();
  });
});
