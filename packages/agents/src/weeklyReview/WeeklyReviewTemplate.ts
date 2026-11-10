import { WEEKLY_REVIEW_PUSH_TYPE, type IWeekCounts, type IWeekView } from '@scholaracle/contracts';
import {
  WEEK_EMPTY_MESSAGE,
  isWeekEmpty,
  weekSummaryLine,
  weeklyReviewMessage,
} from '@scholaracle/studio-core';
import { firstNameOf } from '../text/firstName';

/**
 * Copy for the Sunday weekly review (student review spec §3.3, R4). Student tone,
 * counts and titles only: the view was already passed through `assertNoGradeLeak`,
 * and nothing here reads a score. The parent copy is the same review with a
 * parent frame; it goes out only to adults who turned the copy on (decision Q2).
 */

/** Notification triggerType; the phone opens This week on `data.type === 'weekly_review'`. */
export const WEEKLY_REVIEW_TRIGGER = WEEKLY_REVIEW_PUSH_TYPE;

export const WEEKLY_REVIEW_PUSH_TITLE = 'Your week';

export interface IWeeklyReviewContext {
  readonly studentName: string;
  /** The student's Mongo id (parent board deep link). */
  readonly studentId: string;
  readonly view: IWeekView;
  /** Web origin for deep links, e.g. https://scholarmancy.com. */
  readonly webOrigin: string;
}

export interface IWeeklyReviewContent {
  readonly subject: string;
  readonly body: string;
}

function origin(webOrigin: string): string {
  return webOrigin.replace(/\/+$/, '');
}

/** The student's This week page. */
export function studentWeekUrl(webOrigin: string): string {
  return `${origin(webOrigin)}/studio/week`;
}

/** The parent's board for this student. */
export function parentStudentUrl(webOrigin: string, studentId: string): string {
  return `${origin(webOrigin)}/dashboard/students/${encodeURIComponent(studentId)}`;
}

function firstName(name: string): string {
  return firstNameOf(name, name.trim());
}

interface ITitled {
  readonly title: string;
  readonly courseName: string;
}

/** `"Ch. 4 worksheet" (Math), "Essay draft" (English) and 2 more` — at most `max` named. */
export function titleList(items: readonly ITitled[], max = 3): string {
  const named = items.slice(0, max).map((item) => `"${item.title}" (${item.courseName})`);
  const rest = items.length - named.length;
  if (rest <= 0) return named.join(', ');
  return `${named.join(', ')} and ${rest} more`;
}

/** Parent-facing counts line: "3 due · 1 still owed · 4 finished". */
export function parentSummaryLine(counts: IWeekCounts): string {
  return `${counts.due} due · ${counts.owed} still owed · ${counts.done} finished`;
}

function things(n: number): string {
  return n === 1 ? 'thing' : 'things';
}

/** Push to the student's phone; the body is the shared studio-core line. */
export function buildStudentWeeklyReviewPush(ctx: IWeeklyReviewContext): IWeeklyReviewContent {
  return { subject: WEEKLY_REVIEW_PUSH_TITLE, body: weeklyReviewMessage(ctx.view.counts) };
}

/** Email to the student's `alertEmail`. Plain text; EmailDelivery wraps it. */
export function buildStudentWeeklyReviewEmail(ctx: IWeeklyReviewContext): IWeeklyReviewContent {
  const { view } = ctx;
  const first = firstName(ctx.studentName);
  const empty = isWeekEmpty(view.counts);
  const subject = empty
    ? `You're caught up, ${first}`
    : `Your week: ${weekSummaryLine(view.counts)}`;
  const lines: string[] = [`Hi ${first},`, ''];
  lines.push(empty ? WEEK_EMPTY_MESSAGE : `This week: ${weekSummaryLine(view.counts)}.`);
  if (view.owed.length > 0) lines.push('', `Still owed: ${titleList(view.owed)}.`);
  const upcoming = view.days.flatMap((day) => day.items);
  if (upcoming.length > 0) lines.push('', `Coming up: ${titleList(upcoming)}.`);
  if (view.doneThisWeek.length > 0) {
    const n = view.doneThisWeek.length;
    lines.push('', `You finished ${n} ${things(n)} this week. Nice.`);
  }
  lines.push('', `See the plan: ${studentWeekUrl(ctx.webOrigin)}`);
  return { subject, body: lines.join('\n') };
}

/** Copy for an adult who turned "Send me the weekly review" on for this student. */
export function buildParentWeeklyReviewCopy(ctx: IWeeklyReviewContext): IWeeklyReviewContent {
  const { view } = ctx;
  const first = firstName(ctx.studentName);
  const subject = `${first}'s week: ${parentSummaryLine(view.counts)}`;
  const lines: string[] = [`A copy of ${first}'s weekly review, as ${first} saw it:`, ''];
  lines.push(weeklyReviewMessage(view.counts));
  if (view.owed.length > 0) lines.push('', `Still owed: ${titleList(view.owed)}.`);
  const upcoming = view.days.flatMap((day) => day.items);
  if (upcoming.length > 0) lines.push('', `Coming up: ${titleList(upcoming)}.`);
  lines.push('', `Open ${first}'s board: ${parentStudentUrl(ctx.webOrigin, ctx.studentId)}`);
  return { subject, body: lines.join('\n') };
}
