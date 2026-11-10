import type { ReactElement } from 'react';
import { AlertCircle, CheckCircle, Info, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-200',
  warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200',
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-200',
  positive: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-200',
};

const SEVERITY_META: Record<string, { readonly Icon: LucideIcon; readonly label: string }> = {
  critical: { Icon: AlertCircle, label: 'Critical' },
  warning: { Icon: AlertCircle, label: 'Warning' },
  info: { Icon: Info, label: 'Info' },
  positive: { Icon: CheckCircle, label: 'Positive' },
};

export interface IAlertSeverityBadgeProps {
  readonly severity: string;
  readonly className?: string;
  readonly 'data-testid'?: string;
}

function resolveMeta(severity: string): { readonly Icon: LucideIcon; readonly label: string } {
  return SEVERITY_META[severity] ?? SEVERITY_META.info;
}

export function AlertSeverityBadge({
  severity,
  className,
  'data-testid': testId = 'alert-severity',
}: IAlertSeverityBadgeProps): ReactElement {
  const normalized = severity.toLowerCase();
  const { Icon, label } = resolveMeta(normalized);
  const colorClass = SEVERITY_STYLES[normalized] ?? SEVERITY_STYLES.info;

  return (
    <Badge
      className={cn(colorClass, 'gap-1', className)}
      data-testid={testId}
      aria-label={`${label} severity`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </Badge>
  );
}
