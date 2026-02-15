'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { sourcesApi, type ISourceCredentialsRequest } from '@/lib/api/sources';

export interface SourceCredentialsSheetProps {
  open: boolean;
  studentId: string;
  sourceId: string;
  displayName: string;
  onClose: () => void;
  onSaved?: () => void;
}

export function SourceCredentialsSheet({
  open,
  studentId,
  sourceId,
  displayName,
  onClose,
  onSaved,
}: SourceCredentialsSheetProps) {
  const [authType, setAuthType] = useState<'api' | 'login'>('api');
  const [accessToken, setAccessToken] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    const creds: ISourceCredentialsRequest =
      authType === 'api'
        ? { authType: 'api', accessToken: accessToken.trim() }
        : { authType: 'login', username: username.trim(), password };
    if (authType === 'api' && !creds.accessToken?.trim()) {
      setError('Enter an access token');
      return;
    }
    if (authType === 'login' && (!creds.username?.trim() || !password)) {
      setError('Enter username and password');
      return;
    }
    setSubmitting(true);
    const ok = await sourcesApi.setCredentials(studentId, sourceId, creds);
    setSubmitting(false);
    if (ok) {
      onSaved?.();
      onClose();
    } else {
      setError('Failed to save credentials');
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="sm:max-w-md" data-testid="source-credentials-sheet">
        <SheetHeader>
          <SheetTitle>Credentials for {displayName}</SheetTitle>
        </SheetHeader>
        <div className="py-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Add API credentials or portal login so we can sync data. Stored securely.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={authType === 'api' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setAuthType('api')}
              data-testid="credentials-type-api"
            >
              API / access token
            </Button>
            <Button
              type="button"
              variant={authType === 'login' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setAuthType('login')}
              data-testid="credentials-type-login"
            >
              Log in to portal
            </Button>
          </div>
          {authType === 'api' && (
            <div className="space-y-2">
              <Label htmlFor="cred-access-token">Access token</Label>
              <Input
                id="cred-access-token"
                type="password"
                placeholder="Paste your API or access token"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                data-testid="input-cred-access-token"
              />
            </div>
          )}
          {authType === 'login' && (
            <div className="space-y-2">
              <Label htmlFor="cred-username">Username</Label>
              <Input
                id="cred-username"
                type="text"
                autoComplete="username"
                placeholder="Portal username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                data-testid="input-cred-username"
              />
              <Label htmlFor="cred-password">Password</Label>
              <Input
                id="cred-password"
                type="password"
                autoComplete="current-password"
                placeholder="Portal password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                data-testid="input-cred-password"
              />
            </div>
          )}
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={submitting}
              data-testid="button-save-credentials"
            >
              {submitting ? 'Saving...' : 'Save credentials'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
