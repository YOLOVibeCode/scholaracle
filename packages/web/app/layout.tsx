import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Providers } from './providers';
import { TrakletDevWidget } from '@/components/TrakletDevWidget';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: {
    default: 'Scholarmancy',
    template: '%s | Scholarmancy',
  },
  icons: {
    icon: '/favicon.png',
    apple: '/logo.png',
  },
  description:
    'AI-powered parenting assistant for academic success. Track grades, assignments, and deadlines across all your students in one place.',
  keywords: [
    'education',
    'grades',
    'assignments',
    'parenting',
    'student tracking',
    'LMS',
    'academic alerts',
  ],
  openGraph: {
    title: 'Scholarmancy',
    description:
      'Track your student\u2019s academic progress, get proactive alerts, and stay on top of assignments and deadlines.',
    siteName: 'Scholarmancy',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Scholarmancy',
    description: 'AI-powered parenting assistant for academic success.',
  },
  applicationName: 'Scholarmancy',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.ReactElement {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Providers>{children}</Providers>
        <TrakletDevWidget />
      </body>
    </html>
  );
}
