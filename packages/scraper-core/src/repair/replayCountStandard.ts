import type { IAeriesReplayCounts } from '../__fixtures__/countExtracts';

export function meetsAeriesCountStandard(
  actual: IAeriesReplayCounts,
  standard: IAeriesReplayCounts
): boolean {
  return (
    actual.studentCount >= standard.studentCount &&
    actual.courseCount >= standard.courseCount &&
    actual.assignmentCount >= standard.assignmentCount &&
    actual.attendanceCount >= standard.attendanceCount
  );
}

export function formatCountDeficits(
  actual: IAeriesReplayCounts,
  standard: IAeriesReplayCounts
): string {
  const parts: string[] = [];
  if (actual.studentCount < standard.studentCount) {
    parts.push(`students ${actual.studentCount}<${standard.studentCount}`);
  }
  if (actual.courseCount < standard.courseCount) {
    parts.push(`courses ${actual.courseCount}<${standard.courseCount}`);
  }
  if (actual.assignmentCount < standard.assignmentCount) {
    parts.push(`assignments ${actual.assignmentCount}<${standard.assignmentCount}`);
  }
  if (actual.attendanceCount < standard.attendanceCount) {
    parts.push(`attendance ${actual.attendanceCount}<${standard.attendanceCount}`);
  }
  return parts.join('; ');
}
