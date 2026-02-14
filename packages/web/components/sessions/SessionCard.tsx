'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { ISession } from '@/lib/api/sessions';
import { Monitor, Smartphone, Tablet } from 'lucide-react';

export interface SessionCardProps {
  session: ISession;
  onRevoke: (sessionId: string) => void;
  isRevoking?: boolean;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

function DeviceIcon({ deviceInfo }: { deviceInfo: ISession['deviceInfo'] }) {
  const device = (deviceInfo?.device ?? '').toLowerCase();
  if (device.includes('mobile') || device.includes('phone')) {
    return <Smartphone className="h-5 w-5 text-muted-foreground" />;
  }
  if (device.includes('tablet')) {
    return <Tablet className="h-5 w-5 text-muted-foreground" />;
  }
  return <Monitor className="h-5 w-5 text-muted-foreground" />;
}

export function SessionCard({ session, onRevoke, isRevoking }: SessionCardProps) {
  const { id, deviceInfo, ipAddress, lastActiveAt, createdAt, isCurrent } = session;
  const browser = deviceInfo?.browser ?? 'Unknown browser';
  const os = deviceInfo?.os ?? 'Unknown OS';

  return (
    <Card data-testid={`session-card-${id}`}>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg border p-2">
              <DeviceIcon deviceInfo={deviceInfo} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{browser}</span>
                {isCurrent && (
                  <Badge variant="secondary" data-testid="session-current-badge">
                    Current session
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{os}</p>
              <p className="text-xs text-muted-foreground mt-1">IP: {ipAddress}</p>
              <p className="text-xs text-muted-foreground">
                Last active: {formatDate(lastActiveAt)}
              </p>
              <p className="text-xs text-muted-foreground">
                Signed in: {formatDate(createdAt)}
              </p>
            </div>
          </div>
          {!isCurrent && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onRevoke(id)}
              disabled={isRevoking}
              data-testid={`session-revoke-${id}`}
            >
              {isRevoking ? 'Revoking...' : 'Revoke'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
