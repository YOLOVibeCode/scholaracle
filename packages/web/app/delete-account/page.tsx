import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const metadata = {
  title: 'Delete Account | Scholarmancy',
  description: 'How to delete your Scholarmancy account and associated data.',
};

export default function DeleteAccountPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Delete your account</CardTitle>
            <CardDescription>
              App Store Guideline 5.1.1 — account deletion initiated by you, completed within 30 days.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              You can request deletion of your Scholarmancy account at any time. We permanently remove your
              login, household data, synced academic records, push tokens, and linked Apple / Google /
              Microsoft sign-in within 30 days.
            </p>

            <section>
              <h2 className="text-lg font-semibold">From the iOS or Android app</h2>
              <ol className="mt-2 list-decimal space-y-1 pl-6 text-sm text-gray-600 dark:text-gray-400">
                <li>Open Scholarmancy and sign in.</li>
                <li>Go to Settings.</li>
                <li>Tap Delete account and confirm.</li>
              </ol>
            </section>

            <section>
              <h2 className="text-lg font-semibold">By email</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Email{' '}
                <Link
                  href="mailto:privacy@scholarmancy.com?subject=Delete%20my%20Scholarmancy%20account"
                  className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                >
                  privacy@scholarmancy.com
                </Link>{' '}
                from the address on the account. Include “Delete my Scholarmancy account” in the subject.
                We will confirm and complete deletion within 30 days.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold">What is not deleted</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                School portal usernames and passwords never leave your device. Uninstalling the app erases
                them from that device. We cannot delete data that only exists in your school’s portal.
              </p>
            </section>

            <div className="flex flex-wrap gap-4 pt-2">
              <Button asChild>
                <Link href="mailto:privacy@scholarmancy.com?subject=Delete%20my%20Scholarmancy%20account">
                  Email deletion request
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/privacy">Privacy Policy</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
