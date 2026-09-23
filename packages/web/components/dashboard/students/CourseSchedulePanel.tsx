'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { studentsApi } from '@/lib/api/students';

export interface CourseSchedulePanelProps {
  readonly studentId: string;
  readonly courseExternalId: string;
  readonly classMeetingSummary?: string;
  readonly tutorialWindow?: string;
  readonly isTutorialManual?: boolean;
  readonly canResetTutorial?: boolean;
  onUpdated(): void;
}

export function CourseSchedulePanel({
  studentId,
  courseExternalId,
  classMeetingSummary,
  tutorialWindow,
  isTutorialManual,
  canResetTutorial,
  onUpdated,
}: CourseSchedulePanelProps) {
  const [draft, setDraft] = useState(tutorialWindow ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (): Promise<void> => {
    setIsSaving(true);
    setError(null);
    try {
      const ok = await studentsApi.updateCourseTutorial(studentId, courseExternalId, draft.trim());
      if (!ok) {
        setError('Could not save tutorial window');
        return;
      }
      onUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save tutorial window');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async (): Promise<void> => {
    setIsSaving(true);
    setError(null);
    try {
      await studentsApi.resetCourseTutorial(studentId, courseExternalId);
      onUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reset tutorial window');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="rounded-lg border bg-card p-4 text-sm"
      data-testid="course-schedule-panel"
    >
      <h3 className="font-medium">Schedule</h3>
      {classMeetingSummary ? (
        <p className="mt-2 text-muted-foreground" data-testid="text-class-meeting">
          Class: {classMeetingSummary}
        </p>
      ) : (
        <p className="mt-2 text-muted-foreground" data-testid="empty-class-meeting">
          Class meeting time not available from sync yet.
        </p>
      )}
      <div className="mt-3 space-y-2">
        <label htmlFor="tutorial-window-input" className="block font-medium">
          Tutorial window
        </label>
        <input
          id="tutorial-window-input"
          data-testid="input-tutorial-window"
          className="w-full rounded-md border bg-background px-3 py-2"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-describedby={error ? 'tutorial-window-error' : undefined}
        />
        {error ? (
          <p id="tutorial-window-error" className="text-red-600" data-testid="error-tutorial-window" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            data-testid="btn-save-tutorial"
            data-loading={isSaving}
            disabled={isSaving || draft.trim().length === 0}
            onClick={() => void handleSave()}
          >
            Save tutorial
          </Button>
          {canResetTutorial || isTutorialManual ? (
            <Button
              type="button"
              variant="outline"
              data-testid="btn-reset-tutorial"
              disabled={isSaving}
              onClick={() => void handleReset()}
            >
              Reset to synced
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
