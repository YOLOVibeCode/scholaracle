'use client';

import { useMemo, useState, type JSX } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { qrPicture } from '@/lib/qr/qrPicture';

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
  // Drawn here, not fetched: the link holds the student's id and must not go to an image service.
  const qr = useMemo(() => qrPicture(href), [href]);

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
        <p className="text-sm text-muted-foreground">
          Don&apos;t have the app yet?{' '}
          <Link
            href="/get-app"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline underline-offset-2"
            data-testid="link-get-app"
          >
            Get the app
          </Link>
        </p>
      </div>
      <div className="flex flex-col items-center gap-3">
        <svg
          role="img"
          aria-label="QR code to open Scholarmancy on your phone"
          viewBox={`0 0 ${qr.size} ${qr.size}`}
          width={200}
          height={200}
          shapeRendering="crispEdges"
          className="rounded-md border"
          data-testid="connect-phone-qr"
        >
          {/* Black on white in every theme: a camera cannot read a code on a dark card. */}
          <rect width={qr.size} height={qr.size} fill="#ffffff" />
          <path d={qr.path} fill="#000000" />
        </svg>
        <p className="text-xs font-mono break-all text-center text-muted-foreground px-1">{href}</p>
        <Button type="button" variant="outline" onClick={() => void handleCopy()} data-testid="button-copy-connect-link">
          {copied ? 'Copied' : 'Copy link'}
        </Button>
      </div>
    </div>
  );
}
