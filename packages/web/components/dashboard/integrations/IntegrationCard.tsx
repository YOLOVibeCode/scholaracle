'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { IIntegration } from '@/lib/api/integrations';

export interface IntegrationCardProps {
  integration: IIntegration;
}

const PROVIDER_LABELS: Record<string, string> = {
  canvas: 'Canvas LMS',
  'google-classroom': 'Google Classroom',
  schoology: 'Schoology',
  skyward: 'Skyward',
  fixture: 'Fixture (Demo)',
};

export function IntegrationCard({ integration }: IntegrationCardProps) {
  const providerLabel = PROVIDER_LABELS[integration.provider] ?? integration.provider;
  const linkedCount = integration.linkedStudents ?? 0;

  return (
    <Link
      href={`/dashboard/integrations/${integration.id}`}
      className="block transition-opacity hover:opacity-90"
      data-testid={`integration-card-${integration.id}`}
    >
      <Card className="h-full">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold leading-tight truncate" title={integration.displayName}>
              {integration.displayName}
            </h3>
            <Badge variant={integration.enabled ? 'default' : 'secondary'} className="shrink-0">
              {integration.enabled ? 'Active' : 'Disabled'}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{providerLabel}</p>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          {integration.portalBaseUrl && (
            <p className="truncate" title={integration.portalBaseUrl}>
              {integration.portalBaseUrl}
            </p>
          )}
          <p>
            Schedule: {integration.schedule} • {linkedCount} student{linkedCount !== 1 ? 's' : ''} linked
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
