import { fetchStudioToday } from '@/lib/api/studio';
import { loadForStudio } from '@/lib/auth/requireStudioToken';
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
  const { token, view } = await loadForStudio('/studio', fetchStudioToday);

  return (
    <main data-testid="studio-today">
      <TodayView view={view} token={token} />
    </main>
  );
}
