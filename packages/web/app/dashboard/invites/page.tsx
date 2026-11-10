'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PendingInvitesList } from '@/components/dashboard/sharing/PendingInvitesList';

/**
 * /dashboard/invites: invitations addressed to the signed-in parent (sharing-spec §4.8).
 * The invitation email's fallback line ("sign in and open Invites") lands here.
 */
export default function InvitesPage() {
  return (
    <div className="space-y-6" data-testid="invites-page">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard" data-testid="back-link">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Invitations</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Students other parents and guardians have shared with you.
          </p>
        </div>
      </div>
      <PendingInvitesList />
    </div>
  );
}
