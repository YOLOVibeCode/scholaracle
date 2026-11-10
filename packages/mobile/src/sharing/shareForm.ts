/**
 * "Share with someone" form: state, validation, the POST /api/sharing/invites body, and the
 * per-student result copy. Pure: no React, no network.
 */

import type {
  ISharingInviteRequest,
  ISharingInviteResult,
  SharingAlertChannel,
  SharingInvitePerStudentStatus,
  SharingLabel,
} from '@scholaracle/contracts';
import { ApiError } from '../api/ApiError';
import { joinNames, toggleInList } from './common';

export interface IShareFormState {
  readonly email: string;
  readonly name: string;
  readonly phone: string;
  readonly label: SharingLabel;
  readonly isAdmin: boolean;
  readonly studentIds: readonly string[];
  readonly channels: readonly SharingAlertChannel[];
}

export const SHARE_LABELS: readonly { readonly value: SharingLabel; readonly text: string }[] = [
  { value: 'parent', text: 'Parent' },
  { value: 'guardian', text: 'Guardian' },
  { value: 'caregiver', text: 'Caregiver' },
];

/** Email and push on by default (owner decision 2026-11-09); text needs a phone. */
export const DEFAULT_SHARE_CHANNELS: readonly SharingAlertChannel[] = ['email', 'push'];

export function initialShareForm(preselectStudentId?: string): IShareFormState {
  return {
    email: '',
    name: '',
    phone: '',
    label: 'parent',
    isAdmin: false,
    studentIds: preselectStudentId ? [preselectStudentId] : [],
    channels: DEFAULT_SHARE_CHANNELS,
  };
}

export function toggleStudent(state: IShareFormState, studentId: string): IShareFormState {
  return { ...state, studentIds: toggleInList(state.studentIds, studentId) };
}

export function toggleChannel(
  state: IShareFormState,
  channel: SharingAlertChannel
): IShareFormState {
  return { ...state, channels: toggleInList(state.channels, channel) };
}

/** Texting can only be picked once a phone number is typed. */
export function textChannelAvailable(state: Pick<IShareFormState, 'phone'>): boolean {
  return state.phone.trim() !== '';
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_SHAPE.test(value.trim());
}

export type ShareFormBuild =
  | { readonly ok: true; readonly request: ISharingInviteRequest }
  | { readonly ok: false; readonly error: string };

export function buildShareInvite(state: IShareFormState): ShareFormBuild {
  const email = state.email.trim().toLowerCase();
  if (!isValidEmail(email)) return { ok: false, error: 'Enter a valid email address.' };
  if (state.studentIds.length === 0) return { ok: false, error: 'Pick at least one student.' };
  if (state.channels.length === 0) {
    return { ok: false, error: 'Pick at least one way to send alerts.' };
  }
  const phone = state.phone.trim();
  if (state.channels.includes('sms') && phone === '') {
    return { ok: false, error: 'Add a phone number to send texts.' };
  }
  const name = state.name.trim();
  return {
    ok: true,
    request: {
      email,
      ...(name !== '' ? { name } : {}),
      ...(phone !== '' ? { phone } : {}),
      label: state.label,
      isAdmin: state.isAdmin,
      studentIds: state.studentIds,
      alertChannels: state.channels,
    },
  };
}

/** "1 student selected: Ava" · "No students selected". */
export function selectedSummary(
  state: Pick<IShareFormState, 'studentIds'>,
  namesById: ReadonlyMap<string, string>
): string {
  const names = state.studentIds.map((id) => namesById.get(id) ?? 'Student');
  if (names.length === 0) return 'No students selected';
  const count = names.length === 1 ? '1 student selected' : `${names.length} students selected`;
  return `${count}: ${joinNames(names)}`;
}

export interface IShareResultLine {
  readonly studentId: string;
  readonly name: string;
  readonly text: string;
  readonly ok: boolean;
}

const STATUS_TEXT: Readonly<Record<SharingInvitePerStudentStatus, string>> = {
  invited: 'Invitation sent',
  already_invited: 'Already invited',
  already_accepted: 'Already has access',
  no_access: "You can't share this student",
};

export function shareResultLines(
  result: Pick<ISharingInviteResult, 'perStudent'>,
  namesById: ReadonlyMap<string, string>
): readonly IShareResultLine[] {
  return result.perStudent.map((row) => ({
    studentId: row.studentId,
    name: namesById.get(row.studentId) ?? 'Student',
    text: STATUS_TEXT[row.status] ?? row.status,
    ok: row.status === 'invited',
  }));
}

/** One-line outcome: how many invitations went out. */
export function shareSummary(result: Pick<ISharingInviteResult, 'perStudent'>): string {
  const sent = result.perStudent.filter((row) => row.status === 'invited').length;
  if (sent === 0) return 'Nothing new to send: this person already has or was offered access.';
  return sent === 1
    ? 'One invitation email sent.'
    : `One invitation email sent for ${sent} students.`;
}

/**
 * Text the inviter passes on with the opt-in link. The person must opt in themselves: nothing is
 * texted to the number before they do (consent-first rule, unchanged).
 */
export function smsOptInShareMessage(args: {
  readonly inviteeName?: string;
  readonly studentNames: readonly string[];
  readonly url: string;
}): string {
  const greeting = args.inviteeName?.trim() ? `Hi ${args.inviteeName.trim()}, ` : 'Hi, ';
  const who = args.studentNames.length > 0 ? ` about ${joinNames(args.studentNames)}` : '';
  return (
    `${greeting}Scholarmancy can text you grade and assignment alerts${who}, but only after you ` +
    `opt in yourself. Open this link to opt in: ${args.url} ` +
    'Nothing is texted to you before you do.'
  );
}

/** Human copy for a failed send. */
export function shareFailureMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return 'You can only share students you own or manage.';
    if (err.status === 429) return 'Too many invitations today. Try again tomorrow.';
    if (err.status === 409) return 'This person already has access or an invitation.';
  }
  return err instanceof Error ? err.message : 'Could not send the invitation.';
}
