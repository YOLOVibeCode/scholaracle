/**
 * Wire contracts for the student studio (`GET /api/studio/today`,
 * `GET /api/studio/week`, `GET /api/studio/assignments/:assignmentExternalId`).
 *
 * Student-facing only: no gradebook payload, no siblings, no parent nudge.
 * Server will be source of truth in packages/api/src/routes/studio/ (slice 5).
 *
 * `contentHash` on materials lives in ./materials — it is the cache validator.
 * Signed `downloadUrl` remains a 24h fetch ticket and must not be cached.
 */

import { ValidationError } from '../../errors';

export const STUDENT_SESSION_KEYS = ['studentId', 'displayName', 'showGrades'] as const;

export const NEXT_STEP_KEYS = [
  'assignmentExternalId',
  'title',
  'courseName',
  'courseExternalId',
  'dueAt',
  'primaryCtaLabel',
] as const;

export const TODAY_VIEW_KEYS = ['encouragement', 'next', 'alsoToday'] as const;

export const WORK_PACK_VIEW_KEYS = [
  'title',
  'courseName',
  'dueAt',
  'humanStatus',
  'instructionsText',
  'primaryAsset',
  'capturedPages',
  'needsSchoolLogin',
  'moreFromCourse',
] as const;

export const WORK_PACK_ASSET_KEYS = [
  'assetId',
  'contentHash',
  'fileName',
  'mimeType',
  'downloadUrl',
] as const;

export const WORK_PACK_LINK_KEYS = ['label', 'href', 'kind'] as const;

export const WORK_PACK_MORE_ITEM_KEYS = ['title', 'asset', 'href'] as const;

export const WEEK_VIEW_KEYS = ['encouragement', 'owed', 'days', 'doneThisWeek', 'counts'] as const;

export const WEEK_ITEM_KEYS = [
  'assignmentExternalId',
  'title',
  'courseName',
  'dueAt',
  'studentStatus',
  'needs',
  'primaryCtaLabel',
  'warning',
] as const;

export const WEEK_DONE_KEYS = [
  'assignmentExternalId',
  'title',
  'courseName',
  'dueAt',
  'confirmedBySchool',
] as const;

/** What the student says about an assignment (`PATCH /api/studio/assignments/:id/status`). */
export const STUDENT_STATUSES = ['not_started', 'working_on_it', 'need_help', 'done'] as const;

export type StudentStatus = (typeof STUDENT_STATUSES)[number];

/** What the student needs to do the work, derived from the work-pack partition. */
export const WEEK_NEEDS = ['saved_file', 'school_login', 'internet'] as const;

export type WeekNeed = (typeof WEEK_NEEDS)[number];

export type WeekDayLabel =
  'Today' | 'Tomorrow' | 'Sun' | 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat';

/** Student login context. Grades stay a boolean flag, never a gradebook. */
export interface IStudentSession {
  readonly studentId: string;
  readonly displayName: string;
  readonly showGrades: boolean;
}

/** Exactly one primary action on Today. */
export interface INextStep {
  readonly assignmentExternalId: string;
  readonly title: string;
  readonly courseName: string;
  readonly courseExternalId?: string;
  readonly dueAt?: string;
  readonly primaryCtaLabel: string;
}

export interface ITodayView {
  readonly encouragement: string;
  readonly next: INextStep | null;
  readonly alsoToday: readonly INextStep[];
}

/** One open assignment on This week. No score, no gradebook. */
export interface IWeekItem {
  readonly assignmentExternalId: string;
  readonly title: string;
  readonly courseName: string;
  readonly dueAt?: string;
  readonly studentStatus: StudentStatus;
  readonly needs: readonly WeekNeed[];
  readonly primaryCtaLabel: string;
  /** Set when the student marked it done but the portal still shows it not turned in. */
  readonly warning?: string;
}

/** One calendar day of the rolling 7-day horizon. `date` is the local day as YYYY-MM-DD. */
export interface IWeekDay {
  readonly date: string;
  readonly label: WeekDayLabel;
  readonly items: readonly IWeekItem[];
}

/** Finished this week: the student marked it done, or the portal says turned in / graded. */
export interface IWeekDone {
  readonly assignmentExternalId: string;
  readonly title: string;
  readonly courseName: string;
  readonly dueAt?: string;
  readonly confirmedBySchool: boolean;
}

export interface IWeekCounts {
  readonly owed: number;
  readonly due: number;
  readonly done: number;
}

/** `GET /api/studio/week`. Owed oldest first; days are the next 7 local days, today first. */
export interface IWeekView {
  readonly encouragement: string;
  readonly owed: readonly IWeekItem[];
  readonly days: readonly IWeekDay[];
  readonly doneThisWeek: readonly IWeekDone[];
  readonly counts: IWeekCounts;
}

export type WorkPackLinkKind = 'school-login' | 'external' | 'needs-internet';

export interface IWorkPackLink {
  readonly label: string;
  readonly href: string;
  readonly kind: WorkPackLinkKind;
}

/** Hosted file the client caches by assetId + contentHash. */
export interface IWorkPackAsset {
  readonly assetId: string;
  readonly contentHash: string;
  readonly fileName: string;
  readonly mimeType?: string;
  readonly downloadUrl?: string;
}

export interface IWorkPackMoreItem {
  readonly title: string;
  readonly asset?: IWorkPackAsset;
  readonly href?: string;
}

/** Public article text grabbed at scrape time — readable offline without the website. */
export interface ICapturedPage {
  readonly title: string;
  readonly text: string;
  readonly href?: string;
}

/**
 * One assignment, stacked for doing the work. Course extras stay in
 * `moreFromCourse` — never a top-level course dump.
 */
export interface IWorkPackView {
  readonly title: string;
  readonly courseName: string;
  readonly dueAt?: string;
  readonly humanStatus: string;
  readonly instructionsText: string;
  readonly primaryAsset: IWorkPackAsset | null;
  readonly capturedPages: readonly ICapturedPage[];
  readonly needsSchoolLogin: readonly IWorkPackLink[];
  readonly moreFromCourse: readonly IWorkPackMoreItem[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unexpectedOrMissing(
  obj: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
  label: string
): void {
  const allowed = new Set<string>([...required, ...optional]);
  const keys = Object.keys(obj);
  const missing = required.filter((k) => !keys.includes(k));
  const unexpected = keys.filter((k) => !allowed.has(k));
  if (missing.length === 0 && unexpected.length === 0) return;
  const parts: string[] = [];
  if (missing.length > 0) parts.push(`missing ${missing.join(', ')}`);
  if (unexpected.length > 0) parts.push(`unexpected ${unexpected.join(', ')}`);
  throw new ValidationError(`Invalid ${label}: ${parts.join('; ')}`);
}

function parseString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ValidationError(`Invalid ${label}: expected non-empty string`);
  }
  return value;
}

function parseOptionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  return parseString(value, label);
}

function parseNextStep(value: unknown, label: string): INextStep {
  if (!isRecord(value)) {
    throw new ValidationError(`Invalid ${label}: expected object`);
  }
  unexpectedOrMissing(
    value,
    ['assignmentExternalId', 'title', 'courseName', 'primaryCtaLabel'],
    ['dueAt', 'courseExternalId'],
    label
  );
  return {
    assignmentExternalId: parseString(
      value['assignmentExternalId'],
      `${label}.assignmentExternalId`
    ),
    title: parseString(value['title'], `${label}.title`),
    courseName: parseString(value['courseName'], `${label}.courseName`),
    primaryCtaLabel: parseString(value['primaryCtaLabel'], `${label}.primaryCtaLabel`),
    ...(value['dueAt'] !== undefined
      ? { dueAt: parseString(value['dueAt'], `${label}.dueAt`) }
      : {}),
    ...(value['courseExternalId'] !== undefined
      ? {
          courseExternalId: parseOptionalString(
            value['courseExternalId'],
            `${label}.courseExternalId`
          ),
        }
      : {}),
  };
}

function parseAsset(value: unknown, label: string): IWorkPackAsset {
  if (!isRecord(value)) {
    throw new ValidationError(`Invalid ${label}: expected object`);
  }
  unexpectedOrMissing(
    value,
    ['assetId', 'contentHash', 'fileName'],
    ['mimeType', 'downloadUrl'],
    label
  );
  return {
    assetId: parseString(value['assetId'], `${label}.assetId`),
    contentHash: parseString(value['contentHash'], `${label}.contentHash`),
    fileName: parseString(value['fileName'], `${label}.fileName`),
    ...(value['mimeType'] !== undefined
      ? { mimeType: parseString(value['mimeType'], `${label}.mimeType`) }
      : {}),
    ...(value['downloadUrl'] !== undefined
      ? { downloadUrl: parseString(value['downloadUrl'], `${label}.downloadUrl`) }
      : {}),
  };
}

function parseCapturedPage(value: unknown, label: string): ICapturedPage {
  if (!isRecord(value)) {
    throw new ValidationError(`Invalid ${label}: expected object`);
  }
  unexpectedOrMissing(value, ['title', 'text'], ['href'], label);
  return {
    title: parseString(value['title'], `${label}.title`),
    text: parseString(value['text'], `${label}.text`),
    ...(value['href'] !== undefined ? { href: parseString(value['href'], `${label}.href`) } : {}),
  };
}

function parseLink(value: unknown, label: string): IWorkPackLink {
  if (!isRecord(value)) {
    throw new ValidationError(`Invalid ${label}: expected object`);
  }
  unexpectedOrMissing(value, ['label', 'href', 'kind'], [], label);
  const kind = value['kind'];
  if (kind !== 'school-login' && kind !== 'external' && kind !== 'needs-internet') {
    throw new ValidationError(
      `Invalid ${label}.kind: expected school-login, external, or needs-internet`
    );
  }
  return {
    label: parseString(value['label'], `${label}.label`),
    href: parseString(value['href'], `${label}.href`),
    kind,
  };
}

function parseMoreItem(value: unknown, label: string): IWorkPackMoreItem {
  if (!isRecord(value)) {
    throw new ValidationError(`Invalid ${label}: expected object`);
  }
  unexpectedOrMissing(value, ['title'], ['asset', 'href'], label);
  return {
    title: parseString(value['title'], `${label}.title`),
    ...(value['asset'] !== undefined
      ? { asset: parseAsset(value['asset'], `${label}.asset`) }
      : {}),
    ...(value['href'] !== undefined ? { href: parseString(value['href'], `${label}.href`) } : {}),
  };
}

/**
 * Runtime parse for Today JSON. `next` must be one object or null — never an array.
 */
export function parseTodayView(input: unknown): ITodayView {
  if (!isRecord(input)) {
    throw new ValidationError('Invalid ITodayView: expected object');
  }
  unexpectedOrMissing(input, ['encouragement', 'next', 'alsoToday'], [], 'ITodayView');
  if (Array.isArray(input['next'])) {
    throw new ValidationError('Invalid ITodayView.next: expected object or null, not an array');
  }
  const alsoRaw = input['alsoToday'];
  if (!Array.isArray(alsoRaw)) {
    throw new ValidationError('Invalid ITodayView.alsoToday: expected array');
  }
  return {
    encouragement: parseString(input['encouragement'], 'ITodayView.encouragement'),
    next: input['next'] === null ? null : parseNextStep(input['next'], 'ITodayView.next'),
    alsoToday: alsoRaw.map((step, i) => parseNextStep(step, `ITodayView.alsoToday[${i}]`)),
  };
}

/**
 * Runtime parse for work-pack JSON. Rejects a course dump mixed at top level.
 */
export function parseWorkPackView(input: unknown): IWorkPackView {
  if (!isRecord(input)) {
    throw new ValidationError('Invalid IWorkPackView: expected object');
  }
  unexpectedOrMissing(
    input,
    [
      'title',
      'courseName',
      'humanStatus',
      'instructionsText',
      'primaryAsset',
      'needsSchoolLogin',
      'moreFromCourse',
    ],
    ['dueAt', 'capturedPages'],
    'IWorkPackView'
  );
  const linksRaw = input['needsSchoolLogin'];
  const moreRaw = input['moreFromCourse'];
  if (!Array.isArray(linksRaw)) {
    throw new ValidationError('Invalid IWorkPackView.needsSchoolLogin: expected array');
  }
  if (!Array.isArray(moreRaw)) {
    throw new ValidationError('Invalid IWorkPackView.moreFromCourse: expected array');
  }
  const capturedRaw = input['capturedPages'];
  if (capturedRaw !== undefined && !Array.isArray(capturedRaw)) {
    throw new ValidationError('Invalid IWorkPackView.capturedPages: expected array');
  }
  const primary =
    input['primaryAsset'] === null
      ? null
      : parseAsset(input['primaryAsset'], 'IWorkPackView.primaryAsset');
  return {
    title: parseString(input['title'], 'IWorkPackView.title'),
    courseName: parseString(input['courseName'], 'IWorkPackView.courseName'),
    humanStatus: parseString(input['humanStatus'], 'IWorkPackView.humanStatus'),
    instructionsText: parseString(input['instructionsText'], 'IWorkPackView.instructionsText'),
    primaryAsset: primary,
    capturedPages: (capturedRaw ?? []).map((page, i) =>
      parseCapturedPage(page, `IWorkPackView.capturedPages[${i}]`)
    ),
    needsSchoolLogin: linksRaw.map((link, i) =>
      parseLink(link, `IWorkPackView.needsSchoolLogin[${i}]`)
    ),
    moreFromCourse: moreRaw.map((item, i) =>
      parseMoreItem(item, `IWorkPackView.moreFromCourse[${i}]`)
    ),
    ...(input['dueAt'] !== undefined
      ? { dueAt: parseOptionalString(input['dueAt'], 'IWorkPackView.dueAt') }
      : {}),
  };
}

function parseArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new ValidationError(`Invalid ${label}: expected array`);
  }
  return value;
}

function parseOneOf<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new ValidationError(`Invalid ${label}: expected one of ${allowed.join(', ')}`);
  }
  return value as T;
}

function parseCount(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new ValidationError(`Invalid ${label}: expected a non-negative integer`);
  }
  return value;
}

function parseWeekItem(value: unknown, label: string): IWeekItem {
  if (!isRecord(value)) {
    throw new ValidationError(`Invalid ${label}: expected object`);
  }
  unexpectedOrMissing(
    value,
    ['assignmentExternalId', 'title', 'courseName', 'studentStatus', 'needs', 'primaryCtaLabel'],
    ['dueAt', 'warning'],
    label
  );
  const needs = parseArray(value['needs'], `${label}.needs`).map((need, i) =>
    parseOneOf(need, WEEK_NEEDS, `${label}.needs[${i}]`)
  );
  return {
    assignmentExternalId: parseString(
      value['assignmentExternalId'],
      `${label}.assignmentExternalId`
    ),
    title: parseString(value['title'], `${label}.title`),
    courseName: parseString(value['courseName'], `${label}.courseName`),
    studentStatus: parseOneOf(value['studentStatus'], STUDENT_STATUSES, `${label}.studentStatus`),
    needs,
    primaryCtaLabel: parseString(value['primaryCtaLabel'], `${label}.primaryCtaLabel`),
    ...(value['dueAt'] !== undefined
      ? { dueAt: parseString(value['dueAt'], `${label}.dueAt`) }
      : {}),
    ...(value['warning'] !== undefined
      ? { warning: parseString(value['warning'], `${label}.warning`) }
      : {}),
  };
}

const WEEK_DAY_LABELS: readonly WeekDayLabel[] = [
  'Today',
  'Tomorrow',
  'Sun',
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
];

function parseWeekDay(value: unknown, label: string): IWeekDay {
  if (!isRecord(value)) {
    throw new ValidationError(`Invalid ${label}: expected object`);
  }
  unexpectedOrMissing(value, ['date', 'label', 'items'], [], label);
  return {
    date: parseString(value['date'], `${label}.date`),
    label: parseOneOf(value['label'], WEEK_DAY_LABELS, `${label}.label`),
    items: parseArray(value['items'], `${label}.items`).map((item, i) =>
      parseWeekItem(item, `${label}.items[${i}]`)
    ),
  };
}

function parseWeekDone(value: unknown, label: string): IWeekDone {
  if (!isRecord(value)) {
    throw new ValidationError(`Invalid ${label}: expected object`);
  }
  unexpectedOrMissing(
    value,
    ['assignmentExternalId', 'title', 'courseName', 'confirmedBySchool'],
    ['dueAt'],
    label
  );
  if (typeof value['confirmedBySchool'] !== 'boolean') {
    throw new ValidationError(`Invalid ${label}.confirmedBySchool: expected boolean`);
  }
  return {
    assignmentExternalId: parseString(
      value['assignmentExternalId'],
      `${label}.assignmentExternalId`
    ),
    title: parseString(value['title'], `${label}.title`),
    courseName: parseString(value['courseName'], `${label}.courseName`),
    confirmedBySchool: value['confirmedBySchool'],
    ...(value['dueAt'] !== undefined
      ? { dueAt: parseString(value['dueAt'], `${label}.dueAt`) }
      : {}),
  };
}

function parseWeekCounts(value: unknown, label: string): IWeekCounts {
  if (!isRecord(value)) {
    throw new ValidationError(`Invalid ${label}: expected object`);
  }
  unexpectedOrMissing(value, ['owed', 'due', 'done'], [], label);
  return {
    owed: parseCount(value['owed'], `${label}.owed`),
    due: parseCount(value['due'], `${label}.due`),
    done: parseCount(value['done'], `${label}.done`),
  };
}

/**
 * Runtime parse for This-week JSON. Rejects any gradebook field on an item.
 */
export function parseWeekView(input: unknown): IWeekView {
  if (!isRecord(input)) {
    throw new ValidationError('Invalid IWeekView: expected object');
  }
  unexpectedOrMissing(input, [...WEEK_VIEW_KEYS], [], 'IWeekView');
  return {
    encouragement: parseString(input['encouragement'], 'IWeekView.encouragement'),
    owed: parseArray(input['owed'], 'IWeekView.owed').map((item, i) =>
      parseWeekItem(item, `IWeekView.owed[${i}]`)
    ),
    days: parseArray(input['days'], 'IWeekView.days').map((day, i) =>
      parseWeekDay(day, `IWeekView.days[${i}]`)
    ),
    doneThisWeek: parseArray(input['doneThisWeek'], 'IWeekView.doneThisWeek').map((done, i) =>
      parseWeekDone(done, `IWeekView.doneThisWeek[${i}]`)
    ),
    counts: parseWeekCounts(input['counts'], 'IWeekView.counts'),
  };
}

const PERCENT_TOKEN = /\d+\s*%/;
const LETTER_TOKEN = /\b[ABCDF][+-](?!\w)/;
const POINTS_TOKEN = /\b\d+\s*\/\s*\d+\b|\bpoints?\b/i;

function scanCopy(text: string, showGrades: boolean): void {
  if (showGrades) return;
  if (PERCENT_TOKEN.test(text)) {
    throw new ValidationError('Grade leak: copy contains a percent while showGrades is false');
  }
  if (LETTER_TOKEN.test(text)) {
    throw new ValidationError('Grade leak: copy contains a letter grade while showGrades is false');
  }
  if (POINTS_TOKEN.test(text)) {
    throw new ValidationError('Grade leak: copy contains points while showGrades is false');
  }
}

function scanWeekView(view: IWeekView, showGrades: boolean): void {
  scanCopy(view.encouragement, showGrades);
  const items = [...view.owed, ...view.days.flatMap((day) => day.items)];
  for (const item of items) {
    scanCopy(`${item.title} ${item.primaryCtaLabel} ${item.warning ?? ''}`, showGrades);
  }
  for (const done of view.doneThisWeek) {
    scanCopy(done.title, showGrades);
  }
}

/**
 * When `showGrades` is false, student-facing copy must not include percent,
 * letter grades (A- / B+), or points. Routing still belongs to later slices;
 * this only guards the wire text.
 */
export function assertNoGradeLeak(
  view: ITodayView | IWorkPackView | IWeekView,
  showGrades: boolean
): void {
  if ('owed' in view) {
    scanWeekView(view, showGrades);
    return;
  }
  if ('encouragement' in view) {
    scanCopy(view.encouragement, showGrades);
    if (view.next) scanCopy(`${view.next.title} ${view.next.primaryCtaLabel}`, showGrades);
    for (const step of view.alsoToday) {
      scanCopy(`${step.title} ${step.primaryCtaLabel}`, showGrades);
    }
    return;
  }
  scanCopy(view.title, showGrades);
  scanCopy(view.humanStatus, showGrades);
  scanCopy(view.instructionsText, showGrades);
  for (const page of view.capturedPages) {
    scanCopy(page.title, showGrades);
    scanCopy(page.text, showGrades);
  }
}
