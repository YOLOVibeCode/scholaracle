import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { fetchStudioWorkPack, StudioAuthError, StudioNotFoundError } from '@/lib/api/studio';
import { StudioWorkPack } from '@/components/studio/StudioWorkPack';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Assignment',
  description: 'Work pack — open the hosted file in the page.',
};

/**
 * Student work pack — live GET /api/studio/assignments/:externalId.
 */
export default async function StudioAssignmentPage({
  params,
}: {
  readonly params: Promise<{ externalId: string }>;
}): Promise<React.ReactElement> {
  const { externalId } = await params;
  const token = (await cookies()).get('auth_token')?.value;
  if (token === undefined || token === '') {
    redirect(`/login?redirect=/studio/assignments/${encodeURIComponent(externalId)}`);
  }

  let view;
  try {
    view = await fetchStudioWorkPack(token, externalId);
  } catch (err) {
    if (err instanceof StudioAuthError) {
      redirect(
        `/login/expired?redirect=${encodeURIComponent(`/studio/assignments/${externalId}`)}`
      );
    }
    if (err instanceof StudioNotFoundError) {
      notFound();
    }
    throw err;
  }

  return (
    <main data-testid="studio-pack-page">
      <div className="mx-auto w-full max-w-2xl px-6 pt-6">
        <Link href="/studio" className="text-sm text-muted-foreground hover:text-foreground">
          ← Today
        </Link>
      </div>
      <StudioWorkPack view={view} assignmentExternalId={externalId} />
    </main>
  );
}
