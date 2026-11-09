import type { IWin } from '@scholaracle/interfaces';

/**
 * One positive line for Today and This week. Names a win when there is one;
 * never a score. Shared so both views say the same thing.
 */
export function encouragementLine(wins: readonly IWin[], hasOpenWork: boolean): string {
  const graded = wins.find((w) => w.kind === 'graded');
  if (graded) return `Nice work on ${graded.title}.`;
  const opened = wins.find((w) => w.kind === 'opened_pack');
  if (opened) return `You opened ${opened.title} yesterday.`;
  const streak = wins.find((w) => w.kind === 'on_time_streak');
  if (streak) return 'On-time streak going — keep it up.';
  if (!hasOpenWork) return "You're caught up.";
  return "Let's take the next step.";
}
