import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata = {
  title: 'Privacy Policy | Scholarmancy',
  description: 'Scholarmancy privacy policy — how we collect, use, and protect your data.',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Privacy Policy</CardTitle>
            <CardDescription>Last updated: August 6, 2026</CardDescription>
          </CardHeader>
          <CardContent className="prose prose-gray dark:prose-invert max-w-none space-y-6">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Scholarmancy (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;) is operated by NoctuSoft, Inc.
              This policy explains what information we collect, how we use it, and your rights regarding it.
              It applies to the Scholarmancy iOS app and the Scholarmancy web platform.
            </p>

            <section>
              <h2 className="text-lg font-semibold">1. Information We Collect</h2>

              <h3 className="text-base font-semibold mt-4">a) Account Information</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                When you create a Scholarmancy account we collect your email address and a hashed password
                to authenticate you. If you opt in to SMS notifications, we also collect your phone number.
              </p>

              <h3 className="text-base font-semibold mt-4">b) School Portal Credentials (iOS App)</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Your school portal username and password are stored <strong>exclusively on your device</strong> using
                iOS Secure Enclave / Keychain. They are <strong>never transmitted to Scholarmancy servers</strong> and
                are never shared with any third party. Removing the app or deleting your account erases them permanently
                from your device.
              </p>

              <h3 className="text-base font-semibold mt-4">c) Academic Data</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                When you trigger a sync, the Scholarmancy app reads your academic data (assignments, grades,
                attendance records, and course information) directly from your school&apos;s portal. This data is
                transmitted to Scholarmancy servers solely to display it back to you and to send you notifications.
                We do not sell, license, or share this data with advertisers or third parties.
              </p>

              <h3 className="text-base font-semibold mt-4">d) Device Identifiers and Push Tokens</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                We collect your device&apos;s push notification token to deliver sync-complete and assignment alerts.
                This token is associated with your account and is never used for advertising.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold">2. How We Use Your Information</h2>
              <ul className="text-sm text-gray-600 dark:text-gray-400 list-disc list-inside space-y-1">
                <li>Authenticate you and secure your account</li>
                <li>Display your academic data within the app and web dashboard</li>
                <li>Send push notifications and, if opted in, SMS alerts</li>
                <li>Maintain sync history logs</li>
                <li>Improve reliability and performance of the service</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold">3. SMS Text Messaging</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                By opting in to SMS notifications, you consent to receive text messages from Scholarmancy at the
                phone number you provide. Message frequency varies based on your alert preferences. Standard
                message and data rates may apply. You can opt out at any time by replying STOP to any message,
                or by updating your notification preferences in your account settings. Reply HELP for support.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold">4. Data Security</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                All data in transit is encrypted via TLS 1.2+. School portal credentials never leave your device.
                Scholarmancy account passwords are hashed with bcrypt before storage. We do not sell your personal
                information.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold">5. Children&apos;s Privacy</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Scholarmancy is intended for use by parents and students aged 13 and older. We do not knowingly
                collect personal information from children under 13. If you believe a child under 13 has provided
                us personal information, contact us and we will delete it promptly.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold">6. Data Retention</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Academic data is retained while your account is active. You may delete your account at any time
                by contacting{' '}
                <Link href="mailto:support@scholarmancy.com" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
                  support@scholarmancy.com
                </Link>
                , which will permanently delete all associated data within 30 days.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold">7. Your Rights</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Depending on your jurisdiction you may have rights to access, correct, or delete your personal data.
                Contact us at{' '}
                <Link href="mailto:privacy@scholarmancy.com" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
                  privacy@scholarmancy.com
                </Link>{' '}
                to exercise these rights.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold">8. Cookies and Tracking</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                We use essential cookies to maintain your session and preferences on the web platform.
                We may use analytics to improve our service.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold">9. Third-Party Services</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Scholarmancy uses Expo Application Services (EAS) for building and delivering the iOS app,
                and Apple Push Notification Service (APNs) for push notifications. These services have their
                own privacy policies.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold">10. Changes to This Policy</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                We may update this policy from time to time. The &ldquo;Last updated&rdquo; date at the top reflects
                the most recent revision. Continued use of the app or service after changes constitutes acceptance.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold">11. Contact Us</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                NoctuSoft, Inc.<br />
                Email:{' '}
                <Link href="mailto:privacy@scholarmancy.com" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
                  privacy@scholarmancy.com
                </Link>
                <br />
                Website:{' '}
                <Link href="https://scholarmancy.com" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
                  https://scholarmancy.com
                </Link>
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
