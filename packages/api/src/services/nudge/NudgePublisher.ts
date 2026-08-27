import { NotFoundError, RateLimitError } from '@scholaracle/contracts';
import type { StudentRepository, UserRepository } from '@scholaracle/database';
import type { IGuidanceClock, INotificationSink, INudgePublisher } from '@scholaracle/interfaces';
import { calendarDayKey, SystemGuidanceClock } from '@scholaracle/studio-core';
import type { Db } from 'mongodb';

export interface INudgePublisherDeps {
  readonly database: Db;
  readonly studentRepository: StudentRepository;
  readonly userRepository: UserRepository;
  readonly sink: INotificationSink;
  readonly clock?: IGuidanceClock;
}

function lastNudgedDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export class NudgePublisher implements INudgePublisher {
  private readonly _database: Db;
  private readonly _students: StudentRepository;
  private readonly _users: UserRepository;
  private readonly _sink: INotificationSink;
  private readonly _clock: IGuidanceClock;

  constructor(deps: INudgePublisherDeps) {
    this._database = deps.database;
    this._students = deps.studentRepository;
    this._users = deps.userRepository;
    this._sink = deps.sink;
    this._clock = deps.clock ?? new SystemGuidanceClock();
  }

  public async nudge(studentId: string, assignmentExternalId: string): Promise<void> {
    const student = await this._students.findById(studentId);
    if (student === null) {
      throw new NotFoundError('Student not found');
    }
    const parent = await this._users.findById(student.userId);
    const timezone = parent?.timezone ?? 'America/New_York';
    const now = this._clock.now();

    const external = student.studentId;
    const or: Record<string, unknown>[] = [{ studentId }];
    if (external !== undefined && external !== '') {
      or.push({ studentExternalId: external });
    }
    const assignment = await this._database.collection('slc_assignments').findOne({
      deletedAt: null,
      externalId: assignmentExternalId,
      $or: or,
    });
    if (assignment === null) {
      throw new NotFoundError('Assignment not found');
    }

    const previous = lastNudgedDate(assignment['lastNudgedAt']);
    if (previous !== null && calendarDayKey(previous, timezone) === calendarDayKey(now, timezone)) {
      throw new RateLimitError('Already nudged this assignment today');
    }

    await this._database
      .collection('slc_assignments')
      .updateOne({ _id: assignment._id }, { $set: { lastNudgedAt: now, updatedAt: now } });

    const title = (assignment['record'] as { title?: string } | undefined)?.title ?? 'Assignment';
    await this._sink.send({
      audience: 'student',
      studentId,
      body: `${title} — your parent asked you to pick this up. Open the worksheet.`,
      deepLink: `/studio/assignments/${assignmentExternalId}`,
    });
  }
}
