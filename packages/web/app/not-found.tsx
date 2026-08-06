import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
      <h1 className="text-6xl font-bold text-gray-300 dark:text-gray-700">404</h1>
      <h2 className="mt-4 text-xl font-semibold text-gray-900 dark:text-gray-100">
        Page not found
      </h2>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Back to Scholarmancy
      </Link>
    </div>
  );
}
