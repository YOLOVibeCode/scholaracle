/**
 * ConfirmDialog Component (ISP)
 *
 * Reusable confirmation dialog for destructive actions.
 * Automation-friendly with stable testids.
 */

'use client';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export interface IConfirmDialogProps {
  readonly isOpen: boolean;
  readonly title: string;
  readonly description: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly variant?: 'default' | 'destructive';
  readonly isSubmitting?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'destructive',
  isSubmitting = false,
  onConfirm,
  onCancel,
}: IConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" data-testid="confirm-dialog-overlay">
      <Card className="w-full max-w-md" data-testid="confirm-dialog">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardFooter className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onCancel} disabled={isSubmitting} data-testid="confirm-dialog-cancel">
            {cancelLabel}
          </Button>
          <Button
            variant={variant}
            onClick={onConfirm}
            disabled={isSubmitting}
            data-testid="confirm-dialog-confirm"
          >
            {isSubmitting ? 'Processing...' : confirmLabel}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

