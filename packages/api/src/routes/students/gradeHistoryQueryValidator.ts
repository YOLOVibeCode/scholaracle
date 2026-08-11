/**
 * Validates GET grade-history query params (from, to). ISP: single concern.
 */

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export interface IGradeHistoryQueryParams {
  readonly from?: string;
  readonly to?: string;
}

export type GradeHistoryQueryValidation =
  { readonly valid: true } | { readonly valid: false; readonly error: string };

/** Returns validation result; invalid if from/to are not YYYY-MM-DD or if from > to. */
export function validateGradeHistoryQuery(
  params: IGradeHistoryQueryParams
): GradeHistoryQueryValidation {
  const { from, to } = params;
  if (from !== undefined && from !== '' && !DATE_REGEX.test(from)) {
    return { valid: false, error: 'Invalid from date format (expected YYYY-MM-DD)' };
  }
  if (to !== undefined && to !== '' && !DATE_REGEX.test(to)) {
    return { valid: false, error: 'Invalid to date format (expected YYYY-MM-DD)' };
  }
  if (from != null && to != null && from !== '' && to !== '' && from > to) {
    return { valid: false, error: 'from must be before or equal to to' };
  }
  return { valid: true };
}
