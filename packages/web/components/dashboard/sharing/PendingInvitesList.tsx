'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { Check, Mail, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorDisplay, LoadingSkeleton } from '@/components/common';
import { sharingApi } from '@/lib/api/sharing';
import { useAsyncData } from '@/lib/hooks';
import { LABEL_TEXT } from '@/lib/sharing/access';
import { groupPendingInvites, joinNames, type IPendingInviteGroup } from '@/lib/sharing/inviteGroups';

interface IStatus {
  readonly kind: 'accepted' | 'declined';
  readonly names: string;
}

export interface PendingInvitesListProps {
  /** Called after an accept or decline succeeded (the dashboard refreshes its student list). */
  onChanged?: () => void;
}

/**
 * /dashboard/invites: one card per invitation group with Accept / Decline
 * (sharing-spec §4.4 step 4). Identity comes from the JWT; nothing here chooses whose invite.
 */
export function PendingInvitesList({ onChanged }: PendingInvitesListProps) {
  const fetchPending = useCallback(() => sharingApi.getPendingInvites(), []);
  const { data, isLoading, error, retry } = useAsyncData(fetchPending, { retryCount: 1 });
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [status, setStatus] = useState<IStatus | null>(null);

  const act = async (group: IPendingInviteGroup, kind: IStatus['kind']) => {
    setBusyKey(group.key);
    setActionError(null);
    try {
      if (kind === 'accepted') await sharingApi.accept(group.selection);
      else await sharingApi.decline(group.selection);
      setStatus({ kind, names: joinNames(group.students.map((s) => s.name)) });
      retry();
      onChanged?.();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'That did not work. Try again.');
    } finally {
      setBusyKey(null);
    }
  };

  const groups = data ? groupPendingInvites(data) : [];

  return (
    <div className="space-y-4" data-testid="pending-invites">
      {status && (
        <Card
          className={
            status.kind === 'accepted'
              ? 'border-green-200 bg-green-50/60 dark:border-green-800 dark:bg-green-900/20'
              : 'border-muted'
          }
          data-testid="invites-status"
          role="status"
        >
          <CardContent className="flex flex-wrap items-center justify-between gap-2 py-4 text-sm">
            <span>
              {status.kind === 'accepted'
                ? `You now follow ${status.names}.`
                : `You declined the invitation for ${status.names}.`}
            </span>
            {status.kind === 'accepted' && (
              <Button size="sm" variant="outline" asChild>
                <Link href="/dashboard/students" data-testid="invites-go-to-students">
                  Open students
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}
      {actionError && <ErrorDisplay error={actionError} title="Could not update the invitation" />}
      {isLoading && !data && <LoadingSkeleton variant="list" count={2} />}
      {error && !isLoading && (
        <ErrorDisplay error={error} title="Failed to load invitations" onRetry={retry} />
      )}
      {!isLoading && !error && groups.length === 0 && (
        <Card data-testid="invites-empty">
          <CardContent className="flex flex-col items-center py-10 text-center">
            <Mail className="mb-2 h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              No pending invitations. When someone shares a student with you, it shows up here.
            </p>
          </CardContent>
        </Card>
      )}
      {groups.map((group) => {
        const busy = busyKey === group.key;
        return (
          <Card key={group.key} data-testid={`invite-card-${group.key}`}>
            <CardHeader>
              <CardTitle className="text-base">
                {group.inviterName} invited you to follow {joinNames(group.students.map((s) => s.name))}
              </CardTitle>
              <CardDescription>
                Invited {new Date(group.invitedAt).toLocaleDateString()} as{' '}
                {LABEL_TEXT[group.label].toLowerCase()}
                {group.isAdmin ? ', with permission to manage' : ''}.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="flex flex-wrap gap-2">
                {group.students.map((s) => (
                  <li key={s.id}>
                    <Badge variant="secondary" data-testid={`invite-student-${s.id}`}>
                      {s.name}
                    </Badge>
                  </li>
                ))}
                <li>
                  <Badge variant="outline">{group.isAdmin ? 'Admin' : 'Member'}</Badge>
                </li>
              </ul>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => void act(group, 'accepted')}
                  disabled={busy}
                  data-testid={`invite-accept-${group.key}`}
                >
                  <Check className="h-4 w-4" />
                  {busy ? 'Working…' : 'Accept'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void act(group, 'declined')}
                  disabled={busy}
                  data-testid={`invite-decline-${group.key}`}
                >
                  <X className="h-4 w-4" />
                  Decline
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
