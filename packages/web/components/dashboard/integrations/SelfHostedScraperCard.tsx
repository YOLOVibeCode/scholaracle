'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConnectProviderWizard } from './ConnectProviderWizard';
import { apiClient } from '@/lib/api/client';
import type { IBundleConnection, IBundleConnectionPayload } from './bundle-types';
import { Trash2 } from 'lucide-react';

export function SelfHostedScraperCard() {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [bundleDownloading, setBundleDownloading] = useState(false);
  const [bundle, setBundle] = useState<IBundleConnection[]>([]);
  const [bundleError, setBundleError] = useState<string | null>(null);

  const detectedOS = typeof navigator !== 'undefined' && navigator.userAgent.includes('Win') ? 'windows' : 'mac';

  const handleRemoveFromBundle = (id: string) => {
    setBundle((b) => b.filter((c) => c.id !== id));
    setBundleError(null);
  };

  const handleDownloadBundle = async () => {
    if (bundle.length === 0) return;
    const allReady = bundle.every((c) => c.generationStatus === 'ready');
    if (!allReady) return;
    setBundleDownloading(true);
    setBundleError(null);
    try {
      const baseUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:2801/api';
      const token = apiClient.getToken() ?? (typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null);
      const payload: IBundleConnectionPayload[] = bundle.map((c) => ({
        platformId: c.platformId,
        platformName: c.platformName,
        loginUrl: c.loginUrl,
        scraperId: c.scraperId,
        credentials: {
          username: c.username,
          password: c.password,
          studentNameHint: c.studentNameHint,
        },
      }));
      const response = await fetch(`${baseUrl}/integrations/scraper-download`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ os: detectedOS, connections: payload }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? 'Download failed');
      }
      const blob = await response.blob();
      const ext = detectedOS === 'windows' ? '.bat' : '.command';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scholaracle-bundle${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setBundleError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setBundleDownloading(false);
    }
  };

  const handleDownloadAll = async () => {
    setDownloading(true);
    try {
      const baseUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:2801/api';
      const token = apiClient.getToken() ?? (typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null);
      const response = await fetch(`${baseUrl}/integrations/scraper-download`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ os: detectedOS, useAllStudents: true }),
      });
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const ext = detectedOS === 'windows' ? '.bat' : '.command';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scholaracle-sync${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <Card className="border-dashed border-2" data-testid="self-hosted-scraper-card">
        <CardHeader className="pb-2">
          <div>
            <h3 className="font-semibold text-lg leading-tight">Connect Your School</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Download a scraper that runs on your computer and syncs your child&apos;s grades, assignments, and more.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground space-y-2">
            <p>
              Works with Canvas, Aeries, Skyward, and dozens of other school platforms.
              Your login credentials stay on your computer — only academic data syncs to your account.
            </p>
          </div>

          {bundle.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Platforms in bundle:</p>
              {bundle.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">{c.platformName}</span>
                    <span className="block truncate text-xs text-muted-foreground">{c.loginUrl}</span>
                  </div>
                  <Badge
                    variant={c.generationStatus === 'ready' ? 'default' : c.generationStatus === 'failed' ? 'destructive' : 'secondary'}
                    className="text-[10px] shrink-0"
                  >
                    {c.generationStatus === 'ready' ? 'Ready' : c.generationStatus === 'failed' ? 'Failed' : 'Generating'}
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => handleRemoveFromBundle(c.id)}
                    aria-label="Remove from bundle"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              {bundleError && <p className="text-sm text-destructive">{bundleError}</p>}
              <Button
                size="lg"
                className="w-full"
                disabled={bundleDownloading || !bundle.every((c) => c.generationStatus === 'ready')}
                onClick={handleDownloadBundle}
                data-testid="button-download-bundle"
              >
                {bundleDownloading ? 'Downloading...' : 'Download Bundle'}
              </Button>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Button
              onClick={() => setWizardOpen(true)}
              size="lg"
              className="w-full"
              data-testid="button-connect-school"
            >
              {bundle.length > 0 ? 'Add another platform' : 'Get Started'}
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="w-full"
              disabled={downloading}
              onClick={handleDownloadAll}
              data-testid="button-download-all"
            >
              {downloading ? 'Downloading...' : 'Download Script (all students)'}
            </Button>
          </div>

          <div className="text-xs text-muted-foreground text-center">
            Takes about 2 minutes. You&apos;ll download a file and double-click it.
          </div>
        </CardContent>
      </Card>

      <ConnectProviderWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onConnectionReady={(connection) => {
          setBundle((b) => [...b, connection]);
          setWizardOpen(false);
        }}
      />
    </>
  );
}
