'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SessionCard } from '@/components/sessions/SessionCard';
import { sessionsApi, type ISession } from '@/lib/api/sessions';
import { ArrowLeft } from 'lucide-react';

export default function SessionsPage() {
  const [sessions, setSessions] = useState<readonly ISession[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const list = await sessionsApi.list();
        if (!cancelled) setSessions(list);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRevoke = async (sessionId: string) => {
    setRevokingId(sessionId);
    try {
      const ok = await sessionsApi.revoke(sessionId);
      if (ok) {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      }
    } finally {
      setRevokingId(null);
    }
  };

  const handleRevokeAllOther = async () => {
    setRevokingAll(true);
    try {
      const count = await sessionsApi.revokeAllOther();
      if (count > 0) {
        const list = await sessionsApi.list();
        setSessions(list);
      }
    } finally {
      setRevokingAll(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/settings" data-testid="link-back-settings">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">Active sessions</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Sessions</CardTitle>
          <CardDescription>
            Devices where you are signed in. Revoke any session you don&apos;t recognize.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-muted-foreground">Loading sessions...</p>
          ) : sessions.length === 0 ? (
            <p className="text-muted-foreground">No active sessions.</p>
          ) : (
            <>
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  onClick={handleRevokeAllOther}
                  disabled={revokingAll || sessions.length <= 1}
                  data-testid="button-revoke-all-other"
                >
                  {revokingAll ? 'Revoking...' : 'Revoke all other sessions'}
                </Button>
              </div>
              <div className="space-y-3">
                {sessions.map((session) => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    onRevoke={handleRevoke}
                    isRevoking={revokingId === session.id}
                  />
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
