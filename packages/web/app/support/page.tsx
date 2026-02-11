import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const metadata = {
  title: 'Support | Scholaracle',
  description: 'Get help with Scholaracle - SMS, notifications, and account support.',
};

export default function SupportPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Support</CardTitle>
            <CardDescription>How can we help you?</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <section>
              <h2 className="text-lg font-semibold">SMS Text Messages</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Scholaracle can send text message alerts about assignments, deadlines, and grade changes.
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-6 text-sm text-gray-600 dark:text-gray-400">
                <li>
                  <strong>STOP</strong> — Unsubscribe from SMS. You will no longer receive text messages.
                </li>
                <li>
                  <strong>UNSTOP</strong> — Resubscribe to SMS if you previously opted out.
                </li>
                <li>
                  <strong>HELP</strong> — Receive this support information via text.
                </li>
              </ul>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                Message and data rates may apply. You can also manage notifications in your account settings.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold">Account &amp; Notifications</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Sign in to your account to update your profile, manage alert preferences, add or remove
                students, and change how you receive notifications (email, SMS, or both).
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold">Contact Us</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                For additional support, sign in and use the in-app help option, or email us at the address
                listed in your account.
              </p>
            </section>

            <div className="flex flex-wrap gap-4 pt-6">
              <Button asChild>
                <Link href="/login">Sign In</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/">Back to Home</Link>
              </Button>
            </div>

            <div className="border-t pt-6">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                <Link href="/privacy" className="hover:underline">Privacy Policy</Link>
                {' · '}
                <Link href="/terms" className="hover:underline">Terms of Service</Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
