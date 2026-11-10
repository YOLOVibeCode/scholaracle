import type { StudentStatus } from '@scholaracle/contracts';
import { STUDENT_STATUS_OPTIONS, type IStudentStatusOption } from '@scholaracle/studio-core';

/**
 * Pure state for the status sheet shared by Today and This week. The copy and
 * note helpers live in studio-core (weekCopy) so the web sheet says the same
 * thing; this file only adds what the phone needs: test ids and step rules.
 */

export type StatusSheetStep = 'pick' | 'note' | 'sent';

export interface IStatusOption extends IStudentStatusOption {
  readonly testId: string;
}

export const STATUS_OPTIONS: readonly IStatusOption[] = STUDENT_STATUS_OPTIONS.map((option) => ({
  ...option,
  testId: `status-option-${option.status}`,
}));

/** Which step a pick leads to: Need help asks for a note first; the rest save at once. */
export function stepAfterPick(status: StudentStatus): StatusSheetStep {
  return status === 'need_help' ? 'note' : 'pick';
}

export function isSelected(option: IStatusOption, current: StudentStatus | undefined): boolean {
  return current !== undefined && option.status === current;
}

/** Backdrop, Cancel and the hardware back button are ignored while a save is in flight. */
export function canDismiss(busy: boolean): boolean {
  return !busy;
}
