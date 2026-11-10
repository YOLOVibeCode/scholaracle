'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { sharingApi } from '@/lib/api/sharing';
import { groupPendingInvites } from '@/lib/sharing/inviteGroups';
import { useAsyncData } from '@/lib/hooks';

/**
 * Dashboard banner shown while `GET /api/sharing/invites/pending` is non-empty
 * (sharing-spec §4.8). Links to /dashboard/invites, where each invitation can be accepted or
 * declined. Renders nothing while loading, on error, or with no invitations.
 */
export function PendingInvitesBanner() {
  const fetchPending = useCallback(() => sharingApi.getPendingInvites(), []);
  const { data } = useAsyncData(fetchPending);
  const groups = data ? groupPendingInvites(data) : [];
  if (groups.length === 0) return null;
  const count = groups.length;
  const studentCount = data?.length ?? 0;
  const inviters = [...new Set(groups.map((g) => g.inviterName))];
  return (
    <Card
      className="border-primary/30 bg-primary/5"
      data-testid="pending-invites-banner"
      role="status"
    >
      <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div className="flex items-center gap-3">
          <Mail className="h-5 w-5 text-primary" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium">
              You have {count} pending {count === 1 ? 'invitation' : 'invitations'}
            </p>
            <p className="text-xs text-muted-foreground" data-testid="pending-invites-from">
              {inviters.join(', ')} shared {studentCount === 1 ? 'a student' : 'students'} with you.
            </p>
          </div>
        </div>
        <Button size="sm" asChild data-testid="pending-invites-link">
          <Link href="/dashboard/invites">View invitations</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
