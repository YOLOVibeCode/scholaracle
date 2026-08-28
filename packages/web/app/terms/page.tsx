import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata = {
  title: 'Terms of Service | Scholarmancy',
  description: 'Scholarmancy terms of service and conditions of use.',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Terms of Service</CardTitle>
            <CardDescription>Last updated: August 27, 2026</CardDescription>
          </CardHeader>
          <CardContent className="prose prose-gray dark:prose-invert max-w-none space-y-6">
            <section>
              <h2 className="text-lg font-semibold">1. Acceptance of Terms</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                By accessing or using Scholarmancy (&quot;the Service&quot;), you agree to be bound by these Terms of Service.
                If you do not agree, do not use the Service.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold">2. Description of Service</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Scholarmancy is an AI-powered parenting assistant for academic success. The Service includes the
                Scholarmancy website, iOS app, and Android app. It helps parents track student progress, receive
                alerts about assignments and deadlines, and get personalized recommendations. Notifications may
                be delivered via email, push notification, and, if you opt in, via SMS text message.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold">3. Account and Registration</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                You must provide accurate information when creating an account. You may register with email and
                password or with Sign in with Apple, Google, or Microsoft. You are responsible for maintaining
                the security of your credentials. By registering, you represent that you are at least 18 years
                of age or have parental consent. You may delete your account at any time at{' '}
                <Link href="/delete-account" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
                  scholarmancy.com/delete-account
                </Link>
                .
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold">4. SMS Consent and Opt-In</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                If you opt in to receive SMS notifications, you consent to receive automated text messages from
                Scholarmancy at the phone number you provide. Message frequency depends on your alert settings.
                Standard message and data rates may apply. You may opt out at any time by replying STOP,
                UNSTOP to resubscribe, or HELP for assistance. Your carrier is not liable for delayed or
                undelivered messages.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold">5. Acceptable Use</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                You agree not to misuse the Service, including by circumventing security, scraping data without
                permission, or using the Service for unlawful purposes. We may suspend or terminate accounts that
                violate these terms.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold">6. Intellectual Property</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Scholarmancy and its content, features, and functionality are owned by us and are protected by
                copyright and other intellectual property laws.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold">7. Limitation of Liability</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                The Service is provided &quot;as is.&quot; We are not liable for indirect, incidental, or consequential
                damages. Our liability is limited to the amount you paid for the Service in the twelve months
                prior to the claim.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold">8. Changes</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                We may update these terms from time to time. Continued use of the Service after changes
                constitutes acceptance of the updated terms.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold">9. Contact</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                For questions about these terms, visit our{' '}
                <Link href="/support" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
                  support page
                </Link>
                .
              </p>
            </section>

            <div className="pt-6">
              <Link
                href="/"
                className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                ← Back to Scholarmancy
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
