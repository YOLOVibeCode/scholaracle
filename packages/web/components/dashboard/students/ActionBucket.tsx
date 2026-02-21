'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { IActionBucket as IActionBucketType } from '@/lib/api/students';
import { ActionItem } from './ActionItem';

export interface ActionBucketProps {
  readonly bucket: IActionBucketType;
}

type BucketId = IActionBucketType['id'];

function leftBorderClass(id: BucketId): string {
  switch (id) {
    case 'needs_attention':
      return 'border-l-red-500';
    case 'due_soon':
      return 'border-l-amber-500';
    case 'in_progress':
      return 'border-l-sky-500';
    case 'recently_graded':
      return 'border-l-emerald-500';
    case 'caught_up':
    default:
      return 'border-l-muted-foreground/50';
  }
}

export function ActionBucket({ bucket }: ActionBucketProps) {
  const defaultOpen = bucket.id !== 'caught_up';
  const [open, setOpen] = useState(defaultOpen);
  const borderClass = leftBorderClass(bucket.id);
  const isCollapsible = bucket.items.length > 0;

  return (
    <Card
      className={`border-l-4 ${borderClass}`}
      data-testid={`action-bucket-${bucket.id}`}
    >
      <CardHeader className="pb-2">
        <button
          type="button"
          className="flex w-full items-center gap-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          onClick={() => isCollapsible && setOpen((o) => !o)}
          aria-expanded={open}
        >
          {isCollapsible && (
            <span className="shrink-0 text-muted-foreground">
              {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </span>
          )}
          <CardTitle className="text-base font-semibold">{bucket.label}</CardTitle>
          <span
            className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
            data-testid={`action-bucket-count-${bucket.id}`}
          >
            {bucket.count}
          </span>
        </button>
      </CardHeader>
      {open && (
        <CardContent className="space-y-2 pt-0">
          {bucket.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing here.</p>
          ) : (
            bucket.items.map((item) => (
              <ActionItem key={item.assignmentExternalId} item={item} />
            ))
          )}
        </CardContent>
      )}
    </Card>
  );
}
