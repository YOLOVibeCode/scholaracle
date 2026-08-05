/**
 * parent-square transformer — raw extract → ISlcDeltaOp[].
 * Entities: course, assignment, message, studentProfile
 */

import type { ISlcDeltaOp } from '@scholaracle/contracts';
import type { ITransformContext } from '../../types';

export interface IParentSquareExtract {
  readonly studentName?: string;
  readonly courses?: ReadonlyArray<{
    readonly id: string;
    readonly title: string;
    readonly grade?: string;
    readonly teacher?: string;
    readonly assignments?: ReadonlyArray<{
      readonly id: string;
      readonly title: string;
      readonly dueDate?: string;
      readonly status?: string;
      readonly points?: string;
    }>;
  }>;
  readonly messages?: ReadonlyArray<{
    readonly id: string;
    readonly subject: string;
    readonly body: string;
    readonly senderName: string;
    readonly sentAt: string;
  }>;
  readonly scrapedAt: string;
}

export function transformParentSquareExtract(
  extract: IParentSquareExtract,
  ctx: ITransformContext
): ISlcDeltaOp[] {
  const ops: ISlcDeltaOp[] = [];
  const observedAt = extract.scrapedAt || new Date().toISOString();
  const baseKey = {
    provider: ctx.provider,
    adapterId: ctx.adapterId,
  };

  if (extract.studentName?.trim()) {
    ops.push({
      op: 'upsert',
      entity: 'studentProfile',
      key: { ...baseKey, externalId: ctx.studentExternalId },
      observedAt,
      record: { name: extract.studentName.trim() },
    });
  }

  for (const course of extract.courses ?? []) {
    ops.push({
      op: 'upsert',
      entity: 'course',
      key: { ...baseKey, externalId: course.id },
      observedAt,
      record: {
        title: course.title,
        teacherName: course.teacher,
      },
    });

    for (const a of course.assignments ?? []) {
      ops.push({
        op: 'upsert',
        entity: 'assignment',
        key: { ...baseKey, externalId: a.id },
        observedAt,
        record: {
          title: a.title,
          courseExternalId: course.id,
          dueDate: a.dueDate,
          status: a.status,
        },
      });
    }
  }

  for (const m of extract.messages ?? []) {
    ops.push({
      op: 'upsert',
      entity: 'message',
      key: { ...baseKey, externalId: m.id },
      observedAt,
      record: {
        subject: m.subject,
        body: m.body,
        senderName: m.senderName,
        sentAt: m.sentAt,
      },
    });
  }

  return ops;
}
