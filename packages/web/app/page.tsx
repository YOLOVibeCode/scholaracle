'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  BellRing,
  BookOpen,
  Bot,
  Calendar,
  Check,
  ChevronRight,
  GraduationCap,
  LayoutDashboard,
  Lock,
  Mail,
  MessageSquare,
  PlugZap,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  Users,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { authApi } from '@/lib/api/auth';

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:2801/api';
const DEMO_EMAIL = 'demo@scholarmancy.com';
const DEMO_PASSWORD = 'DemoPass123!';

export default function HomePage() {
  const router = useRouter();
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState('');

  const handleExploreDemo = async () => {
    setDemoLoading(true);
    setDemoError('');
    try {
      const seedRes = await fetch(`${API_BASE}/seed/demo`, { method: 'POST' });
      const seedData = await seedRes.json().catch(() => ({}));
      if (!seedRes.ok) {
        setDemoError(seedData?.error ?? 'Failed to load demo');
        return;
      }
      const loginResult = await authApi.login(DEMO_EMAIL, DEMO_PASSWORD, true);
      if (!loginResult.success || !loginResult.token) {
        setDemoError(loginResult.error ?? 'Demo login failed');
        return;
      }
      router.push('/dashboard');
    } catch (e) {
      setDemoError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background" data-testid="marketing-home">
      <SiteNav onExploreDemo={handleExploreDemo} demoLoading={demoLoading} />
      <Hero onExploreDemo={handleExploreDemo} demoLoading={demoLoading} demoError={demoError} />
      <TrustBar />
      <ProblemSection />
      <FeaturesSection />
      <DashboardPreview />
      <HowItWorks />
      <UseCases />
      <PricingTease />
      <FaqSection />
      <FinalCta onExploreDemo={handleExploreDemo} demoLoading={demoLoading} />
      <Footer />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top navigation
// ---------------------------------------------------------------------------

function SiteNav({
  onExploreDemo,
  demoLoading,
}: {
  readonly onExploreDemo: () => void;
  readonly demoLoading: boolean;
}) {
  return (
    <header
      className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur"
      data-testid="site-nav"
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight" data-testid="nav-logo">
          <GraduationCap className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          <span>Scholarmancy</span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
          <a href="#features" className="transition-colors hover:text-foreground">Features</a>
          <a href="#how-it-works" className="transition-colors hover:text-foreground">How it works</a>
          <Link href="/pricing" className="transition-colors hover:text-foreground">Pricing</Link>
          <a href="#faq" className="transition-colors hover:text-foreground">FAQ</a>
        </nav>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link href="/login">Sign in</Link>
          </Button>
          <Button
            size="sm"
            onClick={onExploreDemo}
            disabled={demoLoading}
            data-testid="nav-try-demo"
          >
            {demoLoading ? 'Loading…' : 'Try the demo'}
          </Button>
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function Hero({
  onExploreDemo,
  demoLoading,
  demoError,
}: {
  readonly onExploreDemo: () => void;
  readonly demoLoading: boolean;
  readonly demoError: string;
}) {
  return (
    <section className="relative overflow-hidden border-b border-border/40" data-testid="hero">
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-blue-50 via-background to-purple-50 dark:from-blue-950/30 dark:via-background dark:to-purple-950/30" />
      <div
        aria-hidden
        className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl opacity-30"
      >
        <div
          className="relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-blue-400 to-purple-500"
          style={{
            clipPath:
              'polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)',
          }}
        />
      </div>

      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-20 md:py-28 lg:grid-cols-2 lg:py-32">
        <div className="space-y-7">
          <Badge
            variant="secondary"
            className="bg-blue-100 text-blue-800 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300"
            data-testid="hero-badge"
          >
            <Sparkles className="mr-1 h-3 w-3" />
            AI-powered parenting assistant
          </Badge>

          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
            Never miss a{' '}
            <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent dark:from-blue-400 dark:to-purple-400">
              grade drop
            </span>
            ,<br className="hidden sm:block" />
            assignment, or deadline.
          </h1>

          <p className="max-w-xl text-lg text-muted-foreground sm:text-xl">
            Connect Canvas, Skyward, or Aeries from your phone or browser. Grades, assignments,
            and alerts land in one dashboard — and we warn you before things slip.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="lg"
              onClick={onExploreDemo}
              disabled={demoLoading}
              data-testid="hero-explore-demo"
              className="text-base"
            >
              {demoLoading ? 'Loading demo…' : 'Try the demo'}
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
            <Button asChild size="lg" variant="outline" className="text-base">
              <Link href="/register" data-testid="hero-create-account">Create account</Link>
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">
            No credit card required · No signup for demo · Cancel anytime
          </p>

          {demoError && (
            <p className="text-sm text-red-600 dark:text-red-400" data-testid="hero-demo-error">
              {demoError}
            </p>
          )}
        </div>

        <HeroDashboardMockup />
      </div>
    </section>
  );
}

function HeroDashboardMockup() {
  return (
    <div className="relative lg:pl-8" data-testid="hero-mockup">
      <div className="relative rounded-xl border border-border/60 bg-card shadow-2xl">
        <div className="flex items-center gap-1.5 border-b border-border/60 px-3 py-2.5">
          <div className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
          <div className="h-2.5 w-2.5 rounded-full bg-yellow-400/80" />
          <div className="h-2.5 w-2.5 rounded-full bg-green-400/80" />
          <div className="ml-3 text-xs text-muted-foreground">scholarmancy.com/dashboard</div>
        </div>

        <div className="space-y-4 p-5">
          <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground">Good morning</div>
                <div className="text-lg font-semibold">Emma&apos;s Week</div>
              </div>
            <Badge variant="outline" className="text-xs">3 alerts</Badge>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <MiniStat label="GPA" value="3.7" trend="+0.1" trendUp />
            <MiniStat label="Missing" value="2" trend="↑" trendUp={false} />
            <MiniStat label="Due soon" value="5" trend="this wk" trendUp />
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Today&apos;s alerts
            </div>
            <AlertRow
              icon={<AlertTriangle className="h-4 w-4 text-orange-500" />}
              title="Algebra II — quiz grade dropped"
              meta="92% → 78%"
              tone="warn"
            />
            <AlertRow
              icon={<BellRing className="h-4 w-4 text-red-500" />}
              title="Biology lab report — missing"
              meta="Due Mon, was -10%"
              tone="alert"
            />
            <AlertRow
              icon={<Calendar className="h-4 w-4 text-blue-500" />}
              title="History essay due Friday"
              meta="3 days · not started"
              tone="info"
            />
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute -bottom-4 -left-4 hidden h-32 w-32 rounded-2xl bg-blue-500/20 blur-2xl md:block" />
      <div className="pointer-events-none absolute -right-4 -top-4 hidden h-32 w-32 rounded-2xl bg-purple-500/20 blur-2xl md:block" />
    </div>
  );
}

function MiniStat({
  label,
  value,
  trend,
  trendUp,
}: {
  readonly label: string;
  readonly value: string;
  readonly trend: string;
  readonly trendUp: boolean;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-background/50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className="text-lg font-semibold">{value}</span>
        <span
          className={
            trendUp
              ? 'text-[10px] text-green-600 dark:text-green-400'
              : 'text-[10px] text-orange-600 dark:text-orange-400'
          }
        >
          {trend}
        </span>
      </div>
    </div>
  );
}

function AlertRow({
  icon,
  title,
  meta,
  tone,
}: {
  readonly icon: React.ReactNode;
  readonly title: string;
  readonly meta: string;
  readonly tone: 'alert' | 'warn' | 'info';
}) {
  const toneClass =
    tone === 'alert'
      ? 'border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30'
      : tone === 'warn'
        ? 'border-orange-200 bg-orange-50 dark:border-orange-900/50 dark:bg-orange-950/30'
        : 'border-blue-200 bg-blue-50 dark:border-blue-900/50 dark:bg-blue-950/30';
  return (
    <div className={`flex items-center gap-2.5 rounded-md border px-3 py-2 ${toneClass}`}>
      {icon}
      <div className="flex-1">
        <div className="text-xs font-medium text-foreground">{title}</div>
        <div className="text-[11px] text-muted-foreground">{meta}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trust bar
// ---------------------------------------------------------------------------

function TrustBar() {
  return (
    <section
      className="border-b border-border/40 bg-muted/30 py-10"
      data-testid="trust-bar"
    >
      <div className="mx-auto max-w-5xl px-4 text-center">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Works with the school portals you already use
        </p>
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <PortalBadge name="Canvas LMS" />
          <PortalBadge name="Aeries SIS" />
          <PortalBadge name="Skyward" />
          <PortalBadge name="+ Custom (AI)" />
        </div>
      </div>
    </section>
  );
}

function PortalBadge({ name }: { readonly name: string }) {
  return (
    <div className="flex items-center justify-center rounded-md border border-border/60 bg-background px-4 py-3 text-sm font-medium text-foreground/80">
      {name}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Problem
// ---------------------------------------------------------------------------

function ProblemSection() {
  return (
    <section className="border-b border-border/40 py-20" data-testid="problem">
      <div className="mx-auto max-w-5xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Sound familiar?</h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Every parent of a school-age kid has been here.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          <PainPoint
            icon={<TrendingDown className="h-6 w-6 text-red-500" />}
            title="Grades dropped overnight"
            body="You only find out at the parent-teacher conference. By then, it&apos;s too late to course-correct."
          />
          <PainPoint
            icon={<AlertTriangle className="h-6 w-6 text-orange-500" />}
            title="Missing assignments pile up"
            body="Late penalties, zeros, and weekend cram sessions — all because nobody saw it coming."
          />
          <PainPoint
            icon={<LayoutDashboard className="h-6 w-6 text-blue-500" />}
            title="Drowning in school portals"
            body="Canvas, Aeries, Skyward, the district app, the teacher&apos;s blog… all with different logins and updates."
          />
        </div>
      </div>
    </section>
  );
}

function PainPoint({
  icon,
  title,
  body,
}: {
  readonly icon: React.ReactNode;
  readonly title: string;
  readonly body: string;
}) {
  return (
    <Card className="border-border/60">
      <CardContent className="space-y-3 pt-0">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
          {icon}
        </div>
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{body}</p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------

function FeaturesSection() {
  return (
    <section id="features" className="border-b border-border/40 py-20" data-testid="features">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <Badge variant="outline" className="mb-4">Features</Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Everything parents need, in one place.
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Stop juggling tabs. Sync from your device, then see what matters in one place.
          </p>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <FeatureCard
            icon={<LayoutDashboard className="h-5 w-5" />}
            tint="blue"
            title="Unified dashboard"
            body="Grades, assignments, attendance, and announcements from every portal in one place — without logging into each school site every day."
          />
          <FeatureCard
            icon={<BellRing className="h-5 w-5" />}
            tint="orange"
            title="Proactive alerts"
            body="Email and SMS notifications the moment something needs attention. Customize by severity, student, and channel."
          />
          <FeatureCard
            icon={<Bot className="h-5 w-5" />}
            tint="purple"
            title="AI insights"
            body="Spot patterns before they become problems. &ldquo;Emma&apos;s math grades dip every Thursday&rdquo; — now you know."
          />
          <FeatureCard
            icon={<Users className="h-5 w-5" />}
            tint="green"
            title="Multi-student, multi-parent"
            body="Track up to 5 students per family. Co-parents and step-parents get their own logins and notification settings."
          />
          <FeatureCard
            icon={<ShieldCheck className="h-5 w-5" />}
            tint="cyan"
            title="Privacy-first"
            body="School credentials stay on your device. Only normalized academic data is uploaded — never your passwords."
          />
          <FeatureCard
            icon={<PlugZap className="h-5 w-5" />}
            tint="pink"
            title="Works with any portal"
            body="Canvas, Aeries, and Skyward are built-in. Got a custom district portal? Our AI generates a scraper for it."
          />
        </div>
      </div>
    </section>
  );
}

function FeatureCard({
  icon,
  tint,
  title,
  body,
}: {
  readonly icon: React.ReactNode;
  readonly tint: 'blue' | 'orange' | 'purple' | 'green' | 'cyan' | 'pink';
  readonly title: string;
  readonly body: string;
}) {
  const tintMap: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
    orange: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
    purple: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
    green: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
    cyan: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300',
    pink: 'bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300',
  };
  return (
    <Card className="border-border/60 transition-all hover:border-border hover:shadow-md">
      <CardHeader>
        <div className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${tintMap[tint]}`}>
          {icon}
        </div>
        <CardTitle className="mt-3 text-lg">{title}</CardTitle>
        <CardDescription className="text-sm leading-relaxed">{body}</CardDescription>
      </CardHeader>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Larger dashboard preview
// ---------------------------------------------------------------------------

function DashboardPreview() {
  return (
    <section className="border-b border-border/40 bg-muted/30 py-20" data-testid="preview">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <Badge variant="outline" className="mb-4">The dashboard</Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            One screen. Everything you need.
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            From a 30-second morning check-in to a deep dive on a slipping grade.
          </p>
        </div>

        <div className="mt-12 rounded-xl border border-border/60 bg-card p-5 shadow-xl">
          <div className="grid gap-5 lg:grid-cols-3">
            <PreviewPanel
              title="Today&apos;s agenda"
              subtitle="Across all students"
              icon={<Calendar className="h-4 w-4 text-blue-500" />}
            >
              <AgendaItem name="Algebra II quiz" who="Emma · 1st period" />
              <AgendaItem name="Spelling test" who="Liam · 9:30 AM" />
              <AgendaItem name="Soccer practice" who="Emma · 4:00 PM" />
              <AgendaItem name="History essay due" who="Emma · 11:59 PM" alert />
            </PreviewPanel>

            <PreviewPanel
              title="Grade trends"
              subtitle="Last 30 days"
              icon={<TrendingDown className="h-4 w-4 text-orange-500" />}
            >
              <GradeRow course="Algebra II" grade="B+" delta="-3%" down />
              <GradeRow course="Biology" grade="A-" delta="+1%" />
              <GradeRow course="History" grade="A" delta="±0" />
              <GradeRow course="Spanish III" grade="B" delta="-1%" down />
            </PreviewPanel>

            <PreviewPanel
              title="AI insights"
              subtitle="Patterns spotted"
              icon={<Bot className="h-4 w-4 text-purple-500" />}
            >
              <InsightRow
                text="Emma&apos;s math quiz grades drop on weeks with weekend tournaments. Consider a Thursday review session."
              />
              <InsightRow
                text="Liam&apos;s spelling test scores correlate with sleep — &lt;7hrs = avg 12% lower."
              />
              <InsightRow
                text="History essay has been &ldquo;not started&rdquo; for 4 days. Suggest a check-in tonight."
              />
            </PreviewPanel>
          </div>
        </div>
      </div>
    </section>
  );
}

function PreviewPanel({
  title,
  subtitle,
  icon,
  children,
}: {
  readonly title: string;
  readonly subtitle: string;
  readonly icon: React.ReactNode;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-background p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted">{icon}</div>
        <div>
          <div
            className="text-sm font-semibold"
            dangerouslySetInnerHTML={{ __html: title }}
          />
          <div className="text-[11px] text-muted-foreground">{subtitle}</div>
        </div>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function AgendaItem({
  name,
  who,
  alert,
}: {
  readonly name: string;
  readonly who: string;
  readonly alert?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border/40 bg-muted/30 px-3 py-2">
      <div>
        <div className="text-xs font-medium">{name}</div>
        <div className="text-[11px] text-muted-foreground">{who}</div>
      </div>
      {alert && (
        <Badge variant="outline" className="border-red-500/40 text-[10px] text-red-600 dark:text-red-400">
          Due today
        </Badge>
      )}
    </div>
  );
}

function GradeRow({
  course,
  grade,
  delta,
  down,
}: {
  readonly course: string;
  readonly grade: string;
  readonly delta: string;
  readonly down?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border/40 bg-muted/30 px-3 py-2">
      <div className="text-xs font-medium">{course}</div>
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold">{grade}</span>
        <span
          className={
            down
              ? 'text-[10px] text-orange-600 dark:text-orange-400'
              : 'text-[10px] text-green-600 dark:text-green-400'
          }
        >
          {delta}
        </span>
      </div>
    </div>
  );
}

function InsightRow({ text }: { readonly text: string }) {
  return (
    <div className="rounded-md border border-purple-200/60 bg-purple-50 px-3 py-2 dark:border-purple-900/40 dark:bg-purple-950/20">
      <p
        className="text-[11px] leading-relaxed text-foreground/80"
        dangerouslySetInnerHTML={{ __html: text }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// How it works
// ---------------------------------------------------------------------------

function HowItWorks() {
  return (
    <section id="how-it-works" className="border-b border-border/40 py-20" data-testid="how-it-works">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <Badge variant="outline" className="mb-4">How it works</Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Set up in under 2 minutes.
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            No IT background needed. No school approval needed.
          </p>
        </div>

        <div className="mt-14 grid gap-8 md:grid-cols-3">
          <Step
            num="1"
            icon={<BookOpen className="h-5 w-5" />}
            title="Create your account"
            body="Sign up with email. Add each student you want to track. Free for the first student."
          />
          <Step
            num="2"
            icon={<PlugZap className="h-5 w-5" />}
            title="Connect your school"
            body="In the iOS or Android app (or the Chrome extension), pick Canvas, Aeries, or Skyward and sign in on your device. Those passwords never leave it."
          />
          <Step
            num="3"
            icon={<BellRing className="h-5 w-5" />}
            title="Get alerts that matter"
            body="Choose email, SMS, or both. Set thresholds. Then go live your life — we&apos;ll ping you when something needs attention."
          />
        </div>
      </div>
    </section>
  );
}

function Step({
  num,
  icon,
  title,
  body,
}: {
  readonly num: string;
  readonly icon: React.ReactNode;
  readonly title: string;
  readonly body: string;
}) {
  return (
    <div className="relative">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-purple-600 text-sm font-bold text-white">
          {num}
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted">{icon}</div>
      </div>
      <h3 className="mb-2 text-lg font-semibold">{title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Use cases
// ---------------------------------------------------------------------------

function UseCases() {
  return (
    <section className="border-b border-border/40 bg-muted/30 py-20" data-testid="use-cases">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <Badge variant="outline" className="mb-4">Who it&apos;s for</Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Built for every kind of family.
          </h2>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          <UseCaseCard
            tag="One student"
            title="The Busy Parent"
            body="Single working parent. One kid in middle school. Wants peace of mind that nothing slips through the cracks."
            features={['Email + SMS alerts', 'Daily summary', 'Free to start']}
          />
          <UseCaseCard
            tag="Multiple kids"
            title="The Family CEO"
            body="Two parents, three kids, three different schools. Needs one place to see everything and split parenting duties."
            features={['Up to 5 students', 'Co-parent logins', 'Per-student rules']}
            featured
          />
          <UseCaseCard
            tag="DIY parent"
            title="The Tech-Savvy Parent"
            body="Prefers the local CLI or Chrome extension. Generates a custom scraper when the district portal isn&apos;t Canvas, Skyward, or Aeries."
            features={['Local CLI on your machine', 'Chrome extension', 'Custom scraper generator']}
          />
        </div>
      </div>
    </section>
  );
}

function UseCaseCard({
  tag,
  title,
  body,
  features,
  featured,
}: {
  readonly tag: string;
  readonly title: string;
  readonly body: string;
  readonly features: readonly string[];
  readonly featured?: boolean;
}) {
  return (
    <Card
      className={
        featured
          ? 'relative border-2 border-blue-500 shadow-lg dark:border-blue-400'
          : 'border-border/60'
      }
    >
      {featured && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge className="bg-blue-600 text-white hover:bg-blue-600">Most common</Badge>
        </div>
      )}
      <CardHeader>
        <Badge variant="secondary" className="w-fit text-[10px]">{tag}</Badge>
        <CardTitle className="mt-2 text-xl">{title}</CardTitle>
        <CardDescription className="leading-relaxed">{body}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {features.map((f) => (
          <div key={f} className="flex items-center gap-2 text-sm">
            <Check className="h-4 w-4 text-green-500" />
            <span>{f}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Pricing tease
// ---------------------------------------------------------------------------

function PricingTease() {
  return (
    <section className="border-b border-border/40 py-20" data-testid="pricing-tease">
      <div className="mx-auto max-w-5xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <Badge variant="outline" className="mb-4">Pricing</Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Simple pricing. $9.99 per student.
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Start free with one student. One bill — the primary parent pays.
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-4xl gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <MiniPlan name="Free" price="$0" caption="1 student · 7-day history" />
          <MiniPlan name="Starter" price="$9.99" caption="1 student · all features" highlight />
          <MiniPlan name="Premium" price="$19.99" caption="2 students" />
          <MiniPlan name="Family" price="$49.99" caption="5 students" />
        </div>

        <div className="mt-10 flex justify-center">
          <Button asChild variant="outline" size="lg">
            <Link href="/pricing" data-testid="pricing-tease-cta">
              See full pricing
              <ChevronRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

function MiniPlan({
  name,
  price,
  caption,
  highlight,
}: {
  readonly name: string;
  readonly price: string;
  readonly caption: string;
  readonly highlight?: boolean;
}) {
  return (
    <div
      className={
        highlight
          ? 'rounded-xl border-2 border-blue-500 bg-card p-5 text-center shadow-md dark:border-blue-400'
          : 'rounded-xl border border-border/60 bg-card p-5 text-center'
      }
    >
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {name}
      </div>
      <div className="mt-2 text-3xl font-bold">
        {price}
        {price !== '$0' && <span className="text-sm font-normal text-muted-foreground">/mo</span>}
      </div>
      <div className="mt-2 text-xs text-muted-foreground">{caption}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FAQ
// ---------------------------------------------------------------------------

function FaqSection() {
  return (
    <section id="faq" className="border-b border-border/40 bg-muted/30 py-20" data-testid="faq">
      <div className="mx-auto max-w-3xl px-4">
        <div className="text-center">
          <Badge variant="outline" className="mb-4">FAQ</Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Common questions
          </h2>
        </div>

        <div className="mt-12 space-y-4">
          <FaqItem
            question="Is it safe? Where do my child&apos;s school passwords live?"
            answer="On your device. Period. Scholarmancy runs the data collection locally — your school portal credentials never leave your machine. Only normalized academic data (grades, assignment names, dates) is uploaded to Scholarmancy."
          />
          <FaqItem
            question="What schools and portals do you support?"
            answer="Out of the box: Canvas LMS, Aeries SIS, and Skyward — which together cover most U.S. K-12 and college students. For other portals, our AI scraper generator can build a custom integration in a few minutes."
          />
          <FaqItem
            question="How often does my data refresh?"
            answer="Whenever you sync from the iOS or Android app, the Chrome extension, or the local CLI. Scholarmancy servers never log into your school. On a computer you can schedule the CLI yourself (for example with cron)."
          />
          <FaqItem
            question="Can both parents have access?"
            answer="Yes. Each student can have multiple parent/guardian accounts. Co-parents and step-parents get their own logins and notification preferences."
          />
          <FaqItem
            question="Do you store my school passwords?"
            answer="No. Portal usernames and passwords stay in your device keychain or browser extension storage. Only academic records (grades, assignments, attendance) are uploaded so we can show the dashboard and send alerts. Delete your account anytime and that data is removed."
          />
          <FaqItem
            question="Can I cancel anytime?"
            answer="Yes. Cancel anytime from your dashboard. You keep access through the end of your billing period, and we never auto-charge if your card fails."
          />
        </div>
      </div>
    </section>
  );
}

function FaqItem({
  question,
  answer,
}: {
  readonly question: string;
  readonly answer: string;
}) {
  return (
    <details className="group rounded-lg border border-border/60 bg-card transition-all open:shadow-md">
      <summary className="flex cursor-pointer items-center justify-between gap-4 px-5 py-4 text-sm font-medium">
        <span dangerouslySetInnerHTML={{ __html: question }} />
        <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" />
      </summary>
      <div className="border-t border-border/60 px-5 py-4 text-sm leading-relaxed text-muted-foreground">
        {answer}
      </div>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Final CTA
// ---------------------------------------------------------------------------

function FinalCta({
  onExploreDemo,
  demoLoading,
}: {
  readonly onExploreDemo: () => void;
  readonly demoLoading: boolean;
}) {
  return (
    <section className="relative overflow-hidden border-b border-border/40 py-24" data-testid="final-cta">
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-blue-600 to-purple-700" />
      <div className="mx-auto max-w-3xl px-4 text-center text-white">
        <Zap className="mx-auto mb-5 h-10 w-10 opacity-90" />
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Ready to stop chasing grades?
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg text-white/90">
          Try the live demo in one click. No signup, no credit card, no commitment.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button
            size="lg"
            variant="secondary"
            onClick={onExploreDemo}
            disabled={demoLoading}
            className="bg-white text-blue-700 hover:bg-white/90"
            data-testid="final-cta-demo"
          >
            {demoLoading ? 'Loading demo…' : 'Try the demo'}
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
          >
            <Link href="/register" data-testid="final-cta-register">Create free account</Link>
          </Button>
        </div>
        <div className="mt-6 rounded-lg border border-white/20 bg-white/10 px-5 py-4 text-left text-sm">
          <p className="mb-2 font-semibold text-white/90">Demo logins</p>
          <div className="space-y-1 text-white/75">
            <p>
              <span className="font-medium text-white">Parent (Sarah):</span>{' '}
              <span className="font-mono">{DEMO_EMAIL}</span> /{' '}
              <span className="font-mono">{DEMO_PASSWORD}</span>
            </p>
            <p>
              <span className="font-medium text-white">Student Emma:</span>{' '}
              <span className="font-mono">emma.demo@scholarmancy.com</span> /{' '}
              <span className="font-mono">{DEMO_PASSWORD}</span>
            </p>
            <p>
              <span className="font-medium text-white">Student Liam:</span>{' '}
              <span className="font-mono">liam.demo@scholarmancy.com</span> /{' '}
              <span className="font-mono">{DEMO_PASSWORD}</span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

function Footer() {
  return (
    <footer className="bg-background py-12" data-testid="footer">
      <div className="mx-auto max-w-6xl px-4">
        <div className="grid gap-8 md:grid-cols-4">
          <div className="space-y-3">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <GraduationCap className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <span>Scholarmancy</span>
            </Link>
            <p className="text-sm text-muted-foreground">
              AI-powered parenting assistant for academic success.
            </p>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-semibold">Product</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href="#features" className="hover:text-foreground">Features</a></li>
              <li><a href="#how-it-works" className="hover:text-foreground">How it works</a></li>
              <li><Link href="/pricing" className="hover:text-foreground">Pricing</Link></li>
              <li><a href="#faq" className="hover:text-foreground">FAQ</a></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-semibold">Account</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/login" className="hover:text-foreground">Sign in</Link></li>
              <li><Link href="/register" className="hover:text-foreground">Create account</Link></li>
              <li><Link href="/forgot-password" className="hover:text-foreground">Forgot password</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-semibold">Legal</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/privacy" className="hover:text-foreground">Privacy</Link></li>
              <li><Link href="/terms" className="hover:text-foreground">Terms</Link></li>
              <li><Link href="/support" className="hover:text-foreground">Support</Link></li>
              <li><Link href="/delete-account" className="hover:text-foreground">Delete account</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-border/40 pt-6 text-sm text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2">
            <Lock className="h-3.5 w-3.5" />
            <span>Your school passwords stay on your device.</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" />
              <span>support@scholarmancy.com</span>
            </span>
            <span className="flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" />
              <span>Built with care</span>
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
