'use client';

import { useEffect, useState } from 'react';
import {
  STUDENT_NOTE_MAX_CHARS,
  STUDENT_STATUSES,
  type StudentStatus,
} from '@scholaracle/contracts';
import {
  NEED_HELP_SENT_MESSAGE,
  STUDENT_STATUS_LABELS,
  STUDENT_STATUS_MARKS,
} from '@scholaracle/studio-core';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

/** What the sheet is about. `currentStatus` is unknown on Today rows. */
export interface IStatusSheetTarget {
  readonly assignmentExternalId: string;
  readonly title: string;
  readonly currentStatus?: StudentStatus;
}

export interface IStudentStatusSheetProps {
  readonly target: IStatusSheetTarget | null;
  onClose(): void;
  /** Resolves when the server accepted the change; rejects to keep the sheet open. */
  onSubmit(assignmentExternalId: string, status: StudentStatus, note?: string): Promise<void>;
}

type Step = 'pick' | 'note' | 'sent';

export const STATUS_SAVE_ERROR = "Couldn't save that. Try again.";

function clampNote(note: string): string {
  return Array.from(note).slice(0, STUDENT_NOTE_MAX_CHARS).join('');
}

function noteLength(note: string): number {
  return Array.from(note).length;
}

/**
 * Status sheet shared by Today and This week: Not started / Working on it /
 * Need help / Done. Need help asks for an optional 140-char note, then shows
 * "Your grown-ups were told". No grades anywhere.
 */
export function StudentStatusSheet({
  target,
  onClose,
  onSubmit,
}: IStudentStatusSheetProps): React.ReactElement {
  const [step, setStep] = useState<Step>('pick');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fresh sheet for every target.
  useEffect(() => {
    setStep('pick');
    setNote('');
    setBusy(false);
    setError(null);
  }, [target?.assignmentExternalId]);

  const submit = (status: StudentStatus, noteText?: string): void => {
    if (target === null || busy) return;
    setBusy(true);
    setError(null);
    void onSubmit(target.assignmentExternalId, status, noteText)
      .then(() => {
        if (status === 'need_help') setStep('sent');
        else onClose();
      })
      .catch(() => setError(STATUS_SAVE_ERROR))
      .finally(() => setBusy(false));
  };

  const trimmed = clampNote(note).trim();

  return (
    <Dialog open={target !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent data-testid="status-sheet" className="sm:max-w-sm">
        {target === null ? null : step === 'pick' ? (
          <div data-testid="status-sheet-pick" className="flex flex-col gap-3">
            <DialogHeader>
              <DialogTitle className="text-base">{target.title}</DialogTitle>
              <DialogDescription>How is it going?</DialogDescription>
            </DialogHeader>
            <div role="group" aria-label="Status" className="flex flex-col gap-1">
              {STUDENT_STATUSES.map((status) => {
                const selected = target.currentStatus === status;
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => (status === 'need_help' ? setStep('note') : submit(status))}
                    disabled={busy}
                    aria-pressed={selected}
                    data-testid={`status-option-${status}`}
                    className={`flex items-center gap-3 rounded-md px-3 py-3 text-left text-base hover:bg-accent disabled:opacity-50 ${
                      selected ? 'bg-accent font-semibold text-primary' : ''
                    }`}
                  >
                    <span aria-hidden="true" className="w-5 text-center text-primary">
                      {STUDENT_STATUS_MARKS[status]}
                    </span>
                    {STUDENT_STATUS_LABELS[status]}
                  </button>
                );
              })}
            </div>
            {error !== null ? (
              <p role="alert" data-testid="status-sheet-error" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
        ) : step === 'note' ? (
          <div data-testid="status-sheet-note" className="flex flex-col gap-3">
            <DialogHeader>
              <DialogTitle>Need help?</DialogTitle>
              <DialogDescription>
                Tell your grown-ups you&apos;re stuck on &ldquo;{target.title}&rdquo;.
              </DialogDescription>
            </DialogHeader>
            <label className="flex flex-col gap-1 text-sm">
              <span className="sr-only">Note, optional</span>
              <Textarea
                value={note}
                onChange={(event) => setNote(clampNote(event.target.value))}
                placeholder="Note (optional)"
                maxLength={STUDENT_NOTE_MAX_CHARS}
                disabled={busy}
                data-testid="need-help-note"
              />
              <span
                className="self-end text-xs text-muted-foreground"
                data-testid="need-help-counter"
                aria-live="polite"
              >
                {noteLength(note)}/{STUDENT_NOTE_MAX_CHARS}
              </span>
            </label>
            {error !== null ? (
              <p role="alert" data-testid="status-sheet-error" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => submit('need_help', trimmed.length > 0 ? trimmed : undefined)}
                disabled={busy}
                data-testid="need-help-send"
              >
                {busy ? 'Sending…' : 'Send'}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div data-testid="status-sheet-sent" className="flex flex-col gap-3">
            <DialogHeader>
              <DialogTitle>{NEED_HELP_SENT_MESSAGE}</DialogTitle>
              <DialogDescription>Move the status on when you get unstuck.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" onClick={onClose} data-testid="need-help-ok">
                OK
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
