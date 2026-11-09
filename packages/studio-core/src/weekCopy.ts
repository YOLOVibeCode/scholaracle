import {
  STUDENT_HELP_NOTE_MAX_CHARS,
  STUDENT_STATUSES,
  type IStudentStatusUpdateResponse,
  type IWeekCounts,
  type StudentStatus,
  type WeekNeed,
} from '@scholaracle/contracts';

/**
 * Student-facing copy and small helpers for This week and the status sheet,
 * shared by the phone, the web studio and the weekly review push (R4) so every
 * surface says the same thing. No scores.
 */

export interface IWeekNeedGlyph {
  readonly need: WeekNeed;
  readonly glyph: string;
  readonly label: string;
}

/** 📄 saved · 🔒 school login · 🌐 needs internet (spec §3.5). */
export const WEEK_NEED_GLYPHS: Readonly<Record<WeekNeed, IWeekNeedGlyph>> = {
  saved_file: { need: 'saved_file', glyph: '📄', label: 'saved' },
  school_login: { need: 'school_login', glyph: '🔒', label: 'school login' },
  internet: { need: 'internet', glyph: '🌐', label: 'needs internet' },
};

/** Glyphs for a needs list, in the list's order, each need once. */
export function needGlyphs(needs: readonly WeekNeed[]): readonly IWeekNeedGlyph[] {
  const seen = new Set<WeekNeed>();
  const out: IWeekNeedGlyph[] = [];
  for (const need of needs) {
    if (seen.has(need)) continue;
    seen.add(need);
    out.push(WEEK_NEED_GLYPHS[need]);
  }
  return out;
}

export const STUDENT_STATUS_LABELS: Readonly<Record<StudentStatus, string>> = {
  not_started: 'Not started',
  working_on_it: 'Working on it',
  need_help: 'Need help',
  done: 'Done',
};

/** ○ not started · ◐ working on it · ⚠ need help · ✓ done (spec §3.5 legend). */
export const STUDENT_STATUS_MARKS: Readonly<Record<StudentStatus, string>> = {
  not_started: '○',
  working_on_it: '◐',
  need_help: '⚠',
  done: '✓',
};

export interface IStudentStatusOption {
  readonly status: StudentStatus;
  readonly label: string;
  readonly mark: string;
}

/** The four choices on the status sheet, in order. */
export const STUDENT_STATUS_OPTIONS: readonly IStudentStatusOption[] = STUDENT_STATUSES.map(
  (status) => ({
    status,
    label: STUDENT_STATUS_LABELS[status],
    mark: STUDENT_STATUS_MARKS[status],
  })
);

export const OWED_SECTION_TITLE = 'Still owed';
export const DONE_SECTION_TITLE = 'Done this week';
export const WEEK_EMPTY_MESSAGE = "You're caught up.";

// --- Need help sheet -------------------------------------------------------

export const NEED_HELP_TITLE = 'Need help?';
export const NEED_HELP_NOTE_PLACEHOLDER = 'Note (optional)';
export const NEED_HELP_UNSTUCK_HINT = 'Move the status on when you get unstuck.';
export const STATUS_SAVE_ERROR = "Couldn't save that. Try again.";

/** The adults were told this time (`notified: true`). */
export const NEED_HELP_SENT_MESSAGE = 'Your grown-ups were told';
/** Rate-limited (`notified: false`): an alert already went out in the last 24 h. */
export const NEED_HELP_ALREADY_ASKED_MESSAGE = 'You already asked today. Your grown-ups know.';
/** Older server with no `notified` field: the status is saved, nobody was paged. */
export const NEED_HELP_SAVED_MESSAGE = 'Saved. Your grown-ups will see this on your list.';

export function needHelpPrompt(assignmentTitle: string): string {
  return `Tell your grown-ups you're stuck on "${assignmentTitle}".`;
}

/**
 * What to tell the student after a Need help PATCH. Only a server that says
 * `notified: true` earns "Your grown-ups were told".
 */
export function needHelpOutcomeMessage(
  response: Pick<IStudentStatusUpdateResponse, 'notified' | 'nextAllowedAt'> | undefined
): string {
  if (response?.notified === true) return NEED_HELP_SENT_MESSAGE;
  if (response?.notified === false) return NEED_HELP_ALREADY_ASKED_MESSAGE;
  return NEED_HELP_SAVED_MESSAGE;
}

/**
 * Note length is counted in UTF-16 code units (`.length`), the same unit a
 * textarea's `maxLength` uses, so what the field allows is what the wire sends.
 */
export function clampNote(note: string): string {
  return note.slice(0, STUDENT_HELP_NOTE_MAX_CHARS);
}

export function noteCounter(note: string): string {
  return `${note.length}/${STUDENT_HELP_NOTE_MAX_CHARS}`;
}

/** Trimmed, clamped note for the wire, or undefined when the student left it blank. */
export function normalizeNote(note: string): string | undefined {
  const trimmed = clampNote(note).trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

// --- Dates -----------------------------------------------------------------

/** The viewer's IANA zone, or UTC when the runtime cannot say. */
export function resolvedTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone !== undefined && zone !== '' ? zone : 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * "Nov 3" for an ISO instant in `timeZone`, always en-US, so server and client
 * render the same text and a test gets the same answer on any machine.
 * Invalid input gives null; an unknown zone falls back to UTC.
 */
export function formatDueDay(iso: string | undefined, timeZone: string): string | null {
  if (iso === undefined || iso === '') return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const date = new Date(ms);
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone }).format(
      date
    );
  } catch {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(date);
  }
}

// --- Summary ---------------------------------------------------------------

/** "3 due · 1 still owed · you finished 4" — also the weekly review push body. */
export function weekSummaryLine(counts: IWeekCounts): string {
  return `${counts.due} due · ${counts.owed} still owed · you finished ${counts.done}`;
}

/** Nothing owed and nothing due inside the horizon. Done work does not change this. */
export function isWeekClear(counts: IWeekCounts): boolean {
  return counts.owed === 0 && counts.due === 0;
}

export function doneSectionTitle(count: number): string {
  return `${DONE_SECTION_TITLE} (${count})`;
}
