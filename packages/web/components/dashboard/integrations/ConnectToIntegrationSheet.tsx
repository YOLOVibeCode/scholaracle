'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { integrationsApi, type IIntegration, type IAssignStudentCredentials } from '@/lib/api/integrations';
import { useAsyncData } from '@/lib/hooks';

export interface ConnectToIntegrationSheetProps {
  open: boolean;
  studentId: string;
  linkedSourceIds: string[];
  onClose: () => void;
  onConnected?: () => void;
}

export function ConnectToIntegrationSheet({
  open,
  studentId,
  linkedSourceIds,
  onClose,
  onConnected,
}: ConnectToIntegrationSheetProps) {
  const [selected, setSelected] = useState<IIntegration | null>(null);
  const [authType, setAuthType] = useState<'api' | 'login'>('api');
  const [accessToken, setAccessToken] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: integrations } = useAsyncData(() => integrationsApi.list(), { retryCount: 1 });
  const available = (integrations ?? []).filter((i) => !linkedSourceIds.includes(i.id));

  const handleClose = () => {
    setSelected(null);
    setAuthType('api');
    setAccessToken('');
    setUsername('');
    setPassword('');
    setError(null);
    onClose();
  };

  const handleConnect = async () => {
    if (!selected) return;
    setError(null);
    setSubmitting(true);

    let credentials: IAssignStudentCredentials | undefined;
    if (authType === 'api' && accessToken.trim()) {
      credentials = { authType: 'api', accessToken: accessToken.trim() };
    } else if (authType === 'login' && username.trim() && password) {
      credentials = { authType: 'login', username: username.trim(), password };
    }

    try {
      const result = await integrationsApi.assignStudent(selected.id, studentId, { credentials });
      if (result) {
        onConnected?.();
        handleClose();
      } else {
        setError('Failed to connect');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && handleClose()}>
      <SheetContent className="sm:max-w-md" data-testid="connect-to-integration-sheet">
        <SheetHeader>
          <SheetTitle>Connect to existing integration</SheetTitle>
        </SheetHeader>
        <div className="py-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Choose an integration you already set up, then add this student&apos;s credentials.
          </p>

          {!selected ? (
            <div className="grid gap-2">
              {available.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No integrations available. Add a provider from the Integrations page first, or connect a new source above.
                </p>
              ) : (
                available.map((i) => (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => setSelected(i)}
                    className="flex flex-col items-start rounded-lg border p-3 text-left hover:bg-muted/50 transition-colors w-full"
                    data-testid={`integration-option-${i.id}`}
                  >
                    <span className="font-medium">{i.displayName}</span>
                    <span className="text-xs text-muted-foreground">{i.provider} · {i.schedule}</span>
                  </button>
                ))
              )}
            </div>
          ) : (
            <>
              <p className="text-sm font-medium">{selected.displayName}</p>
              <div className="space-y-2">
                <Label>Credentials (optional — can add later)</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={authType === 'api' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setAuthType('api')}
                  >
                    API token
                  </Button>
                  <Button
                    type="button"
                    variant={authType === 'login' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setAuthType('login')}
                  >
                    Portal login
                  </Button>
                </div>
                {authType === 'api' && (
                  <Input
                    type="password"
                    placeholder="Access token"
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                  />
                )}
                {authType === 'login' && (
                  <div className="space-y-2">
                    <Input
                      type="text"
                      placeholder="Username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                    />
                    <Input
                      type="password"
                      placeholder="Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                )}
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setSelected(null)}>
                  Back
                </Button>
                <Button
                  type="button"
                  onClick={handleConnect}
                  disabled={submitting}
                  data-testid="connect-to-integration-submit"
                >
                  {submitting ? 'Connecting...' : 'Connect'}
                </Button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
