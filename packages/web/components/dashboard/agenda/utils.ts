import type { IAgendaItem } from '@/lib/api/agenda';

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function groupItemsByDate(
  items: readonly IAgendaItem[]
): { label: string; items: IAgendaItem[] }[] {
  const now = new Date();
  const todayStart = startOfDay(now);
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const weekStart = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  const nextWeekStart = new Date(todayStart.getTime() + 14 * 24 * 60 * 60 * 1000);

  const groups: { label: string; min: number; max: number }[] = [
    { label: 'Overdue', min: 0, max: todayStart.getTime() - 1 },
    { label: 'Today', min: todayStart.getTime(), max: tomorrowStart.getTime() - 1 },
    { label: 'Tomorrow', min: tomorrowStart.getTime(), max: weekStart.getTime() - 1 },
    { label: 'This Week', min: weekStart.getTime(), max: nextWeekStart.getTime() - 1 },
    { label: 'Next Week', min: nextWeekStart.getTime(), max: Number.POSITIVE_INFINITY },
  ];

  return groups.map((g) => ({
    label: g.label,
    items: items.filter((item) => {
      const t = new Date(item.timeAt).getTime();
      return t >= g.min && t <= g.max;
    }),
  }));
}

export function filterItems(
  items: readonly IAgendaItem[],
  selectedLabels: Set<string>,
  selectedStudents: Set<string>
): IAgendaItem[] {
  if (selectedLabels.size === 0 && selectedStudents.size === 0) return [...items];

  return items.filter((item) => {
    if (selectedStudents.size > 0 && item.studentName && !selectedStudents.has(item.studentName)) {
      return false;
    }
    if (selectedLabels.size > 0) {
      const itemLabels = new Set(item.labels ?? []);
      const hasMatch = [...selectedLabels].some((l) => itemLabels.has(l));
      if (!hasMatch) return false;
    }
    return true;
  });
}
