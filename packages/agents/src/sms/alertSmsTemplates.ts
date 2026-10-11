import { AlertType, SCHOLARMANCY_SMS_BRAND, SMS_STOP_SUFFIX } from '@scholaracle/contracts';
import { toGsm7 } from './gsm7';

/** One GSM-7 segment. */
export const SMS_SEGMENT_LIMIT = 160;

/** Web path the details link opens (redirects to the parent's alerts page). */
export const SMS_ALERTS_PATH = '/alerts';

/** triggerType used by agenda item reminders (NotificationService.sendReminder). */
export const AGENDA_REMINDER_TRIGGER = 'agenda_remind';

const PREFIX = `${SCHOLARMANCY_SMS_BRAND}: `;
const STOP = ` ${SMS_STOP_SUFFIX}`;

interface IField {
  readonly value: string;
  /** Shortest this field may be shortened to before the sentence itself is cut. */
  readonly min: number;
}

type Fields = Readonly<Record<string, IField>>;
type Values = Readonly<Record<string, string>>;

interface ISmsTemplate {
  fields(data: Readonly<Record<string, unknown>>): Fields;
  render(v: Values): string;
}

export interface IAlertSmsInput {
  readonly triggerType: string;
  readonly triggerData?: unknown;
  /** Fallback when the trigger type has no SMS template. */
  readonly subject: string;
}

function text(value: unknown): string {
  return typeof value === 'string' ? toGsm7(value) : '';
}

function pick(data: Readonly<Record<string, unknown>>, ...keys: string[]): string {
  for (const key of keys) {
    const value = text(data[key]);
    if (value) return value;
  }
  return '';
}

/** Course names from portals often carry "(Room 204, Mrs. Smith)"; texts keep the name. */
function course(data: Readonly<Record<string, unknown>>): string {
  return pick(data, 'course', 'courseName')
    .replace(/\s*\([^)]*\)?/g, '')
    .trim();
}

/** Titles lose wrapping quotes so a shortened title never leaves a dangling one. */
function title(data: Readonly<Record<string, unknown>>, ...keys: string[]): string {
  return pick(data, ...keys)
    .replace(/"/g, '')
    .trim();
}

function percent(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${Math.round(value)}%` : '';
}

function firstName(data: Readonly<Record<string, unknown>>): string {
  return pick(data, 'studentName').split(' ')[0] || 'Your student';
}

function field(value: string, min: number, fallback = ''): IField {
  return { value: value || fallback, min };
}

/** Short GSM-7 date like "Tue, Oct 14" (time dropped to keep one segment). */
function shortDate(data: Readonly<Record<string, unknown>>, ...keys: string[]): string {
  for (const key of keys) {
    const raw = data[key];
    if (typeof raw !== 'string' || !raw) continue;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) continue;
    return toGsm7(
      parsed.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    );
  }
  return '';
}

/** Cut at a word boundary and mark the cut with "...". */
export function shortenSmsValue(value: string, max: number): string {
  if (value.length <= max) return value;
  if (max <= 3) return value.slice(0, Math.max(0, max));
  const cut = value.slice(0, max - 3);
  const space = cut.lastIndexOf(' ');
  const base = space >= Math.floor(cut.length / 2) ? cut.slice(0, space) : cut;
  return `${base.replace(/[\s,.;:'-]+$/, '')}...`;
}

const TEMPLATES: Readonly<Record<string, ISmsTemplate>> = {
  [AlertType.GRADE_DROP]: {
    fields: (d) => ({
      name: field(firstName(d), 4),
      course: field(course(d), 6, 'a class'),
      from: field(percent(d['previousGrade']), 0),
      to: field(percent(d['currentGrade']), 0),
    }),
    render: (v) =>
      v['from'] && v['to']
        ? `${v['name']}'s ${v['course']} grade dropped from ${v['from']} to ${v['to']}.`
        : `${v['name']}'s ${v['course']} grade dropped.`,
  },
  [AlertType.MISSING_ASSIGNMENT]: {
    fields: (d) => ({
      name: field(firstName(d), 4),
      course: field(course(d), 6, 'a class'),
      title: field(title(d, 'assignment', 'title'), 8, 'an assignment'),
    }),
    render: (v) => `${v['name']} has a missing assignment in ${v['course']}: ${v['title']}.`,
  },
  [AlertType.DEADLINE]: {
    fields: (d) => ({
      name: field(firstName(d), 4),
      course: field(course(d), 6, 'a class'),
      title: field(title(d, 'assignment', 'title'), 8, 'an assignment'),
      // Same date text the email shows (ingest formats it), else a short date.
      when: field(pick(d, 'formattedDueDate') || shortDate(d, 'dueAt', 'dueDate'), 0, 'soon'),
    }),
    render: (v) => `${v['name']} has ${v['title']} due ${v['when']} in ${v['course']}.`,
  },
  [AlertType.TEST]: {
    fields: (d) => ({
      name: field(firstName(d), 4),
      course: field(course(d), 6, 'a class'),
      title: field(title(d, 'testName', 'title'), 8, 'a test'),
      when: field(shortDate(d, 'testDate'), 0, 'soon'),
    }),
    render: (v) => `${v['name']}'s ${v['course']} test is ${v['when']}: ${v['title']}.`,
  },
  [AlertType.WORKLOAD]: {
    fields: (d) => ({
      name: field(firstName(d), 4),
      count: field(
        typeof d['assignmentCount'] === 'number' ? String(d['assignmentCount']) : '',
        0,
        'several'
      ),
      when: field(d['isDueThisWeek'] === true ? 'this week' : 'soon', 0),
    }),
    render: (v) => `${v['name']} has ${v['count']} assignments due ${v['when']}.`,
  },
  [AlertType.POSITIVE]: {
    fields: (d) => ({
      name: field(firstName(d), 4),
      course: field(course(d), 6, 'class'),
      achievement: field(title(d, 'achievement'), 10, 'great progress'),
    }),
    render: (v) => `Great work by ${v['name']} in ${v['course']}: ${v['achievement']}.`,
  },
  [AlertType.RECOMMENDATION]: {
    fields: (d) => ({
      name: field(firstName(d), 4),
      title: field(title(d, 'title'), 10, 'a new suggestion'),
    }),
    render: (v) => `A suggestion for ${v['name']}: ${v['title']}.`,
  },
  [AGENDA_REMINDER_TRIGGER]: {
    fields: (d) => ({
      name: field(firstName(d), 4),
      title: field(title(d, 'title'), 8, 'an upcoming item'),
      when: field(shortDate(d, 'timeAt', 'dueAt'), 0),
    }),
    render: (v) =>
      v['when']
        ? `Reminder: ${v['title']} for ${v['name']}, due ${v['when']}.`
        : `Reminder: ${v['title']} for ${v['name']}.`,
  },
};

function fitSentence(template: ISmsTemplate, fields: Fields, budget: number): string | null {
  const max: Record<string, number> = {};
  const values: Record<string, string> = {};
  for (const [key, f] of Object.entries(fields)) {
    max[key] = f.value.length;
    values[key] = f.value;
  }
  const render = (): string => template.render(values).replace(/\.{4}$/, '...');
  for (let sentence = render(); ; sentence = render()) {
    if (sentence.length <= budget) return sentence;
    const key = Object.keys(fields)
      .filter((k) => values[k]!.length > fields[k]!.min && fields[k]!.min > 0)
      .sort((a, b) => values[b]!.length - values[a]!.length)[0];
    if (!key) return null;
    max[key] = Math.max(fields[key]!.min, max[key]! - 4);
    values[key] = shortenSmsValue(fields[key]!.value, max[key]!);
  }
}

function fallbackTemplate(subject: string): ISmsTemplate {
  return {
    fields: () => ({ subject: field(toGsm7(subject), 12, 'You have a new alert') }),
    render: (v) => (/[.!?]$/.test(v['subject']!) ? v['subject']! : `${v['subject']}.`),
  };
}

/**
 * The one-segment GSM-7 text for an alert: "Scholarmancy: <sentence> Details: <link> Reply STOP
 * to opt out." Names, courses and titles are shortened before the sentence is ever cut; the
 * details link is dropped only if even the shortest sentence would not fit with it.
 */
export function buildAlertSmsBody(input: IAlertSmsInput, webOrigin: string): string {
  const data = (
    input.triggerData && typeof input.triggerData === 'object' ? input.triggerData : {}
  ) as Readonly<Record<string, unknown>>;
  const template = TEMPLATES[input.triggerType] ?? fallbackTemplate(input.subject);
  const fields = template.fields(data);
  const link = ` Details: ${webOrigin.replace(/\/+$/, '')}${SMS_ALERTS_PATH}`;
  for (const tail of [`${link}${STOP}`, STOP]) {
    const sentence = fitSentence(template, fields, SMS_SEGMENT_LIMIT - PREFIX.length - tail.length);
    if (sentence) return `${PREFIX}${sentence}${tail}`;
  }
  const budget = SMS_SEGMENT_LIMIT - PREFIX.length - STOP.length;
  return `${PREFIX}${shortenSmsValue(template.render(Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, f.value]))), budget)}${STOP}`;
}

/**
 * Daily SMS digest: one segment with the count and the details link. Batched alerts used to be
 * joined email bodies of up to 1600 characters (10+ segments).
 */
export function buildSmsDigestBody(alertCount: number, webOrigin: string): string {
  const count = Math.max(1, Math.floor(alertCount));
  const link = `${webOrigin.replace(/\/+$/, '')}${SMS_ALERTS_PATH}`;
  const noun = count === 1 ? 'alert' : 'alerts';
  return `${PREFIX}Your daily summary: ${count} new ${noun}. Details: ${link}${STOP}`;
}
