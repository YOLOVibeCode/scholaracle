'use client';

import Link from 'next/link';
import { useStudentView } from '@/lib/contexts/StudentViewContext';
import { Button } from '@/components/ui/button';

export function ViewingAsBanner() {
  const { isStudentView, studentName } = useStudentView();

  if (!isStudentView) return null;

  return (
    <div
      className="flex items-center justify-between gap-4 px-4 py-2 bg-muted/60 border-b text-sm"
      data-testid="viewing-as-banner"
    >
      <span className="text-muted-foreground">
        Viewing as <strong className="text-foreground">{studentName ?? '…'}</strong>
      </span>
      <Button
        variant="ghost"
        size="sm"
        asChild
        data-testid="button-back-to-dashboard"
      >
        <Link href="/dashboard">Back to my dashboard</Link>
      </Button>
    </div>
  );
}
