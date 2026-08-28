import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Get Scholarmancy',
  description: 'Download the Scholarmancy app for iPhone, iPad, and Android.',
};

const APP_STORE_URL = 'https://apps.apple.com/app/scholarmancy/id6798499288';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.scholarmancy.app';

export default function GetAppPage(): React.ReactElement {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-10 bg-[#f8f9fa] px-6 text-center">
      <div className="flex flex-col items-center gap-3">
        <div className="text-5xl">🎓</div>
        <h1 className="text-3xl font-bold text-gray-900">Scholarmancy</h1>
        <p className="max-w-sm text-base text-gray-600">
          Track grades, assignments, and class materials from your family&apos;s school portals —
          Canvas, Skyward, Aeries, and more.
        </p>
      </div>

      <div className="flex flex-col items-center gap-4">
        <a
          href={APP_STORE_URL}
          className="inline-flex items-center gap-2 rounded-xl bg-black px-6 py-3 text-sm font-semibold text-white shadow hover:bg-gray-900 active:opacity-90"
          aria-label="Download on the App Store"
        >
          <svg className="h-5 w-5 fill-current" viewBox="0 0 814 1000" xmlns="http://www.w3.org/2000/svg">
            <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-37.3-157.2-97.4C142.7 810 108 736 104.9 663.9c-4.2-96.7 16.9-195.3 68.2-267.8C218 328.7 287.8 281 363.7 275.4c84.8-7.1 141.9 57.4 189.7 57.4 49.7 0 129.1-63.1 226.5-63.1zm-122.9-180.9c-36.5 43.2-97.1 75.5-150.5 75.5-1.3 0-2.6 0-3.9-.1C508.5 165.6 541 94.9 568 60.6c32.3-40.5 93.8-72.8 152.3-72.8 1.2 0 2.4 0 3.5.1C721.3 73.5 696.3 143.3 665.2 160z" />
          </svg>
          Download on the App Store
        </a>

        <a
          href={PLAY_STORE_URL}
          className="inline-flex items-center gap-2 rounded-xl bg-[#01875f] px-6 py-3 text-sm font-semibold text-white shadow hover:bg-[#017a55] active:opacity-90"
          aria-label="Get it on Google Play"
        >
          <svg className="h-5 w-5 fill-current" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
            <path d="M325.3 234.3L104.6 13l280.8 161.2-60.1 60.1zM47 0C34 6.8 25.3 19.2 25.3 35.3v441.3c0 16.1 8.7 28.5 21.7 35.3l256.7-256L47 0zm425.7 225.8l-56.5-32.4-62.7 62.7 62.7 62.7 57.1-32.8c16.1-9.2 16.1-24.7-.6-60.2zM104.6 499l280.8-161.2-60.1-60.1L104.6 499z" />
          </svg>
          Get it on Google Play
        </a>
      </div>

      <p className="text-xs text-gray-400">
        Already signed up on the web?{' '}
        <Link href="/login" className="underline underline-offset-2">
          Sign in here
        </Link>
      </p>
    </div>
  );
}
