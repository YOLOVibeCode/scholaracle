import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { RunsPageClient } from '@/components/dashboard/students/RunsPageClient';

export const metadata: Metadata = { title: 'Sync Runs' };

export default async function RunsPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}): Promise<React.ReactElement> {
  const { id } = await params;

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <div className="mb-4">
        <Link
          href={`/dashboard/students/${id}?tab=sources`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to sources
        </Link>
      </div>
      <RunsPageClient studentId={id} />
    </div>
  );
}
