import type { ReactElement, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface IFormErrorAlertProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly 'data-testid'?: string;
  readonly live?: 'assertive' | 'polite';
}

export function FormErrorAlert({
  children,
  className,
  'data-testid': testId = 'message-error',
  live = 'assertive',
}: IFormErrorAlertProps): ReactElement {
  return (
    <div
      role="alert"
      aria-live={live}
      data-testid={testId}
      className={cn(
        'rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-200',
        className
      )}
    >
      {children}
    </div>
  );
}
