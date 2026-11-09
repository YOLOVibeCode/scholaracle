import { fetchStudioWeek } from '@/lib/api/studio';
import { loadForStudio } from '@/lib/auth/requireStudioToken';
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
  const { view } = await loadForStudio('/studio/week', fetchStudioWeek);

  return (
    <main data-testid="studio-week">
      <StudioWeek view={view} />
    </main>
  );
}
