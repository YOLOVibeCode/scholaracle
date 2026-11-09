import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { fetchStudioWeek, StudioAuthError } from '@/lib/api/studio';
import { StudioWeek } from '@/components/studio/StudioWeek';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'This week',
  description: 'What is due, what is still owed, and what you finished.',
};

/**
 * Student This week — live GET /api/studio/week. Pages only fetch; the view is presentational.
 */
export default async function StudioWeekPage(): Promise<React.ReactElement> {
  const token = (await cookies()).get('auth_token')?.value;
  if (token === undefined || token === '') {
    redirect('/login?redirect=/studio/week');
  }

  let view;
  try {
    view = await fetchStudioWeek(token);
  } catch (err) {
    if (err instanceof StudioAuthError) {
      redirect('/login/expired?redirect=/studio/week');
    }
    throw err;
  }

  return (
    <main data-testid="studio-week">
      <StudioWeek view={view} />
    </main>
  );
}
