import type { IWeekCounts, StudentStatus, WeekNeed } from '@scholaracle/contracts';

/**
 * Student-facing copy for This week, shared by the phone, the web studio and
 * the weekly review push (R4) so every surface says the same thing. No scores.
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

export const OWED_SECTION_TITLE = 'Still owed';
export const DONE_SECTION_TITLE = 'Done this week';
export const WEEK_EMPTY_MESSAGE = "You're caught up.";

/** Shown after a "Need help" is sent; R3 makes it true by alerting the adults. */
export const NEED_HELP_SENT_MESSAGE = 'Your grown-ups were told';

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
