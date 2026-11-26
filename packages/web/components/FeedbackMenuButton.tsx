'use client';

import type { ReactElement, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { openFeedback } from '@/lib/feedback/feedback';
import { useFeedbackInMenu } from '@/lib/feedback/useFeedbackInMenu';

export interface IFeedbackMenuButtonProps {
  readonly children?: ReactNode;
  readonly className?: string;
  /** Runs before the form opens, for example to close the menu the button sits in. */
  readonly onBeforeOpen?: () => void;
}

/**
 * "Send feedback" for a page's own layout. It renders only where the relay widget's floating
 * button is not drawn (phones), and only once the widget has loaded. On a wide screen the
 * floating button does the job and this renders nothing.
 */
export function FeedbackMenuButton({
  children = 'Send feedback',
  className,
  onBeforeOpen,
}: IFeedbackMenuButtonProps): ReactElement | null {
  const inMenu = useFeedbackInMenu();
  if (!inMenu) return null;
  return (
    <Button
      type="button"
      variant="outline"
      className={className}
      data-testid="button-send-feedback"
      onClick={() => {
        onBeforeOpen?.();
        openFeedback();
      }}
    >
      {children}
    </Button>
  );
}
