import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata = {
  title: 'Privacy Policy | Scholaracle',
  description: 'Scholaracle privacy policy - how we collect, use, and protect your data.',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Privacy Policy</CardTitle>
            <CardDescription>Last updated: February 2026</CardDescription>
          </CardHeader>
          <CardContent className="prose prose-gray dark:prose-invert max-w-none space-y-6">
            <section>
              <h2 className="text-lg font-semibold">1. Information We Collect</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                We collect information you provide directly: name, email address, password (stored encrypted),
                and student data you add (names, grades, assignments, school information). If you opt in to
                SMS notifications, we collect your phone number.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold">2. How We Use Your Information</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                We use your information to provide the Scholaracle service: academic tracking, alerts about
                assignments and deadlines, grade change notifications, and AI-powered insights. We send
                notifications via email and, if you opt in, via SMS text message to the phone number you provide.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold">3. SMS Text Messaging</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                By opting in to SMS notifications, you consent to receive text messages from Scholaracle at the
                phone number you provide. Message frequency varies based on your alert preferences. Standard
                message and data rates may apply. You can opt out at any time by replying STOP to any message,
                or by updating your notification preferences in your account settings. Reply HELP for support.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold">4. Data Security</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                We use industry-standard security measures to protect your data, including encryption in transit
                and at rest. We do not sell your personal information.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold">5. Data Retention</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                We retain your data for as long as your account is active. You may request deletion of your
                account and associated data at any time through your account settings or by contacting us.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold">6. Cookies and Tracking</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                We use essential cookies to maintain your session and preferences. We may use analytics to
                improve our service.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold">7. Contact Us</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                For privacy-related questions, contact us at{' '}
                <Link href="/support" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
                  our support page
                </Link>
                .
              </p>
            </section>

            <div className="pt-6">
              <Link
                href="/"
                className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                ← Back to Scholaracle
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
