import type { ReactElement, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface IFormStatusAlertProps {
  readonly children: ReactNode;
  readonly variant: 'info' | 'success' | 'warning';
  readonly className?: string;
  readonly 'data-testid'?: string;
  readonly live?: 'assertive' | 'polite';
}

const VARIANT_CLASSES: Record<IFormStatusAlertProps['variant'], string> = {
  warning:
    'rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-200',
  success:
    'rounded-md bg-green-50 p-3 text-sm text-green-800 dark:bg-green-900/20 dark:text-green-200',
  info: 'rounded-md bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-900/20 dark:text-blue-200',
};

export function FormStatusAlert({
  children,
  variant,
  className,
  'data-testid': testId,
  live = 'polite',
}: IFormStatusAlertProps): ReactElement {
  return (
    <div
      role="alert"
      aria-live={live}
      data-testid={testId}
      className={cn(VARIANT_CLASSES[variant], className)}
    >
      {children}
    </div>
  );
}
