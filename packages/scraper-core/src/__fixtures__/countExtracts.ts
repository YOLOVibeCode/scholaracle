/**
 * Aggregate counts from recipe extracts for golden-file replay assertions.
 */
import type { IAeriesFullExtract } from '../extractors/aeries/aeries-extractors';
import type { ISkywardFullExtract } from '../extractors/skyward/skyward-extractors';
import type { ICanvasBrowserExtract } from '../extractors/canvas/canvas-extractors';

export interface IAeriesReplayCounts {
  readonly studentCount: number;
  readonly courseCount: number;
  readonly assignmentCount: number;
  readonly attendanceCount: number;
}

export interface ISkywardReplayCounts {
  readonly courseCount: number;
  readonly assignmentCount: number;
  readonly missingAssignmentCount: number;
  readonly attendanceCount: number;
  readonly scheduleCount: number;
}

export interface ICanvasReplayCounts {
  readonly courseCount: number;
  readonly assignmentCount: number;
  readonly moduleItemCount: number;
  readonly fileCount: number;
  readonly toDoCount: number;
  readonly upcomingEventCount: number;
  readonly announcementCount: number;
}

export function countAeriesExtract(extract: IAeriesFullExtract): IAeriesReplayCounts {
  let assignmentCount = 0;
  let courseCount = 0;
  for (const s of extract.students) {
    courseCount += s.courses.length;
    for (const c of s.courses) {
      assignmentCount += c.assignments.length;
    }
  }
  let attendanceCount = 0;
  for (const s of extract.students) {
    attendanceCount += s.attendance.length;
  }
  return {
    studentCount: extract.students.length,
    courseCount,
    assignmentCount,
    attendanceCount,
  };
}

export function countSkywardExtract(extract: ISkywardFullExtract): ISkywardReplayCounts {
  return {
    courseCount: extract.courses.length,
    assignmentCount: extract.assignments.length,
    missingAssignmentCount: extract.missingAssignments.length,
    attendanceCount: extract.attendance.length,
    scheduleCount: extract.schedule.length,
  };
}

export function countCanvasExtract(extract: ICanvasBrowserExtract): ICanvasReplayCounts {
  let assignmentCount = 0;
  let moduleItemCount = 0;
  let fileCount = 0;
  for (const c of extract.courses) {
    assignmentCount += c.assignments.length;
    for (const m of c.modules) {
      moduleItemCount += m.items.length;
    }
    fileCount += c.files.length;
  }
  return {
    courseCount: extract.courses.length,
    assignmentCount,
    moduleItemCount,
    fileCount,
    toDoCount: extract.toDoItems.length,
    upcomingEventCount: extract.upcomingEvents.length,
    announcementCount: extract.announcements.length,
  };
}
