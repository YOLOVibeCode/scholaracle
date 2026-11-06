'use client';

import { useMemo, useState, type JSX } from 'react';
import { Button } from '@/components/ui/button';

export interface IConnectOnPhonePanelProps {
  readonly studentId?: string;
}

function buildConnectDeepLink(studentId?: string): string {
  const base = 'scholarmancy://connect';
  if (!studentId?.trim()) return base;
  const params = new URLSearchParams({ studentId: studentId.trim() });
  return `${base}?${params.toString()}`;
}

export function ConnectOnPhonePanel({ studentId }: IConnectOnPhonePanelProps): JSX.Element {
  const [copied, setCopied] = useState(false);
  const href = useMemo(() => buildConnectDeepLink(studentId), [studentId]);
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(href)}`;

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-4 rounded-lg border bg-muted/30 p-4" data-testid="connect-on-phone-panel">
      <div className="text-center space-y-1">
        <p className="text-lg font-semibold">Connect from your phone</p>
        <p className="text-sm text-muted-foreground">
          Open the Scholarmancy app on your phone to finish connecting your school portal. Your login
          stays on your device.
        </p>
      </div>
      <div className="flex flex-col items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- external QR data URL service */}
        <img
          src={qrSrc}
          alt="QR code to open Scholarmancy on your phone"
          width={200}
          height={200}
          className="rounded-md border bg-white p-2"
          data-testid="connect-phone-qr"
        />
        <p className="text-xs font-mono break-all text-center text-muted-foreground px-1">{href}</p>
        <Button type="button" variant="outline" onClick={() => void handleCopy()} data-testid="button-copy-connect-link">
          {copied ? 'Copied' : 'Copy link'}
        </Button>
      </div>
    </div>
  );
}
