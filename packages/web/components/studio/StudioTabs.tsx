import Link from 'next/link';

export type StudioTab = 'today' | 'week';

const TABS: readonly { readonly tab: StudioTab; readonly label: string; readonly href: string }[] =
  [
    { tab: 'today', label: 'Today', href: '/studio' },
    { tab: 'week', label: 'This week', href: '/studio/week' },
  ];

/** Today · This week — the two student studio views. */
export function StudioTabs({ active }: { readonly active: StudioTab }): React.ReactElement {
  return (
    <nav aria-label="Studio" data-testid="studio-tabs" className="flex gap-6 border-b">
      {TABS.map((entry) => {
        const selected = entry.tab === active;
        return (
          <Link
            key={entry.tab}
            href={entry.href}
            aria-current={selected ? 'page' : undefined}
            data-testid={`studio-tab-${entry.tab}`}
            className={
              selected
                ? '-mb-px border-b-2 border-primary pb-2 text-sm font-semibold text-primary'
                : 'pb-2 text-sm font-medium text-muted-foreground hover:text-foreground'
            }
          >
            {entry.label}
          </Link>
        );
      })}
    </nav>
  );
}
