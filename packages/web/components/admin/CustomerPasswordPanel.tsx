/**
 * CustomerPasswordPanel — admin actions: set password, send reset link, force reset on next login.
 */

'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface ICustomerPasswordPanelProps {
  readonly isSetPasswordOpen: boolean;
  readonly password: string;
  readonly passwordConfirm: string;
  readonly isSubmitting: boolean;
  readonly onOpenSetPassword: () => void;
  readonly onCloseSetPassword: () => void;
  readonly onPasswordChange: (value: string) => void;
  readonly onPasswordConfirmChange: (value: string) => void;
  readonly onSetPasswordSubmit: () => void;
  readonly onSendReset: () => void;
  readonly onForceReset: () => void;
  readonly isSendingReset: boolean;
  readonly isForcingReset: boolean;
}

export function CustomerPasswordPanel({
  isSetPasswordOpen,
  password,
  passwordConfirm,
  isSubmitting,
  onOpenSetPassword,
  onCloseSetPassword,
  onPasswordChange,
  onPasswordConfirmChange,
  onSetPasswordSubmit,
  onSendReset,
  onForceReset,
  isSendingReset,
  isForcingReset,
}: ICustomerPasswordPanelProps) {
  const canSubmitSetPassword =
    password.length >= 8 && password === passwordConfirm && !isSubmitting;

  return (
    <Card data-testid="password-panel">
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <CardDescription>
          Set password directly, send a reset link, or require the customer to change it on next login.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenSetPassword}
            disabled={isSubmitting}
            data-testid="button-set-password"
          >
            Set password
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onSendReset}
            disabled={isSendingReset}
            data-testid="button-send-reset"
          >
            {isSendingReset ? 'Sending…' : 'Send reset link'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onForceReset}
            disabled={isForcingReset}
            data-testid="button-force-reset"
          >
            {isForcingReset ? 'Applying…' : 'Force reset on next login'}
          </Button>
        </div>

        {isSetPasswordOpen && (
          <div className="space-y-4 rounded-md border p-4" data-testid="set-password-form">
            <div className="space-y-2">
              <Label htmlFor="admin-set-password">New password (min 8 characters)</Label>
              <Input
                id="admin-set-password"
                type="password"
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
                placeholder="New password"
                disabled={isSubmitting}
                data-testid="input-set-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-set-password-confirm">Confirm password</Label>
              <Input
                id="admin-set-password-confirm"
                type="password"
                value={passwordConfirm}
                onChange={(e) => onPasswordConfirmChange(e.target.value)}
                placeholder="Confirm password"
                disabled={isSubmitting}
                data-testid="input-set-password-confirm"
              />
            </div>
            {password.length > 0 && password.length < 8 && (
              <p className="text-sm text-amber-600 dark:text-amber-400">Password must be at least 8 characters.</p>
            )}
            {password !== passwordConfirm && passwordConfirm.length > 0 && (
              <p className="text-sm text-amber-600 dark:text-amber-400">Passwords do not match.</p>
            )}
            <div className="flex gap-2">
              <Button
                onClick={onSetPasswordSubmit}
                disabled={!canSubmitSetPassword}
                data-testid="button-confirm-set-password"
              >
                {isSubmitting ? 'Setting…' : 'Set password'}
              </Button>
              <Button variant="outline" onClick={onCloseSetPassword} disabled={isSubmitting} data-testid="button-cancel-set-password">
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
