'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SessionCard } from '@/components/sessions/SessionCard';
import { adminSessionsApi, type IAdminSession } from '@/lib/api/admin/sessions';
import { ArrowLeft } from 'lucide-react';

export default function AdminSessionsPage() {
  const [sessions, setSessions] = useState<readonly IAdminSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const list = await adminSessionsApi.list();
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
      const ok = await adminSessionsApi.revoke(sessionId);
      if (ok) {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      }
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin/dashboard" data-testid="link-back-dashboard">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">Active sessions</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Admin sessions</CardTitle>
          <CardDescription>
            Devices where you are signed in to the admin panel. Revoke any session you don&apos;t recognize.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-muted-foreground">Loading sessions...</p>
          ) : sessions.length === 0 ? (
            <p className="text-muted-foreground">No active sessions.</p>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session as Parameters<typeof SessionCard>[0]['session']}
                  onRevoke={handleRevoke}
                  isRevoking={revokingId === session.id}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
