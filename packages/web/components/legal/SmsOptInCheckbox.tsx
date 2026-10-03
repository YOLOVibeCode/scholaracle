'use client';

import Link from 'next/link';
import { Label } from '@/components/ui/label';
import {
  SCHOLARMANCY_SMS_BRAND,
  SCHOLARMANCY_SMS_PURPOSE,
} from '@scholaracle/contracts';

export interface ISmsOptInCheckboxProps {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly disabled?: boolean;
  readonly id?: string;
}

/** Toll-free compliant SMS opt-in (unchecked by default; separate from terms). */
export function SmsOptInCheckbox({
  checked,
  onChange,
  disabled,
  id = 'smsConsent',
}: ISmsOptInCheckboxProps) {
  return (
    <div className="flex items-start gap-2">
      <input
        id={id}
        name={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="mt-1 h-4 w-4 rounded border-gray-300"
        data-testid="sms-consent-checkbox"
      />
      <Label htmlFor={id} className="text-sm font-normal cursor-pointer">
        Text me {SCHOLARMANCY_SMS_PURPOSE} from {SCHOLARMANCY_SMS_BRAND}. Message frequency varies.
        Message and data rates may apply. Reply STOP to opt out, HELP for help. Consent is not a
        condition of purchase. See our{' '}
        <Link href="/terms#sms" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
          SMS Terms
        </Link>{' '}
        and{' '}
        <Link href="/privacy" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
          Privacy Policy
        </Link>
        .
      </Label>
    </div>
  );
}
