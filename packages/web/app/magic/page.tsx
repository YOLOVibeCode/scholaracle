'use client';

/**
 * /magic?token=xxx — smart magic-link router.
 *
 * Desktop  → immediately redirects to /login?magic=<token> (existing web flow).
 * Mobile   → tries scholarmancy://magic?token=<token> (opens app if installed).
 *            After 1.5 s, if still on page, shows where to get the app, or the
 *            web sign-in when that phone has no app to get (lib/app-downloads).
 */

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  APP_DOWNLOADS,
  NO_APP_NOTE,
  PLATFORM_DEVICES,
  detectPhonePlatform,
  otherPlatform,
  type PhonePlatform,
} from '@/lib/app-downloads';

function phonePlatform(): PhonePlatform | null {
  if (typeof navigator === 'undefined') return null;
  return detectPhonePlatform(navigator.userAgent);
}

const PRIMARY_BUTTON =
  'inline-flex items-center rounded-xl bg-[#4f46e5] px-6 py-3 text-sm font-semibold text-white shadow hover:bg-[#4338ca] active:opacity-90';

interface IAppNotInstalledProps {
  readonly token: string;
  readonly platform: PhonePlatform;
}

/** Shown on a phone when the app did not open: get the app, or sign in on the web. */
function AppNotInstalled({ token, platform }: IAppNotInstalledProps): React.ReactElement {
  const download = APP_DOWNLOADS[platform];
  const other = otherPlatform(platform);
  const otherDownload = APP_DOWNLOADS[other];
  const webSignIn = `/login?magic=${encodeURIComponent(token)}`;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-[#f8f9fa] px-6 text-center">
      <div className="flex flex-col items-center gap-2">
        <div className="text-4xl">🎓</div>
        <h1 className="text-2xl font-bold text-gray-900">
          {download ? 'Get the Scholarmancy app' : 'Continue in your browser'}
        </h1>
        <p className="max-w-xs text-sm text-gray-600">
          {download
            ? 'Your login link is ready. Install the app to sign in and view your household.'
            : `Your login link is ready. ${NO_APP_NOTE[platform]}`}
        </p>
      </div>

      {download ? (
        <div className="flex flex-col items-center gap-2">
          <a href={download.url} className={PRIMARY_BUTTON} data-testid="link-magic-get-app">
            {download.label}
          </a>
          {download.hint && <p className="max-w-xs text-xs text-gray-500">{download.hint}</p>}
        </div>
      ) : (
        <Link href={webSignIn} className={PRIMARY_BUTTON} data-testid="link-magic-continue-web">
          Continue on the web
        </Link>
      )}

      {/* A phone can be misread; offer the other platform's app when it exists. */}
      {otherDownload && (
        <a
          href={otherDownload.url}
          className="text-xs text-gray-400 underline underline-offset-2"
          data-testid="link-magic-other-platform"
        >
          Also available on {PLATFORM_DEVICES[other].replace(/^an? /, '')}
        </a>
      )}

      <div className="mt-2 border-t border-gray-200 pt-4 text-sm text-gray-500">
        <p>Already have the app?</p>
        <button
          onClick={() => {
            window.location.href = `scholarmancy://magic?token=${encodeURIComponent(token)}`;
          }}
          className="mt-1 font-medium text-[#4f46e5] underline underline-offset-2"
          data-testid="button-magic-open-app"
        >
          Open in app
        </button>
      </div>

      {download && (
        <Link
          href={webSignIn}
          className="text-xs text-gray-400 underline underline-offset-2"
          data-testid="link-magic-continue-web"
        >
          Continue on web instead
        </Link>
      )}
    </div>
  );
}

function MagicRouter(): React.ReactElement {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token') ?? '';
  const [showInstall, setShowInstall] = useState(false);

  useEffect(() => {
    if (!token) {
      router.replace('/login');
      return;
    }

    if (phonePlatform() === null) {
      router.replace(`/login?magic=${encodeURIComponent(token)}`);
      return;
    }

    // Mobile: try the custom-scheme deep link first.
    const appUrl = `scholarmancy://magic?token=${encodeURIComponent(token)}`;
    window.location.href = appUrl;

    // If still here after 1.5 s the app isn't installed — show what to do next.
    // Never sign in on the web from here by itself: the link is single-use, and
    // the app may have opened and be using it.
    const timer = setTimeout(() => setShowInstall(true), 1500);
    return () => clearTimeout(timer);
  }, [token, router]);

  if (!showInstall) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8f9fa]">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#4f46e5] border-t-transparent" />
          <p className="text-sm text-muted-foreground">Opening Scholarmancy…</p>
        </div>
      </div>
    );
  }

  // The effect only gets here on a phone; `android` covers a phone we could not name.
  return <AppNotInstalled token={token} platform={phonePlatform() ?? 'android'} />;
}

const Spinner = (): React.ReactElement => (
  <div className="flex min-h-screen items-center justify-center bg-[#f8f9fa]">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#4f46e5] border-t-transparent" />
  </div>
);

export default function MagicPage(): React.ReactElement {
  return (
    <Suspense fallback={<Spinner />}>
      <MagicRouter />
    </Suspense>
  );
}
