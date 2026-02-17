'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { integrationsApi } from '@/lib/api/integrations';
import { useAsyncData } from '@/lib/hooks';
import { ErrorDisplay } from '@/components/common';
import { IntegrationCard } from '@/components/dashboard/integrations/IntegrationCard';
import { AddProviderWizard } from '@/components/dashboard/integrations/AddProviderWizard';
import { SelfHostedScraperCard } from '@/components/dashboard/integrations/SelfHostedScraperCard';

export default function IntegrationsPage() {
  const [wizardOpen, setWizardOpen] = useState(false);

  const { data: integrations, isLoading, error, retry, refresh } = useAsyncData(
    () => integrationsApi.list(),
    { retryCount: 2, retryDelay: 1000 }
  );

  const handleAdded = () => {
    refresh();
  };

  return (
    <div className="space-y-6" data-testid="integrations-page">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Integrations</h1>
          <p className="text-muted-foreground">
            Manage LMS providers and assign them to students. Each student can have their own credentials per provider.
          </p>
        </div>
        <Button
          onClick={() => setWizardOpen(true)}
          data-testid="button-add-provider"
        >
          Add Provider
        </Button>
      </div>

      <SelfHostedScraperCard />

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <div className="h-20 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {error && !isLoading && (
        <Card>
          <CardContent className="pt-6">
            <ErrorDisplay error={error} title="Failed to load integrations" onRetry={retry} />
          </CardContent>
        </Card>
      )}
      {!isLoading && !error && integrations && integrations.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3" data-testid="integrations-list">
          {integrations.map((integration) => (
            <IntegrationCard key={integration.id} integration={integration} />
          ))}
        </div>
      )}
      {!isLoading && !error && integrations && integrations.length === 0 && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              No integrations yet. Add a provider (e.g. Canvas LMS) to connect your school&apos;s data, then assign it to students with their own credentials.
            </p>
            <Button
              className="mt-4"
              onClick={() => setWizardOpen(true)}
              data-testid="button-add-provider-empty"
            >
              Add Provider
            </Button>
          </CardContent>
        </Card>
      )}

      <AddProviderWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onAdded={handleAdded}
      />
    </div>
  );
}
