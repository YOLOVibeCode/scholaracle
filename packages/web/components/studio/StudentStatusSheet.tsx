'use client';

import { useEffect, useState } from 'react';
import {
  STUDENT_HELP_NOTE_MAX_CHARS,
  type IStudentStatusUpdateResponse,
  type StudentStatus,
} from '@scholaracle/contracts';
import {
  NEED_HELP_NOTE_PLACEHOLDER,
  NEED_HELP_TITLE,
  NEED_HELP_UNSTUCK_HINT,
  STATUS_SAVE_ERROR,
  STUDENT_STATUS_OPTIONS,
  clampNote,
  needHelpOutcomeMessage,
  needHelpPrompt,
  normalizeNote,
  noteCounter,
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
  /**
   * Resolves with the server's answer once it accepted the change (an older
   * server answers without `notified`); rejects to keep the sheet open.
   */
  onSubmit(
    assignmentExternalId: string,
    status: StudentStatus,
    note?: string
  ): Promise<IStudentStatusUpdateResponse | undefined>;
}

type Step = 'pick' | 'note' | 'sent';

/**
 * Status sheet shared by Today and This week: Not started / Working on it /
 * Need help / Done. Need help asks for an optional 140-char note, then tells
 * the student what actually happened: told, already told today, or just saved.
 * Dismiss is ignored while a save is in flight. No grades anywhere.
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
  const [outcome, setOutcome] = useState<string | null>(null);

  // Fresh sheet for every target.
  useEffect(() => {
    setStep('pick');
    setNote('');
    setBusy(false);
    setError(null);
    setOutcome(null);
  }, [target?.assignmentExternalId]);

  const requestClose = (): void => {
    if (busy) return;
    onClose();
  };

  const submit = (status: StudentStatus, noteText?: string): void => {
    if (target === null || busy) return;
    setBusy(true);
    setError(null);
    void onSubmit(target.assignmentExternalId, status, noteText)
      .then((response) => {
        if (status === 'need_help') {
          setOutcome(needHelpOutcomeMessage(response));
          setStep('sent');
        } else {
          onClose();
        }
      })
      .catch(() => setError(STATUS_SAVE_ERROR))
      .finally(() => setBusy(false));
  };

  return (
    <Dialog open={target !== null} onOpenChange={(open) => (open ? undefined : requestClose())}>
      <DialogContent data-testid="status-sheet" className="sm:max-w-sm">
        {target === null ? null : step === 'pick' ? (
          <div data-testid="status-sheet-pick" className="flex flex-col gap-3">
            <DialogHeader>
              <DialogTitle className="text-base">{target.title}</DialogTitle>
              <DialogDescription>How is it going?</DialogDescription>
            </DialogHeader>
            <div role="group" aria-label="Status" className="flex flex-col gap-1">
              {STUDENT_STATUS_OPTIONS.map((option) => {
                const selected = target.currentStatus === option.status;
                return (
                  <button
                    key={option.status}
                    type="button"
                    onClick={() =>
                      option.status === 'need_help' ? setStep('note') : submit(option.status)
                    }
                    disabled={busy}
                    aria-pressed={selected}
                    data-testid={`status-option-${option.status}`}
                    className={`flex items-center gap-3 rounded-md px-3 py-3 text-left text-base hover:bg-accent disabled:opacity-50 ${
                      selected ? 'bg-accent font-semibold text-primary' : ''
                    }`}
                  >
                    <span aria-hidden="true" className="w-5 text-center text-primary">
                      {option.mark}
                    </span>
                    {option.label}
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
              <DialogTitle>{NEED_HELP_TITLE}</DialogTitle>
              <DialogDescription>{needHelpPrompt(target.title)}</DialogDescription>
            </DialogHeader>
            <label className="flex flex-col gap-1 text-sm">
              <span className="sr-only">Note, optional</span>
              <Textarea
                value={note}
                onChange={(event) => setNote(clampNote(event.target.value))}
                placeholder={NEED_HELP_NOTE_PLACEHOLDER}
                maxLength={STUDENT_HELP_NOTE_MAX_CHARS}
                disabled={busy}
                data-testid="need-help-note"
              />
              <span
                className="self-end text-xs text-muted-foreground"
                data-testid="need-help-counter"
                aria-live="polite"
              >
                {noteCounter(note)}
              </span>
            </label>
            {error !== null ? (
              <p role="alert" data-testid="status-sheet-error" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={requestClose} disabled={busy}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => submit('need_help', normalizeNote(note))}
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
              <DialogTitle data-testid="need-help-outcome">{outcome}</DialogTitle>
              <DialogDescription>{NEED_HELP_UNSTUCK_HINT}</DialogDescription>
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
