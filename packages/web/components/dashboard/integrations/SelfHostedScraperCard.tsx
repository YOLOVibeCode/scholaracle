'use client';

import { useState, type JSX } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConnectProviderWizard } from './ConnectProviderWizard';
import type { IBundleConnection } from './bundle-types';
import { Trash2 } from 'lucide-react';
import { ConnectOnPhonePanel } from './ConnectOnPhonePanel';

export function SelfHostedScraperCard(): JSX.Element {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [bundle, setBundle] = useState<IBundleConnection[]>([]);

  const handleRemoveFromBundle = (id: string) => {
    setBundle((b) => b.filter((c) => c.id !== id));
  };

  return (
    <>
      <Card className="border-dashed border-2" data-testid="self-hosted-scraper-card">
        <CardHeader className="pb-2">
          <div>
            <h3 className="font-semibold text-lg leading-tight">Connect Your School</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Finish connecting in the Scholarmancy app on your phone. Your school login stays on your device.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground space-y-2">
            <p>Works with Canvas, Aeries, Skyward, and other portals. Scan the QR code below or copy the link.</p>
          </div>

          {bundle.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Platforms:</p>
              {bundle.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">{c.platformName}</span>
                    <span className="block truncate text-xs text-muted-foreground">{c.loginUrl}</span>
                  </div>
                  <Badge variant="secondary" className="text-[10px] shrink-0">
                    Phone
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => handleRemoveFromBundle(c.id)}
                    aria-label="Remove from list"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <ConnectOnPhonePanel />

          <div className="flex flex-col gap-2">
            <Button
              onClick={() => setWizardOpen(true)}
              size="lg"
              className="w-full"
              data-testid="button-connect-school"
            >
              {bundle.length > 0 ? 'Add another platform' : 'Get Started'}
            </Button>
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
