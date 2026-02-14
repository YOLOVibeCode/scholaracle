'use client';

import type { IAgendaItem } from '@/lib/api/agenda';
import { AgendaCard } from './AgendaCard';

export interface AgendaDateGroupProps {
  label: string;
  items: readonly IAgendaItem[];
  onSnooze: (id: string) => void;
  onReminderSent: () => void;
}

export function AgendaDateGroup({
  label,
  items,
  onSnooze,
  onReminderSent,
}: AgendaDateGroupProps) {
  if (items.length === 0) return null;

  return (
    <section data-testid={`agenda-group-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </h2>
      <div className="space-y-2">
        {items.map((item) => (
          <AgendaCard
            key={item.id}
            item={item}
            onSnooze={onSnooze}
            onReminderSent={onReminderSent}
          />
        ))}
      </div>
    </section>
  );
}
