import {
  STUDENT_NOTE_MAX_CHARS,
  STUDENT_STATUSES,
  type StudentStatus,
} from '@scholaracle/contracts';
import {
  NEED_HELP_SENT_MESSAGE,
  STUDENT_STATUS_LABELS,
  STUDENT_STATUS_MARKS,
} from '@scholaracle/studio-core';

/**
 * Pure state for the status sheet shared by Today and This week: the four
 * options, the "Need help" note step (140 chars, spec §6 Q3), and the copy
 * shown after sending. The component only renders what this file decides.
 */

export type StatusSheetStep = 'pick' | 'note' | 'sent';

export interface IStatusOption {
  readonly status: StudentStatus;
  readonly label: string;
  readonly mark: string;
  readonly testId: string;
}

export const STATUS_OPTIONS: readonly IStatusOption[] = STUDENT_STATUSES.map((status) => ({
  status,
  label: STUDENT_STATUS_LABELS[status],
  mark: STUDENT_STATUS_MARKS[status],
  testId: `status-option-${status}`,
}));

export const NEED_HELP_TITLE = 'Need help?';
export const NEED_HELP_NOTE_PLACEHOLDER = 'Note (optional)';
export const STATUS_SAVE_ERROR = "Couldn't save that. Try again.";
export { NEED_HELP_SENT_MESSAGE, STUDENT_NOTE_MAX_CHARS };

export function needHelpPrompt(title: string): string {
  return `Tell your grown-ups you're stuck on "${title}".`;
}

/** Which step a pick leads to: Need help asks for a note first; the rest save at once. */
export function stepAfterPick(status: StudentStatus): StatusSheetStep {
  return status === 'need_help' ? 'note' : 'pick';
}

/** Hard cap on what the field can hold, so a paste cannot exceed the limit. */
export function clampNote(note: string): string {
  return Array.from(note).slice(0, STUDENT_NOTE_MAX_CHARS).join('');
}

export function noteCounter(note: string): string {
  return `${Array.from(note).length}/${STUDENT_NOTE_MAX_CHARS}`;
}

/** Trimmed note for the wire, or undefined when the student left it blank. */
export function normalizeNote(note: string): string | undefined {
  const trimmed = clampNote(note).trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Sheet title: the assignment, so the student knows what they are marking. */
export function sheetTitle(assignmentTitle: string): string {
  return assignmentTitle;
}

export function isSelected(option: IStatusOption, current: StudentStatus | undefined): boolean {
  return current !== undefined && option.status === current;
}
