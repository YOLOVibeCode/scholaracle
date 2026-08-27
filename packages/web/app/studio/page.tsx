import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { fetchStudioToday, StudioAuthError } from '@/lib/api/studio';
import { TodayView } from '@/components/studio/TodayView';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Today',
  description: 'Your next step.',
};

/**
 * Student Today — live GET /api/studio/today. Pages only fetch; TodayView is presentational.
 */
export default async function StudioPage(): Promise<React.ReactElement> {
  const token = (await cookies()).get('auth_token')?.value;
  if (token === undefined || token === '') {
    redirect('/login?redirect=/studio');
  }

  let view;
  try {
    view = await fetchStudioToday(token);
  } catch (err) {
    if (err instanceof StudioAuthError) {
      redirect('/login/expired?redirect=/studio');
    }
    throw err;
  }

  return (
    <main data-testid="studio-today">
      <TodayView view={view} token={token} />
    </main>
  );
}
