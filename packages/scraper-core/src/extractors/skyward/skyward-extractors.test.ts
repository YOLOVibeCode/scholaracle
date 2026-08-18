/**
 * @jest-environment jsdom
 *
 * Skyward extractor tests — driver-contract: extractSkywardCourseAssignments
 * must accept a SINGLE options object (ISP: narrow args, no positional multi-arg).
 */

import { extractSkywardCourseAssignments } from './skyward-extractors';

describe('driver-contract — extractSkywardCourseAssignments', () => {
  it('accepts a single options object (not two positional strings)', () => {
    // If the function still has two positional params, .length === 2 and this test fails.
    expect(extractSkywardCourseAssignments.length).toBe(1);
  });

  it('returns an empty array when document has no #gradeInfoDialog', () => {
    // Running pure in Node (no DOM) — the function should degrade gracefully.
    const result = extractSkywardCourseAssignments({ courseName: 'ALGEBRA', coursePeriod: '1' });
    expect(result).toEqual([]);
  });
});
