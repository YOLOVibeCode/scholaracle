import { createHash } from 'crypto';
import { reconcileCourse, type IReconciledCourse } from './subject-reconciler';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ISourceCourse {
  readonly externalId: string;
  readonly sourceId: string;
  readonly provider: string;
  readonly title: string;
  readonly teacherName?: string;
  /** Other teachers a source lists on the class (co-teachers, assistant coaches). */
  readonly coTeacherNames?: readonly string[];
  readonly period?: string;
  readonly courseCode?: string;
  readonly grade?: number;
  readonly letterGrade?: string;
  /** Courses of different students are never merged. */
  readonly studentExternalId?: string;
}

export interface IMergedCourse {
  readonly mergedId: string;
  readonly normalizedTitle: string;
  readonly subject: IReconciledCourse['subject'];
  readonly isAP: boolean;
  readonly isHonors: boolean;
  readonly sources: readonly ISourceCourse[];
  readonly bestGrade?: number;
  readonly bestLetterGrade?: string;
  readonly teacherName?: string;
  readonly period?: string;
  /** Which source is considered authoritative for grades. */
  readonly primarySourceId: string;
  /**
   * IDs this class had before sources that name it differently were joined on period and
   * teacher. Data saved under one of these IDs belongs to this class.
   */
  readonly aliasMergedIds?: readonly string[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface IAnnotatedCourse {
  readonly source: ISourceCourse;
  readonly reconciled: IReconciledCourse;
}

/** Courses that share a title, after conflicting periods and teachers were split apart. */
interface ISubGroup {
  readonly members: readonly IAnnotatedCourse[];
  readonly mergedId: string;
  readonly sourceKeys: ReadonlySet<string>;
}

function buildMatchKey(reconciled: IReconciledCourse): string {
  const cleanTitle = reconciled.normalizedTitle
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return `${cleanTitle}|${reconciled.subject.area}|${reconciled.subject.subArea ?? ''}`;
}

function hashKey(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 12);
}

function effectivePeriod(a: IAnnotatedCourse): string | undefined {
  if (a.reconciled.period != null) return a.reconciled.period.toString();
  return a.source.period;
}

/** Normalize period for comparison: strip leading 'p', leading zeros. "p04" → "4", "p05C" → "5c" */
function normalizePeriod(p: string): string {
  return p.toLowerCase().replace(/^p/i, '').replace(/^0+/, '') || '0';
}

function effectiveTeacher(a: IAnnotatedCourse): string | undefined {
  return a.reconciled.teacherName ?? a.source.teacherName;
}

/**
 * Extract a comparable teacher token (last name or username stem).
 * "Noah Chang" → "chang", "nchang" → "chang", "Ashley Hathaway" → "hathaway"
 */
function teacherToken(name: string): string {
  const lower = name.toLowerCase().trim();
  // If it has a space, take the last word (last name)
  const parts = lower.split(/\s+/);
  if (parts.length > 1) return parts[parts.length - 1]!;
  // Single word (username like "nchang"): return as-is for substring matching
  return lower;
}

const HONORIFICS = new Set(['mr', 'mrs', 'ms', 'miss', 'mx', 'dr', 'prof', 'coach', 'sr', 'sra']);
const PLACEHOLDER_TEACHERS = new Set(['staff', 'tba', 'tbd', 'teacher', 'unknown', 'none', 'na']);

interface ITeacherName {
  readonly surnames: readonly string[];
  readonly givenInitial?: string;
  /** One word: a bare surname ("Mrs. Rivera") or a login ("arivera"). */
  readonly bare: boolean;
}

function nameWords(text: string): string[] {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f'’]/g, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => w !== '' && !HONORIFICS.has(w));
}

function parseTeacherName(raw: string): ITeacherName | undefined {
  const comma = raw.indexOf(',');
  const words = nameWords(comma >= 0 ? raw.slice(0, comma) : raw);
  if (words.length === 0 || words.every((w) => PLACEHOLDER_TEACHERS.has(w))) return undefined;
  if (comma >= 0) {
    return { surnames: words, givenInitial: nameWords(raw.slice(comma + 1))[0]?.[0], bare: false };
  }
  if (words.length === 1) return { surnames: words, bare: true };
  return { surnames: words.slice(1), givenInitial: words[0]![0], bare: false };
}

function bareMatches(bare: string, name: ITeacherName): boolean {
  return name.surnames.some((surname) => {
    if (bare === surname) return true;
    if (surname.length < 4 || !bare.includes(surname)) return false;
    const prefix = bare.slice(0, bare.indexOf(surname));
    return prefix === '' || name.givenInitial == null || prefix[0] === name.givenInitial;
  });
}

/**
 * Whether two renderings of a teacher's name ("Rivera, Ana", "Ana Rivera", "Mrs. Rivera",
 * "arivera") can be the same person: a shared surname, and no conflicting first initial.
 * Placeholders such as "Staff" never agree with anything.
 */
export function teachersAgree(a: string, b: string): boolean {
  const x = parseTeacherName(a);
  const y = parseTeacherName(b);
  if (x == null || y == null) return false;
  if (x.bare && y.bare) return bareMatches(x.surnames[0]!, y) || bareMatches(y.surnames[0]!, x);
  if (x.bare) return bareMatches(x.surnames[0]!, y);
  if (y.bare) return bareMatches(y.surnames[0]!, x);
  if (!x.surnames.some((s) => y.surnames.includes(s))) return false;
  return x.givenInitial == null || y.givenInitial == null || x.givenInitial === y.givenInitial;
}

function firstDefined<T>(
  items: readonly IAnnotatedCourse[],
  fn: (a: IAnnotatedCourse) => T | undefined
): T | undefined {
  for (const item of items) {
    const v = fn(item);
    if (v != null) return v;
  }
  return undefined;
}

/**
 * Two courses within the same match-key group should be split into separate
 * merged groups only when both period AND teacher name are present and differ.
 */
function shouldSplit(a: IAnnotatedCourse, b: IAnnotatedCourse): boolean {
  const pA = effectivePeriod(a);
  const pB = effectivePeriod(b);
  const tA = effectiveTeacher(a);
  const tB = effectiveTeacher(b);

  // Normalize periods: "p04" and "4" should match
  const periodsDiffer = pA != null && pB != null && normalizePeriod(pA) !== normalizePeriod(pB);

  // Fuzzy teacher matching: "nchang" and "Noah Chang" share the token "chang"
  let teachersDiffer = false;
  if (tA != null && tB != null) {
    const tokA = teacherToken(tA);
    const tokB = teacherToken(tB);
    // Match if either token contains the other (handles username vs full name)
    teachersDiffer = !tokA.includes(tokB) && !tokB.includes(tokA);
  }

  return periodsDiffer && teachersDiffer;
}

/**
 * Partition a match-key group into sub-groups where no two members conflict
 * (i.e. have both different period AND different teacher).
 */
function splitConflicting(group: readonly IAnnotatedCourse[]): IAnnotatedCourse[][] {
  const subGroups: IAnnotatedCourse[][] = [];

  for (const course of group) {
    let placed = false;
    for (const sub of subGroups) {
      if (!sub.some((member) => shouldSplit(course, member))) {
        sub.push(course);
        placed = true;
        break;
      }
    }
    if (!placed) {
      subGroups.push([course]);
    }
  }

  return subGroups;
}

/** `idScope` is empty for a single student, so those IDs never change. */
function buildMergedId(
  matchKey: string,
  subGroup: readonly IAnnotatedCourse[],
  wasSplit: boolean,
  idScope: string
): string {
  if (!wasSplit) return hashKey(`${idScope}${matchKey}`);

  const teacher = firstDefined(subGroup, effectiveTeacher)?.toLowerCase() ?? '';
  const period = firstDefined(subGroup, effectivePeriod) ?? '';
  return hashKey(`${idScope}${matchKey}|${teacher}|${period}`);
}

function sourceKey(a: IAnnotatedCourse): string {
  return a.source.sourceId || a.source.provider;
}

function sharesSource(a: ISubGroup, b: ISubGroup): boolean {
  for (const key of a.sourceKeys) {
    if (b.sourceKeys.has(key)) return true;
  }
  return false;
}

/** "2", "p02", "2nd" and "Period 2" all name period 2. */
function periodKey(period: string): string {
  return normalizePeriod(period.trim().replace(/^period\s*/i, '')).replace(
    /^(\d+)(?:st|nd|rd|th)$/,
    '$1'
  );
}

/** The one period that every member naming a period agrees on. */
function classPeriod(members: readonly IAnnotatedCourse[]): string | undefined {
  const periods = new Set<string>();
  for (const m of members) {
    const period = m.source.period?.trim() || m.reconciled.period?.toString();
    if (period) periods.add(periodKey(period));
  }
  return periods.size === 1 ? [...periods][0] : undefined;
}

function teacherNames(members: readonly IAnnotatedCourse[]): string[] {
  const names = new Set<string>();
  for (const m of members) {
    const listed = [
      m.source.teacherName,
      m.reconciled.teacherName,
      ...(m.source.coTeacherNames ?? []),
    ];
    for (const name of listed) {
      if (name?.trim()) names.add(name);
    }
  }
  return [...names];
}

/** Different sources, one shared period, and a teacher both sides agree on. */
function canJoin(x: ISubGroup, y: ISubGroup): boolean {
  if (sharesSource(x, y)) return false;
  const period = classPeriod(x.members);
  if (period == null || period !== classPeriod(y.members)) return false;
  const yTeachers = teacherNames(y.members);
  return teacherNames(x.members).some((t) => yTeachers.some((u) => teachersAgree(t, u)));
}

/**
 * Join sub-groups that are one class named differently by different sources. A pair joins only
 * when neither side has a rival candidate from the same source, and a joined class never holds
 * two classes from one source. Returns the classes in order of first appearance.
 */
function joinOnPeriodAndTeacher(subGroups: readonly ISubGroup[]): ISubGroup[][] {
  const candidates = subGroups.map((x, i) =>
    subGroups.flatMap((y, j) => (j !== i && canJoin(x, y) ? [j] : []))
  );
  const unrivalled = (i: number, j: number): boolean =>
    candidates[i]!.every((k) => k === j || !sharesSource(subGroups[k]!, subGroups[j]!));

  const parent = subGroups.map((_, i) => i);
  const sourceKeys = subGroups.map((s) => new Set(s.sourceKeys));
  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root]!;
    return root;
  };

  for (let i = 0; i < subGroups.length; i++) {
    for (const j of candidates[i]!) {
      if (j < i || !unrivalled(i, j) || !unrivalled(j, i)) continue;
      const rootI = find(i);
      const rootJ = find(j);
      if (rootI === rootJ || [...sourceKeys[rootJ]!].some((k) => sourceKeys[rootI]!.has(k))) {
        continue;
      }
      const [root, child] = rootI < rootJ ? [rootI, rootJ] : [rootJ, rootI];
      parent[child] = root;
      for (const key of sourceKeys[child]!) sourceKeys[root]!.add(key);
    }
  }

  const classes = new Map<number, ISubGroup[]>();
  subGroups.forEach((sub, i) => {
    const root = find(i);
    const members = classes.get(root) ?? [];
    members.push(sub);
    classes.set(root, members);
  });
  return [...classes.values()];
}

/**
 * Source hierarchy for grade precedence (authoritative → least):
 * 1. SIS systems (Skyward, Aeries) - Official grades of record
 * 2. LMS systems (Canvas, Google Classroom) - Working/projected grades
 */
const SOURCE_PRIORITY: Record<string, number> = {
  skyward: 10, // SIS - highest priority
  aeries: 10, // SIS - highest priority
  canvas: 5, // LMS - lower priority
  google_classroom: 5, // LMS - lower priority
  oneroster: 5, // Generic LMS - lower priority
};

function getSourcePriority(provider: string): number {
  return SOURCE_PRIORITY[provider] ?? 1;
}

/**
 * The sub-group whose ID and title a joined class keeps: the gradebook of record first, then
 * one with a grade, then the smallest ID so the choice does not depend on input order.
 */
function pickAnchor(joined: readonly ISubGroup[]): ISubGroup {
  const rank = (sub: ISubGroup): readonly [number, number] => [
    Math.max(...sub.members.map((m) => getSourcePriority(m.source.provider))),
    sub.members.some((m) => m.source.grade != null) ? 1 : 0,
  ];
  return [...joined].sort((a, b) => {
    const [priorityA, gradedA] = rank(a);
    const [priorityB, gradedB] = rank(b);
    if (priorityA !== priorityB) return priorityB - priorityA;
    if (gradedA !== gradedB) return gradedB - gradedA;
    return a.mergedId < b.mergedId ? -1 : 1;
  })[0]!;
}

function buildJoinedCourse(joined: readonly ISubGroup[]): IMergedCourse {
  const anchor = pickAnchor(joined);
  const others = joined.filter((sub) => sub !== anchor);
  return buildMergedCourse(
    [...anchor.members, ...others.flatMap((sub) => sub.members)],
    anchor.mergedId,
    others.map((sub) => sub.mergedId).sort()
  );
}

function buildMergedCourse(
  subGroup: readonly IAnnotatedCourse[],
  mergedId: string,
  aliasMergedIds: readonly string[]
): IMergedCourse {
  const first = subGroup[0]!;
  const sources = subGroup.map((a) => a.source);

  // Find primary source: SIS (Skyward/Aeries) takes precedence over LMS
  // Within same priority tier, prefer sources with grades
  const primarySource =
    subGroup
      .filter((a) => a.source.grade != null)
      .sort((a, b) => {
        const priorityDiff =
          getSourcePriority(b.source.provider) - getSourcePriority(a.source.provider);
        if (priorityDiff !== 0) return priorityDiff;
        // Within same priority, prefer higher grade as tiebreaker
        return (b.source.grade ?? 0) - (a.source.grade ?? 0);
      })[0] ?? first;

  // Use primary source's grade as the authoritative grade
  const bestGrade = primarySource.source.grade;
  let bestLetterGrade = primarySource.source.letterGrade;

  // Fallback to any letter grade if primary doesn't have one
  if (bestLetterGrade == null) {
    bestLetterGrade = firstDefined(subGroup, (a) =>
      a.source.letterGrade != null ? a.source.letterGrade : undefined
    );
  }

  return {
    mergedId,
    normalizedTitle: first.reconciled.normalizedTitle,
    subject: first.reconciled.subject,
    isAP: first.reconciled.isAP,
    isHonors: first.reconciled.isHonors,
    sources,
    bestGrade,
    bestLetterGrade,
    teacherName: firstDefined(subGroup, effectiveTeacher),
    period: firstDefined(subGroup, effectivePeriod),
    primarySourceId: primarySource.source.sourceId,
    ...(aliasMergedIds.length > 0 ? { aliasMergedIds } : {}),
  };
}

function mergeOneStudent(courses: readonly ISourceCourse[], idScope: string): IMergedCourse[] {
  const groups = new Map<string, IAnnotatedCourse[]>();
  for (const source of courses) {
    const reconciled = reconcileCourse(source.title, source.teacherName);
    const matchKey = buildMatchKey(reconciled);
    const list = groups.get(matchKey) ?? [];
    list.push({ source, reconciled });
    groups.set(matchKey, list);
  }

  const subGroups: ISubGroup[] = [];
  for (const [matchKey, group] of groups) {
    const parts = splitConflicting(group);
    const wasSplit = parts.length > 1;
    for (const members of parts) {
      subGroups.push({
        members,
        mergedId: buildMergedId(matchKey, members, wasSplit, idScope),
        sourceKeys: new Set(members.map(sourceKey)),
      });
    }
  }

  return joinOnPeriodAndTeacher(subGroups).map(buildJoinedCourse);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Merge courses from multiple sources into unified groups.
 *
 * Algorithm:
 * 1. When the courses name more than one student, merge each student's courses on their own
 *    (courses without a student form one more group) and scope the IDs to the student.
 * 2. Reconcile each title via `reconcileCourse()`.
 * 3. Group by match key: `normalizedTitle | subject.area | subject.subArea`.
 * 4. Within each group, split when both period and teacher differ
 *    (indicates genuinely different courses that happened to normalize the same).
 * 5. Join groups from different sources that share one period and a teacher (one class the
 *    gradebook and a class feed name differently). The joined class keeps the gradebook's ID
 *    and lists the others in `aliasMergedIds`.
 * 6. Build an {@link IMergedCourse} per resulting class.
 */
export function mergeCourses(courses: readonly ISourceCourse[]): readonly IMergedCourse[] {
  if (courses.length === 0) return [];

  const students = new Set(courses.map((c) => c.studentExternalId).filter(Boolean));
  const byStudent = new Map<string, ISourceCourse[]>();
  for (const course of courses) {
    const student = students.size > 1 ? (course.studentExternalId ?? '') : '';
    const list = byStudent.get(student) ?? [];
    list.push(course);
    byStudent.set(student, list);
  }

  const result: IMergedCourse[] = [];
  for (const [student, list] of byStudent) {
    result.push(...mergeOneStudent(list, student ? `${student}|` : ''));
  }
  return result;
}

/**
 * Jaccard similarity over word tokens of two course titles (0–1).
 * Useful for fuzzy matching when exact normalization doesn't align.
 */
export function titleSimilarity(a: string, b: string): number {
  const tokenize = (s: string): Set<string> =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(Boolean)
    );

  const setA = tokenize(a);
  const setB = tokenize(b);

  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }

  const union = new Set([...setA, ...setB]).size;
  return intersection / union;
}
