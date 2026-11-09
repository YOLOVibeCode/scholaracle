import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { ObjectId, type Db } from 'mongodb';
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  type ISharingInviteRequest,
  type ISharingInviteResult,
  type ISharingInviteSelection,
  type SharingAlertChannel,
  type SharingInvitePerStudentStatus,
  type SharingLabel,
} from '@scholaracle/contracts';
import {
  StudentRepository,
  UserRepository,
  type ISharedParent,
  type Student,
} from '@scholaracle/database';
import { MagicLoginLink, INVITE_GROUP_TTL_MS } from '../provision/MagicLoginLink';
import { createContactSmsOptIn, type IContactSmsOptIn } from '../sms/contactSmsOptIn';
import type { ISharingEmailSender } from './SharingInviteEmailSender';
import { SharingRateLimiter } from './SharingRateLimiter';
import { createSharingAuditRecorder, type SharingAuditRecorder } from './sharingAudit';
import {
  acceptedSharedWith,
  declinedSharedWith,
  normalizeEmail,
  removedSharedWith,
} from './sharedWithOps';

export interface ISharingServiceDeps {
  readonly database: Db;
  /** Web origin used in emails and opt-in links: the one source for every sharing route. */
  readonly baseUrl: string;
  readonly emailSender?: ISharingEmailSender;
  readonly magicLoginLink?: MagicLoginLink;
  readonly contactSmsOptIn?: IContactSmsOptIn;
  readonly rateLimiter?: SharingRateLimiter;
  readonly audit?: SharingAuditRecorder;
  readonly now?: () => Date;
}

/** The contacts routes also accept `alertTypes`; the cross-student API does not expose it yet. */
export type SharingInviteInput = ISharingInviteRequest & {
  readonly alertTypes?: readonly string[];
};

export interface ISharingInviteOutcome extends ISharingInviteResult {
  /** The entry written for the first newly invited student (what the contacts POST echoes back). */
  readonly contact?: ISharedParent;
}

export interface ISharingResendOutcome {
  readonly sentTo: string;
  readonly studentIds: readonly string[];
  readonly expiresAt: Date;
}

const LABELS: readonly SharingLabel[] = ['parent', 'guardian', 'caregiver'];
const CHANNELS: readonly SharingAlertChannel[] = ['email', 'sms', 'push'];
const MAX_STUDENTS_PER_INVITE = 20;

function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function parseStudentIds(raw: unknown, fallback?: readonly string[]): readonly string[] {
  const source = raw === undefined ? fallback : raw;
  if (!Array.isArray(source) || source.length === 0) {
    throw new ValidationError('studentIds must be a non-empty array');
  }
  const ids = [...new Set(source.map((v) => (typeof v === 'string' ? v.trim() : '')))];
  if (ids.some((id) => !ObjectId.isValid(id))) {
    throw new ValidationError('studentIds must be student ids');
  }
  if (ids.length > MAX_STUDENTS_PER_INVITE) {
    throw new ValidationError(`At most ${MAX_STUDENTS_PER_INVITE} students per invitation`);
  }
  return ids;
}

function parseChannels(raw: unknown): readonly SharingAlertChannel[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) {
    throw new ValidationError('alertChannels must be an array');
  }
  const channels = [...new Set(raw)];
  if (!channels.every((c): c is SharingAlertChannel => CHANNELS.includes(c as never))) {
    throw new ValidationError('alertChannels may only contain email, sms or push');
  }
  return channels;
}

function parseAlertTypes(raw: unknown): readonly string[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || !raw.every((t) => typeof t === 'string')) {
    throw new ValidationError('alertTypes must be an array of strings');
  }
  return raw as readonly string[];
}

/**
 * Parse and validate an invitation body. `fallbackStudentIds` lets the per-student routes
 * (`POST /students/:id/contacts`) reuse the same shape without a `studentIds` field.
 */
export function parseSharingInviteBody(
  body: unknown,
  fallbackStudentIds?: readonly string[]
): SharingInviteInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const email = optionalString(b['email']);
  if (!email || !email.includes('@')) {
    throw new ValidationError('Valid email is required');
  }
  const rawLabel = b['label'] ?? b['role'];
  const label: SharingLabel = LABELS.includes(rawLabel as SharingLabel)
    ? (rawLabel as SharingLabel)
    : 'parent';
  if (b['isAdmin'] !== undefined && typeof b['isAdmin'] !== 'boolean') {
    throw new ValidationError('isAdmin must be a boolean');
  }
  const name = optionalString(b['name']);
  const phone = optionalString(b['phone']);
  const alertChannels = parseChannels(b['alertChannels']);
  const alertTypes = parseAlertTypes(b['alertTypes']);
  return {
    email: normalizeEmail(email),
    label,
    studentIds: parseStudentIds(b['studentIds'], fallbackStudentIds),
    ...(name !== undefined ? { name } : {}),
    ...(phone !== undefined ? { phone } : {}),
    ...(b['isAdmin'] === true ? { isAdmin: true } : {}),
    ...(alertChannels !== undefined ? { alertChannels } : {}),
    ...(alertTypes !== undefined ? { alertTypes } : {}),
  };
}

/** Parse `{ inviteGroupId } | { studentIds }` for accept / decline. */
export function parseSharingSelection(body: unknown): ISharingInviteSelection {
  const b = (body ?? {}) as Record<string, unknown>;
  const groupId = optionalString(b['inviteGroupId']);
  if (groupId !== undefined) {
    return { inviteGroupId: groupId };
  }
  if (b['studentIds'] !== undefined) {
    return { studentIds: parseStudentIds(b['studentIds']) };
  }
  throw new ValidationError('Provide inviteGroupId or studentIds');
}

/**
 * Everything that changes `sharedWith` on behalf of a signed-in adult: invitations (across one or
 * many students), re-sends, accept / decline, leaving, and admin removal. ONE instance is built
 * in server.ts and injected into the students router and the sharing router, so the magic-link
 * issuer, SMS opt-in, rate limiter and audit trail exist once and share one web origin.
 */
export class SharingService {
  /** The magic-link issuer the routes use for contact links too (same token store, same origin). */
  public readonly magicLoginLink: MagicLoginLink;
  /** Consent-first texting opt-in, shared with the contacts list (`smsStatus`). */
  public readonly contactSmsOptIn: IContactSmsOptIn;

  private readonly _students: StudentRepository;
  private readonly _users: UserRepository;
  private readonly _rate: SharingRateLimiter;
  private readonly _audit: SharingAuditRecorder;
  private readonly _emails?: ISharingEmailSender;
  private readonly _baseUrl: string;
  private readonly _now: () => Date;

  constructor(deps: ISharingServiceDeps) {
    this._students = new StudentRepository(deps.database);
    this._users = new UserRepository(deps.database);
    this._baseUrl = deps.baseUrl.replace(/\/$/, '');
    this.magicLoginLink =
      deps.magicLoginLink ??
      new MagicLoginLink({ database: deps.database, baseUrl: this._baseUrl, now: deps.now });
    this.contactSmsOptIn =
      deps.contactSmsOptIn ?? createContactSmsOptIn(deps.database, this._baseUrl);
    this._rate = deps.rateLimiter ?? new SharingRateLimiter(deps.database, deps.now);
    this._audit = deps.audit ?? createSharingAuditRecorder(deps.database);
    this._emails = deps.emailSender;
    this._now = deps.now ?? ((): Date => new Date());
  }

  /**
   * Invite one adult to one or more students. The caller must be able to administer every
   * student (404 when they cannot even see one, 403 when they see it but are not admin).
   * Students where the email is already invited or accepted are reported, never an error, and
   * a request that invites nobody new costs no daily invitation slot.
   */
  public async invite(
    req: Request,
    actorUserId: string,
    input: SharingInviteInput
  ): Promise<ISharingInviteOutcome> {
    const students = await this._loadAdministrable(actorUserId, input.studentIds);
    const inviter = await this._users.findById(actorUserId);
    if (inviter && normalizeEmail(inviter.email) === input.email) {
      throw new ValidationError('You cannot invite yourself');
    }

    const inviteGroupId = randomUUID();
    const statuses = await this._duplicateStatuses(students, input.email);
    const perStudent = students.map((student) => ({
      studentId: student._id!.toString(),
      status: statuses.get(student._id!.toString()) ?? ('invited' as const),
    }));
    const toInvite = students.filter((s) => !statuses.has(s._id!.toString()));
    if (toInvite.length === 0) {
      return { inviteGroupId, perStudent };
    }

    // Only an invitation that actually goes out consumes a daily slot.
    await this._rate.takeInvite(actorUserId);
    const entry = this._newEntry(input, actorUserId, inviteGroupId);
    await Promise.all(
      toInvite.map(async (student) => {
        const kept = student.sharedWith.filter((sp) => sp.email !== input.email);
        await this._students.update(student._id!, { sharedWith: [...kept, entry] });
        await this._audit(req, 'sharing:invite', student._id!.toString(), input.email, {
          inviteGroupId,
          label: input.label,
          isAdmin: input.isAdmin === true,
          studentCount: input.studentIds.length,
        });
      })
    );

    const inviterName = inviter?.name ?? 'A parent';
    await this._sendInvitation(
      { email: input.email, name: input.name },
      inviterName,
      toInvite,
      inviteGroupId
    );
    // No text to the contact: they opt in themselves from a link the inviter shares.
    const smsOptInUrl = await this.contactSmsOptIn.issueIfTexting({
      studentId: toInvite[0]!._id!.toString(),
      contactEmail: input.email,
      inviterName,
      phone: input.phone,
      alertChannels: input.alertChannels,
    });
    return {
      inviteGroupId,
      perStudent,
      ...(smsOptInUrl ? { smsOptInUrl } : {}),
      contact: entry,
    };
  }

  /** Re-send the one email of an invite group (admin on every student; 5 per group per day). */
  public async resend(
    req: Request,
    actorUserId: string,
    inviteGroupId: string
  ): Promise<ISharingResendOutcome> {
    const students = await this._students.findPendingByInviteGroupId(inviteGroupId);
    if (students.length === 0) {
      throw new NotFoundError('No pending invitations for this group');
    }
    if (students.some((student) => !student.canAdmin(actorUserId))) {
      throw new ForbiddenError('Only an owner or admin can re-send this invitation');
    }
    const entry = students[0]!.sharedWith.find(
      (sp) => sp.inviteGroupId === inviteGroupId && sp.status === 'pending'
    );
    if (!entry) {
      throw new NotFoundError('No pending invitations for this group');
    }
    await this._rate.takeResend(inviteGroupId);
    const inviter = await this._users.findById(actorUserId);
    const issued = await this._sendInvitation(
      { email: entry.email, name: entry.name },
      inviter?.name ?? 'A parent',
      students,
      inviteGroupId
    );
    const studentIds = students.map((s) => s._id!.toString());
    await Promise.all(
      studentIds.map((studentId) =>
        this._audit(req, 'sharing:link_sent', studentId, entry.email, { inviteGroupId })
      )
    );
    return { sentTo: entry.email, studentIds, expiresAt: issued.expiresAt };
  }

  /** Accept the caller's pending invitations for the selected students. */
  public async accept(
    req: Request,
    email: string,
    userId: string,
    selection: ISharingInviteSelection
  ): Promise<readonly string[]> {
    const students = await this._selectPending(email, selection);
    const acceptedAt = this._now();
    const accepted = await Promise.all(
      students.map(async (student) => {
        const next = acceptedSharedWith(student, email, userId, acceptedAt);
        if (!next) return null;
        const studentId = student._id!.toString();
        await this._students.update(student._id!, { sharedWith: next });
        await this.invalidateTokens(email, studentId);
        await this._audit(req, 'sharing:accept', studentId, email);
        return studentId;
      })
    );
    const ids = accepted.filter((id): id is string => id !== null);
    if (ids.length === 0) {
      throw new NotFoundError('No pending invitations found');
    }
    return ids;
  }

  /** Decline the caller's pending invitations for the selected students. */
  public async decline(
    req: Request,
    email: string,
    selection: ISharingInviteSelection
  ): Promise<readonly string[]> {
    const students = await this._selectPending(email, selection);
    const declined = await Promise.all(
      students.map(async (student) => {
        const next = declinedSharedWith(student, email);
        if (!next) return null;
        const studentId = student._id!.toString();
        await this._students.update(student._id!, { sharedWith: next });
        await this.invalidateTokens(email, studentId);
        await this._audit(req, 'sharing:decline', studentId, email);
        return studentId;
      })
    );
    const ids = declined.filter((id): id is string => id !== null);
    if (ids.length === 0) {
      throw new NotFoundError('No pending invitations found');
    }
    return ids;
  }

  /**
   * The caller removes their own accepted row (owner decision Q3). Their links for THIS student
   * die at once (links for other students they follow stay valid) and the owner is told by email.
   * The owner cannot leave their own student.
   */
  public async leave(
    req: Request,
    userId: string,
    email: string,
    studentId: string
  ): Promise<void> {
    const student = await this._students.findById(studentId);
    if (!student || !student.hasAccess(userId)) {
      throw new NotFoundError('Student not found');
    }
    if (student.isOwner(userId)) {
      throw new ForbiddenError(
        'The owner cannot leave a student. Remove the student or transfer it instead.'
      );
    }
    const row = student.sharedWith.find((sp) => sp.status === 'accepted' && sp.userId === userId);
    if (!row) {
      throw new NotFoundError('You do not follow this student');
    }
    const next = student.sharedWith.filter((sp) => sp !== row);
    await this._students.update(student._id!, { sharedWith: next });
    await this.invalidateTokens(row.email, studentId, userId);
    await this._audit(req, 'sharing:leave', studentId, row.email, { email });
    await this._notifyOwnerLeft(student, row, userId);
  }

  /** An owner or admin removes someone (pending or accepted). Their links for the student die. */
  public async removeByAdmin(req: Request, student: Student, targetEmail: string): Promise<void> {
    const email = normalizeEmail(targetEmail);
    const removed = student.sharedWith.find((sp) => sp.email === email);
    const next = removedSharedWith(student, email);
    if (!next) {
      throw new NotFoundError('Contact not found');
    }
    await this._students.update(student._id!, { sharedWith: next });
    const studentId = student._id!.toString();
    await this.invalidateTokens(email, studentId, removed?.userId);
    await this._audit(req, 'sharing:remove', studentId, email);
  }

  /**
   * Every unused invitation link for this email + student, plus (when the person has an account)
   * the sign-in links that were issued for this student. Links for other students stay valid.
   */
  public async invalidateTokens(email: string, studentId: string, userId?: string): Promise<void> {
    await this.magicLoginLink.invalidateInviteTokens(email, studentId);
    if (userId) {
      await this.magicLoginLink.invalidateContactLoginTokens(userId, studentId);
    }
  }

  /** One `$in` load; every id must exist, be visible (else 404) and be administrable (else 403). */
  private async _loadAdministrable(
    actorUserId: string,
    studentIds: readonly string[]
  ): Promise<readonly Student[]> {
    const students = await this._students.findByIds(studentIds);
    if (students.length !== studentIds.length || students.some((s) => !s.hasAccess(actorUserId))) {
      throw new NotFoundError('Student not found');
    }
    if (students.some((s) => !s.canAdmin(actorUserId))) {
      throw new ForbiddenError('Only an owner or admin can share this student');
    }
    return students;
  }

  /**
   * Which students already have this person: accepted / pending entries, or the owner's own
   * address. One owner lookup per distinct owner, not per student.
   */
  private async _duplicateStatuses(
    students: readonly Student[],
    email: string
  ): Promise<Map<string, SharingInvitePerStudentStatus>> {
    const ownerIds = [...new Set(students.map((s) => s.userId.toString()))];
    const owners = await Promise.all(ownerIds.map((id) => this._users.findById(id)));
    const ownerEmails = new Map(
      ownerIds.map((id, i) => {
        const owner = owners[i];
        return [id, owner ? normalizeEmail(owner.email) : null] as const;
      })
    );
    const statuses = new Map<string, SharingInvitePerStudentStatus>();
    for (const student of students) {
      const existing = student.sharedWith.find((sp) => sp.email === email);
      const id = student._id!.toString();
      if (existing?.status === 'accepted') statuses.set(id, 'already_accepted');
      else if (existing?.status === 'pending') statuses.set(id, 'already_invited');
      else if (ownerEmails.get(student.userId.toString()) === email) {
        statuses.set(id, 'already_accepted');
      }
    }
    return statuses;
  }

  private _newEntry(
    input: SharingInviteInput,
    actorUserId: string,
    inviteGroupId: string
  ): ISharedParent {
    return {
      email: input.email,
      role: input.label,
      status: 'pending',
      invitedAt: this._now(),
      receiveAlerts: true,
      alertChannels: input.alertChannels ?? ['email'],
      inviteGroupId,
      invitedByUserId: actorUserId,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.isAdmin === true ? { isAdmin: true } : {}),
      ...(input.alertTypes !== undefined ? { alertTypes: input.alertTypes } : {}),
    };
  }

  private async _sendInvitation(
    recipient: { readonly email: string; readonly name?: string },
    inviterName: string,
    students: readonly Student[],
    inviteGroupId: string
  ): Promise<{ expiresAt: Date }> {
    const studentIds = students.map((s) => s._id!.toString());
    const issued = await this.magicLoginLink.issueForInviteGroup(
      recipient.email,
      studentIds,
      inviteGroupId
    );
    if (this._emails) {
      try {
        await this._emails.sendInvite({
          to: recipient.email,
          recipientName: recipient.name,
          inviterName,
          studentNames: students.map((s) => s.name),
          inviteUrl: issued.loginUrl,
          baseUrl: this._baseUrl,
          expiresInDays: Math.round(INVITE_GROUP_TTL_MS / (24 * 60 * 60 * 1000)),
        });
      } catch (err) {
        console.error('[sharing] invite email failed', err);
      }
    }
    return { expiresAt: issued.expiresAt };
  }

  private async _selectPending(
    email: string,
    selection: ISharingInviteSelection
  ): Promise<readonly Student[]> {
    if ('inviteGroupId' in selection) {
      const students = await this._students.findPendingByInviteGroupId(selection.inviteGroupId);
      return students.filter((s) =>
        s.sharedWith.some(
          (sp) =>
            sp.inviteGroupId === selection.inviteGroupId &&
            sp.status === 'pending' &&
            sp.email === email
        )
      );
    }
    return this._students.findByIds(selection.studentIds);
  }

  private async _notifyOwnerLeft(
    student: Student,
    row: ISharedParent,
    leaverUserId: string
  ): Promise<void> {
    if (!this._emails) return;
    try {
      const [owner, leaver] = await Promise.all([
        this._users.findById(student.userId.toString()),
        this._users.findById(leaverUserId),
      ]);
      if (!owner) return;
      await this._emails.sendLeftNotice({
        to: owner.email,
        leaverName: row.name ?? leaver?.name ?? row.email,
        studentName: student.name,
        baseUrl: this._baseUrl,
      });
    } catch (err) {
      console.error('[sharing] owner notice email failed', err);
    }
  }
}
