'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ConnectSchoolWizard } from './ConnectSchoolWizard';
import { apiClient } from '@/lib/api/client';

export function SelfHostedScraperCard() {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const detectedOS = typeof navigator !== 'undefined' && navigator.userAgent.includes('Win') ? 'windows' : 'mac';

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

          <div className="flex flex-col gap-2">
            <Button
              onClick={() => setWizardOpen(true)}
              size="lg"
              className="w-full"
              data-testid="button-connect-school"
            >
              Get Started
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

      <ConnectSchoolWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
      />
    </>
  );
}
