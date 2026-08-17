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
  provider?: string;
  onClose: () => void;
  onSaved?: () => void;
}

const HTML_PORTAL_PROVIDERS = new Set(['canvas', 'skyward', 'aeries', 'powerschool', 'infinite_campus', 'genesis']);

export function SourceCredentialsSheet({
  open,
  studentId,
  sourceId,
  displayName,
  provider,
  onClose,
  onSaved,
}: SourceCredentialsSheetProps) {
  const [accessToken, setAccessToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isHtmlPortal = provider ? HTML_PORTAL_PROVIDERS.has(provider.toLowerCase()) : false;

  const handleSave = async () => {
    setError(null);
    if (!accessToken.trim()) {
      setError('Enter an access token');
      return;
    }
    const creds: ISourceCredentialsRequest = { authType: 'api', accessToken: accessToken.trim() };
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
          {isHtmlPortal ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950 p-4 space-y-2">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                Use the mobile app, browser extension, or local CLI
              </p>
              <p className="text-sm text-amber-800 dark:text-amber-200">
                {displayName} uses browser-based extraction. School portal credentials stay on your
                device and are never sent to Scholarmancy servers.
              </p>
              <ul className="text-sm text-amber-800 dark:text-amber-200 list-disc list-inside space-y-1">
                <li>
                  <strong>iOS app</strong> — tap Add Source inside the Scholarmancy app
                </li>
                <li>
                  <strong>Browser extension</strong> — connect from your school&apos;s portal page
                </li>
                <li>
                  <strong>Local CLI</strong> — run{' '}
                  <code className="bg-amber-100 dark:bg-amber-900 rounded px-1">
                    npx scholaracle-scraper run
                  </code>
                </li>
              </ul>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">Add an API access token for this source.</p>
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
            </>
          )}
          {isHtmlPortal && (
            <Button type="button" variant="outline" onClick={onClose} className="w-full">
              Close
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
