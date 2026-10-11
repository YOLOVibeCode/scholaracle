import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  SCHOLARMANCY_SMS_SUPPORT_EMAIL,
  buildSmsOptInLabelHtml,
} from '@scholaracle/contracts';

export const metadata = {
  title: 'Text messages | Scholarmancy',
  description: 'What Scholarmancy texts, how to opt in, and how to stop.',
};

const linkClass = 'font-medium text-blue-600 hover:underline dark:text-blue-400';

export default function SmsProgramPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Text messages from Scholarmancy</CardTitle>
            <CardDescription data-testid="sms-operated-by">
              Scholarmancy is operated by Noctusoft, Inc. (
              <a href="https://noctusoft.com" className={linkClass}>
                https://noctusoft.com
              </a>
              )
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 text-sm text-gray-600 dark:text-gray-400">
            <section className="space-y-2">
              <p>
                Scholarmancy helps parents keep up with their students&apos; school work. Parents who opt in
                get grade and assignment alerts for their students and sign-in links for their account by
                text. Texts are optional: you can use Scholarmancy with email only. These are messages about
                your account and your students, not marketing.
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li>Every message starts with &quot;Scholarmancy:&quot;.</li>
                <li>Message frequency varies with your students&apos; grades and assignments.</li>
                <li>Message and data rates may apply.</li>
                <li>Reply STOP to opt out at any time, or HELP for help.</li>
                <li>
                  Support:{' '}
                  <a href={`mailto:${SCHOLARMANCY_SMS_SUPPORT_EMAIL}`} className={linkClass}>
                    {SCHOLARMANCY_SMS_SUPPORT_EMAIL}
                  </a>
                </li>
              </ul>
              <p>
                We do not share, sell, or provide your mobile phone number or SMS opt-in data to third
                parties or affiliates for marketing or promotional purposes.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">How to opt in</h2>
              <p>
                When you{' '}
                <Link href="/register" className={linkClass}>
                  create an account
                </Link>{' '}
                or open Settings, add your mobile number and check this box. It is never checked for you,
                and you can sign up without it:
              </p>
              <blockquote
                className="border-l-4 border-gray-300 pl-3 italic"
                data-testid="sms-consent-wording"
              >
                {buildSmsOptInLabelHtml()}
              </blockquote>
              <p>
                Co-parents and guardians: a parent who adds you to a student can share an opt-in link with
                you. Open it, enter your own mobile number, and check the same box. We never text a number
                that someone else entered until that person opts in themselves.
              </p>
            </section>

            <p>
              Full details:{' '}
              <Link href="/terms#sms" className={linkClass}>
                SMS Terms
              </Link>{' '}
              and{' '}
              <Link href="/privacy" className={linkClass}>
                Privacy Policy
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
