'use client';

/**
 * /magic?token=xxx — smart magic-link router.
 *
 * Desktop  → immediately redirects to /login?magic=<token> (existing web flow).
 * Mobile   → tries scholarmancy://magic?token=<token> (opens app if installed).
 *            After 1.5 s, if still on page, shows the install CTA.
 */

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

function isMobileBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
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

    if (!isMobileBrowser()) {
      router.replace(`/login?magic=${encodeURIComponent(token)}`);
      return;
    }

    // Mobile: try the custom-scheme deep link first.
    const appUrl = `scholarmancy://magic?token=${encodeURIComponent(token)}`;
    window.location.href = appUrl;

    // If still here after 1.5 s the app isn't installed — show install CTA.
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

  const appStoreUrl = 'https://apps.apple.com/app/scholarmancy/id6798499288';
  const playStoreUrl = 'https://play.google.com/store/apps/details?id=com.scholarmancy.app';
  const storeUrl = isIos() ? appStoreUrl : playStoreUrl;
  const storeLabel = isIos() ? 'Download on the App Store' : 'Get it on Google Play';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-[#f8f9fa] px-6 text-center">
      <div className="flex flex-col items-center gap-2">
        <div className="text-4xl">🎓</div>
        <h1 className="text-2xl font-bold text-gray-900">Get the Scholarmancy app</h1>
        <p className="max-w-xs text-sm text-gray-600">
          Your login link is ready. Install the app to sign in and view your household.
        </p>
      </div>

      <a
        href={storeUrl}
        className="inline-flex items-center rounded-xl bg-[#4f46e5] px-6 py-3 text-sm font-semibold text-white shadow hover:bg-[#4338ca] active:opacity-90"
      >
        {storeLabel}
      </a>

      {/* Show both store badges below on iOS so an Android user who gets here also has the Play link */}
      <div className="flex flex-col gap-2 text-xs text-gray-400">
        {isIos() ? (
          <a href={playStoreUrl} className="underline underline-offset-2">
            Also available on Android
          </a>
        ) : (
          <a href={appStoreUrl} className="underline underline-offset-2">
            Also available on iPhone and iPad
          </a>
        )}
      </div>

      <div className="mt-2 border-t border-gray-200 pt-4 text-sm text-gray-500">
        <p>Already have the app?</p>
        <button
          onClick={() => {
            window.location.href = `scholarmancy://magic?token=${encodeURIComponent(token)}`;
          }}
          className="mt-1 font-medium text-[#4f46e5] underline underline-offset-2"
        >
          Open in app
        </button>
      </div>

      <Link
        href={`/login?magic=${encodeURIComponent(token)}`}
        className="text-xs text-gray-400 underline underline-offset-2"
      >
        Continue on web instead
      </Link>
    </div>
  );
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
