'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ISharingInviteRequest, ISharingInviteResult } from '@scholaracle/contracts';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { studentsApi } from '@/lib/api/students';
import { canManagePeople } from '@/lib/sharing/access';
import { ShareForm, type IShareCandidate } from './ShareForm';

export interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  /** Pre-ticked students (the current student when opened from a student page). */
  defaultStudentIds?: readonly string[];
  onSent?: (result: ISharingInviteResult, body: ISharingInviteRequest) => void;
}

/**
 * "Share" from the dashboard or a student page (sharing-spec §4.8). Lists the students the
 * viewer owns or manages; the form sends one invitation for all the ticked ones.
 */
export function ShareDialog({ open, onClose, defaultStudentIds, onSent }: ShareDialogProps) {
  const [students, setStudents] = useState<readonly IShareCandidate[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const all = await studentsApi.getAll();
      setStudents(
        all
          .filter((s) => canManagePeople(s.access))
          .map((s) => ({ id: s.id, name: s.name }))
      );
    } catch (err) {
      setStudents([]);
      setLoadError(err instanceof Error ? err.message : 'Failed to load students');
    }
  }, []);

  useEffect(() => {
    if (open) {
      setStudents(null);
      void load();
    }
  }, [open, load]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-xl" data-testid="share-dialog">
        <DialogHeader>
          <DialogTitle>Share with someone</DialogTitle>
          <DialogDescription>
            Invite a co-parent, guardian or caregiver. They see grades, assignments and alerts for
            the students you pick, on the web and on their phone. Sharing never counts against
            their plan.
          </DialogDescription>
        </DialogHeader>
        {students === null ? (
          <p className="text-sm text-muted-foreground" data-testid="share-loading">
            Loading students…
          </p>
        ) : (
          <>
            {loadError && (
              <p className="text-sm text-destructive" role="alert">
                {loadError}
              </p>
            )}
            <ShareForm
              students={students}
              defaultStudentIds={defaultStudentIds}
              onSent={onSent}
              onDone={onClose}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
