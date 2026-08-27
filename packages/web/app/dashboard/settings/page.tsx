'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Save, Monitor, Link2, Unlink, History, Mail, MessageSquare, CheckCircle, XCircle, Clock, Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { settingsApi, type IUserSettingsResponse, type INotificationHistoryItem, type IDigestSlotApi } from '@/lib/api/settings';
import { EditDigestSlotDialog } from '@/components/settings/EditDigestSlotDialog';
import { StudentLoginsSection } from '@/components/settings/StudentLoginsSection';

const ALERT_TYPE_KEYS = [
  'missing_assignment',
  'deadline',
  'grade_drop',
  'test',
  'workload',
  'positive',
  'recommendation',
] as const;

export default function SettingsPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const [pushNotifications, setPushNotifications] = useState(true);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [smsNotifications, setSmsNotifications] = useState(false);

  const [quietHoursEnabled, setQuietHoursEnabled] = useState(true);
  const [quietHoursStart, setQuietHoursStart] = useState('22:00');
  const [quietHoursEnd, setQuietHoursEnd] = useState('07:00');
  const [quietHoursCriticalOverride, setQuietHoursCriticalOverride] = useState(true);

  const [dailyDigestEnabled, setDailyDigestEnabled] = useState(true);
  const [dailyDigestTime, setDailyDigestTime] = useState('07:00');
  const [weeklyDigestEnabled, setWeeklyDigestEnabled] = useState(true);
  const [weeklyDigestDay, setWeeklyDigestDay] = useState('sunday');
  const [weeklyDigestTime, setWeeklyDigestTime] = useState('18:00');
  const [weekdaySlots, setWeekdaySlots] = useState<IDigestSlotApi[]>([]);
  const [weekendSlots, setWeekendSlots] = useState<IDigestSlotApi[]>([]);
  const [schoolDays, setSchoolDays] = useState<string[]>(['mon', 'tue', 'wed', 'thu', 'fri']);
  const [holidayMode, setHolidayMode] = useState<'normal' | 'pause' | 'reduced'>('normal');
  const [digestTab, setDigestTab] = useState<'weekday' | 'weekend'>('weekday');
  const [editSlot, setEditSlot] = useState<{ group: 'weekday' | 'weekend'; index: number } | null>(null);
  const [autoSend, setAutoSend] = useState(true);
  const [digestRecipients, setDigestRecipients] = useState<'everybody' | 'nobody' | 'specific'>('everybody');
  const [specificRecipients, setSpecificRecipients] = useState<string[]>([]);
  const [snoozeUntil, setSnoozeUntil] = useState<string | null>(null);
  const [snoozeInput, setSnoozeInput] = useState('');

  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [glanceEnabled, setGlanceEnabled] = useState(true);
  const [glanceTime, setGlanceTime] = useState('07:00');

  const [tone, setTone] = useState<'formal' | 'casual' | 'encouraging'>('encouraging');
  const [frequency, setFrequency] = useState<'minimal' | 'balanced' | 'proactive'>('balanced');

  const [gradeDrop, setGradeDrop] = useState(5);
  const [daysBeforeDeadline, setDaysBeforeDeadline] = useState(2);
  const [lowGradeThreshold, setLowGradeThreshold] = useState(80);

  const [prioritizeHighImpact, setPrioritizeHighImpact] = useState(true);
  const [emphasizeWeakSubjects, setEmphasizeWeakSubjects] = useState(true);
  const [celebrateWins, setCelebrateWins] = useState(true);

  const [enabledTypes, setEnabledTypes] = useState<Record<string, { enabled: boolean; severity: string }>>({});

  const [oauthProviders, setOauthProviders] = useState<string[]>([]);
  const [unlinkingProvider, setUnlinkingProvider] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [notificationHistory, setNotificationHistory] = useState<INotificationHistoryItem[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const s = (await settingsApi.get()) as IUserSettingsResponse;
        if (s.profile) {
          setName(s.profile.name ?? '');
          setEmail(s.profile.email ?? '');
          setOauthProviders([...(s.profile.oauthProviders ?? [])]);
        }
        setPushNotifications(s.notifications.push);
        setEmailNotifications(s.notifications.email);
        setSmsNotifications(s.notifications.sms);
        setQuietHoursEnabled(s.notifications.quietHours?.enabled ?? true);
        setQuietHoursStart(s.notifications.quietHours?.start ?? '22:00');
        setQuietHoursEnd(s.notifications.quietHours?.end ?? '07:00');
        setQuietHoursCriticalOverride(s.notifications.quietHours?.criticalOverride ?? true);
        setDailyDigestEnabled(s.notifications.digestSchedule?.daily?.enabled ?? true);
        setDailyDigestTime(s.notifications.digestSchedule?.daily?.time ?? '07:00');
        setWeeklyDigestEnabled(s.notifications.digestSchedule?.weekly?.enabled ?? true);
        setWeeklyDigestDay(s.notifications.digestSchedule?.weekly?.day ?? 'sunday');
        setWeeklyDigestTime(s.notifications.digestSchedule?.weekly?.time ?? '18:00');
        const defaultWeekday = [
          { time: '09:00', label: 'Morning', enabled: true },
          { time: '15:00', label: 'Afternoon', enabled: true },
          { time: '20:00', label: 'Evening', enabled: true },
        ];
        setWeekdaySlots(
          (s.notifications.digestSchedule?.weekdaySlots?.length ?? 0) > 0
            ? [...(s.notifications.digestSchedule?.weekdaySlots ?? [])]
            : defaultWeekday
        );
        setWeekendSlots([...(s.notifications.digestSchedule?.weekendSlots ?? [])]);
        setSchoolDays([...(s.notifications.digestSchedule?.schoolDays ?? ['mon', 'tue', 'wed', 'thu', 'fri'])]);
        setHolidayMode((s.notifications.digestSchedule?.holidayMode as 'normal' | 'pause' | 'reduced') ?? 'normal');
        setAutoSend(s.notifications.digestSchedule?.autoSend ?? true);
        setDigestRecipients((s.notifications.digestSchedule?.recipients as 'everybody' | 'nobody' | 'specific') ?? 'everybody');
        setSpecificRecipients([...(s.notifications.digestSchedule?.specificRecipients ?? [])]);
        setSnoozeUntil(s.notifications.digestSchedule?.snoozeUntil ?? null);
        setTimezone(s.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
        setGlanceEnabled(s.notifications.glanceSchedule?.enabled ?? true);
        setGlanceTime(s.notifications.glanceSchedule?.time ?? '07:00');
        setTone((s.notifications.tone as 'formal' | 'casual' | 'encouraging') ?? 'encouraging');
        setFrequency((s.notifications.frequency as 'minimal' | 'balanced' | 'proactive') ?? 'balanced');
        setGradeDrop(s.alerts.gradeDrop);
        setDaysBeforeDeadline(s.alerts.daysBeforeDeadline);
        setLowGradeThreshold(s.alerts.lowGradeThreshold);
        setPrioritizeHighImpact(s.alerts.prioritizeHighImpact ?? true);
        setEmphasizeWeakSubjects(s.alerts.emphasizeWeakSubjects ?? true);
        setCelebrateWins(s.alerts.celebrateWins ?? true);
        if (s.alerts.enabledTypes) setEnabledTypes(s.alerts.enabledTypes as Record<string, { enabled: boolean; severity: string }>);
        settingsApi.getNotificationHistory().then(setNotificationHistory).catch(() => {});
      } catch {
        // fallback handled by api
      } finally {
        setIsLoaded(true);
      }
    })();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setToast(null);

    const ok = await settingsApi.update({
      timezone,
      notifications: {
        push: pushNotifications,
        email: emailNotifications,
        sms: smsNotifications,
        quietHours: {
          enabled: quietHoursEnabled,
          start: quietHoursStart,
          end: quietHoursEnd,
          criticalOverride: quietHoursCriticalOverride,
        },
        digestSchedule: {
          daily: { enabled: dailyDigestEnabled, time: dailyDigestTime },
          weekly: { enabled: weeklyDigestEnabled, day: weeklyDigestDay, time: weeklyDigestTime },
          weekdaySlots,
          weekendSlots,
          schoolDays,
          holidayMode,
          autoSend,
          recipients: digestRecipients,
          specificRecipients,
          snoozeUntil,
        },
        glanceSchedule: { enabled: glanceEnabled, time: glanceTime },
        tone,
        frequency,
      },
      alerts: {
        gradeDrop,
        daysBeforeDeadline,
        lowGradeThreshold,
        prioritizeHighImpact,
        emphasizeWeakSubjects,
        celebrateWins,
        enabledTypes: Object.keys(enabledTypes).length > 0 ? enabledTypes : undefined,
      },
    });

    setIsSaving(false);
    setToast(ok ? 'Saved' : 'Failed to save');
  };

  const setAlertType = (key: string, enabled: boolean, severity: string) => {
    setEnabledTypes((prev) => ({
      ...prev,
      [key]: { enabled, severity },
    }));
  };

  return (
    <div className="space-y-6" data-testid="dashboard-settings-page">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-gray-600 dark:text-gray-400">Manage your account preferences</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            Active sessions
          </CardTitle>
          <CardDescription>
            View and revoke sessions on other devices.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button variant="outline" asChild>
            <Link href="/dashboard/settings/sessions" data-testid="link-sessions">
              Manage sessions
            </Link>
          </Button>
        </CardFooter>
      </Card>

      <StudentLoginsSection />

      {oauthProviders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Linked accounts
            </CardTitle>
            <CardDescription>
              Sign-in methods linked to your account. You can unlink a provider if you have more than one.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {oauthProviders.map((provider) => (
              <div
                key={provider}
                className="flex items-center justify-between rounded-md border p-3"
                data-testid={`linked-${provider}`}
              >
                <span className="capitalize">{provider}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={oauthProviders.length <= 1 || unlinkingProvider !== null}
                  onClick={async () => {
                    setUnlinkingProvider(provider);
                    const result = await settingsApi.unlinkOAuth(provider);
                    setUnlinkingProvider(null);
                    if (result.success) {
                      setOauthProviders((prev) => prev.filter((p) => p !== provider));
                      setToast('Provider unlinked');
                    } else {
                      setToast(result.error ?? 'Failed to unlink');
                    }
                  }}
                  data-testid={`unlink-${provider}`}
                >
                  <Unlink className="mr-1 h-4 w-4" />
                  {unlinkingProvider === provider ? 'Unlinking...' : 'Unlink'}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <form onSubmit={handleSubmit} data-testid="settings-form">
        {isLoaded && <span data-testid="settings-loaded" className="hidden" />}
        {toast && (
          <div role="alert" data-testid="toast" className="rounded-md border p-3 text-sm">
            {toast}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Update your account information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="profile-name">Name</Label>
              <Input
                id="profile-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                data-testid="settings-profile-name"
                disabled={isSaving || !isLoaded}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-email">Email</Label>
              <Input
                id="profile-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid="settings-profile-email"
                disabled={isSaving || !isLoaded}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-phone">Phone</Label>
              <Input
                id="profile-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                data-testid="settings-profile-phone"
                disabled={isSaving || !isLoaded}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>Configure how you receive notifications</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="notify-push">Push Notifications</Label>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Receive push notifications on your devices (coming soon)
                </p>
              </div>
              <input
                id="notify-push"
                name="notify-push"
                data-testid="toggle-push"
                type="checkbox"
                checked={pushNotifications}
                onChange={(e) => setPushNotifications(e.target.checked)}
                disabled
                aria-label="Push notifications (coming soon)"
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="notify-email">Email Notifications</Label>
                <p className="text-sm text-gray-600 dark:text-gray-400">Receive notifications via email</p>
              </div>
              <input
                id="notify-email"
                name="notify-email"
                data-testid="toggle-email"
                type="checkbox"
                checked={emailNotifications}
                onChange={(e) => setEmailNotifications(e.target.checked)}
                disabled={isSaving || !isLoaded}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="notify-sms">SMS Notifications</Label>
                <p className="text-sm text-gray-600 dark:text-gray-400">Receive notifications via SMS</p>
              </div>
              <input
                id="notify-sms"
                name="notify-sms"
                data-testid="toggle-sms"
                type="checkbox"
                checked={smsNotifications}
                onChange={(e) => setSmsNotifications(e.target.checked)}
                disabled={isSaving || !isLoaded}
              />
            </div>

            <div className="border-t pt-4 space-y-4">
              <h4 className="font-medium">Quiet Hours</h4>
              <div className="flex items-center justify-between">
                <Label htmlFor="quiet-hours-enabled">Do Not Disturb</Label>
                <Switch
                  id="quiet-hours-enabled"
                  checked={quietHoursEnabled}
                  onCheckedChange={setQuietHoursEnabled}
                  disabled={isSaving || !isLoaded}
                />
              </div>
              {quietHoursEnabled && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="quiet-start">From</Label>
                    <Input
                      id="quiet-start"
                      type="time"
                      value={quietHoursStart}
                      onChange={(e) => setQuietHoursStart(e.target.value)}
                      disabled={isSaving || !isLoaded}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quiet-end">To</Label>
                    <Input
                      id="quiet-end"
                      type="time"
                      value={quietHoursEnd}
                      onChange={(e) => setQuietHoursEnd(e.target.value)}
                      disabled={isSaving || !isLoaded}
                    />
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2">
                <input
                  id="quiet-critical"
                  type="checkbox"
                  checked={quietHoursCriticalOverride}
                  onChange={(e) => setQuietHoursCriticalOverride(e.target.checked)}
                  disabled={isSaving || !isLoaded}
                />
                <Label htmlFor="quiet-critical">Allow critical alerts to override quiet hours</Label>
              </div>
            </div>

            <div className="border-t pt-4 space-y-4">
              <h4 className="font-medium">Digest Delivery</h4>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="auto-send">Auto-Send Digests</Label>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Automatically send digest emails on schedule.
                  </p>
                </div>
                <Switch
                  id="auto-send"
                  checked={autoSend}
                  onCheckedChange={setAutoSend}
                  disabled={isSaving || !isLoaded}
                />
              </div>
              {!autoSend && (
                <p className="text-sm text-muted-foreground">
                  Digests will only be sent when you manually trigger them from a student&apos;s page.
                </p>
              )}

              <div className="space-y-3">
                <Label>Who receives digests?</Label>
                {(['everybody', 'nobody', 'specific'] as const).map((opt) => (
                  <div key={opt} className="flex items-center gap-2">
                    <input
                      type="radio"
                      id={`recipients-${opt}`}
                      name="digest-recipients"
                      value={opt}
                      checked={digestRecipients === opt}
                      onChange={() => setDigestRecipients(opt)}
                      disabled={isSaving || !isLoaded}
                    />
                    <Label htmlFor={`recipients-${opt}`} className="font-normal">
                      {opt === 'everybody'
                        ? 'Everybody (all linked parents/guardians)'
                        : opt === 'nobody'
                          ? 'Nobody (pause all recipients)'
                          : 'Specific people only'}
                    </Label>
                  </div>
                ))}
                {digestRecipients === 'specific' && (
                  <div className="ml-6 space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Enter email addresses (one per line) that should receive digest emails.
                    </p>
                    <textarea
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      rows={3}
                      placeholder="parent@example.com&#10;guardian@example.com"
                      value={specificRecipients.join('\n')}
                      onChange={(e) =>
                        setSpecificRecipients(
                          e.target.value
                            .split('\n')
                            .map((s) => s.trim())
                            .filter(Boolean)
                        )
                      }
                      disabled={isSaving || !isLoaded}
                    />
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <Label>Snooze Digests</Label>
                {snoozeUntil ? (
                  <div className="flex items-center gap-3">
                    <p className="text-sm">
                      Snoozed until{' '}
                      <span className="font-medium">
                        {new Date(snoozeUntil + 'T00:00:00').toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </span>
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSnoozeUntil(null)}
                      disabled={isSaving || !isLoaded}
                    >
                      Cancel Snooze
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Pause all digest emails until a specific date.
                    </p>
                    <div className="flex items-center gap-2">
                      <Input
                        type="date"
                        value={snoozeInput}
                        onChange={(e) => setSnoozeInput(e.target.value)}
                        min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
                        className="w-48"
                        disabled={isSaving || !isLoaded}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (snoozeInput) setSnoozeUntil(snoozeInput);
                        }}
                        disabled={isSaving || !isLoaded || !snoozeInput}
                      >
                        Snooze
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      {[
                        { label: '1 week', days: 7 },
                        { label: '2 weeks', days: 14 },
                        { label: '1 month', days: 30 },
                      ].map((opt) => (
                        <Button
                          key={opt.label}
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const d = new Date();
                            d.setDate(d.getDate() + opt.days);
                            setSnoozeUntil(d.toISOString().slice(0, 10));
                          }}
                          disabled={isSaving || !isLoaded}
                        >
                          {opt.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t pt-4 space-y-4">
              <h4 className="font-medium">Timezone</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                All email times use your local timezone.
              </p>
              <select
                data-testid="select-timezone"
                className="w-full rounded-md border px-3 py-2 text-sm bg-background"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                disabled={isSaving || !isLoaded}
              >
                {Intl.supportedValuesOf('timeZone').map((tz) => (
                  <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>

            <div className="border-t pt-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <h4 className="font-medium">Student at a Glance</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Daily per-student snapshot with grades, missing work, and upcoming deadlines.
                  </p>
                </div>
                <Switch
                  id="glance-enabled"
                  data-testid="toggle-glance"
                  checked={glanceEnabled}
                  onCheckedChange={setGlanceEnabled}
                  disabled={isSaving || !isLoaded}
                />
              </div>
              {glanceEnabled && (
                <div className="flex items-center gap-3">
                  <Label htmlFor="glance-time" className="text-sm whitespace-nowrap">Send at</Label>
                  <Input
                    id="glance-time"
                    data-testid="input-glance-time"
                    type="time"
                    value={glanceTime}
                    onChange={(e) => setGlanceTime(e.target.value)}
                    disabled={isSaving || !isLoaded}
                    className="w-32"
                  />
                  <span className="text-xs text-gray-500 dark:text-gray-400">(your local time)</span>
                </div>
              )}
            </div>

            <div className={`border-t pt-4 space-y-4${!autoSend ? ' opacity-50' : ''}`}>
              <h4 className="font-medium">Alert Digest Schedule</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Sends only when there are new alerts. School days vs weekend can have different times.
              </p>

              <div className="flex gap-2 border-b">
                <button
                  type="button"
                  onClick={() => setDigestTab('weekday')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    digestTab === 'weekday'
                      ? 'border-green-500 text-green-700 dark:text-green-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
                  }`}
                  data-testid="digest-tab-weekday"
                >
                  School Days
                </button>
                <button
                  type="button"
                  onClick={() => setDigestTab('weekend')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    digestTab === 'weekend'
                      ? 'border-green-500 text-green-700 dark:text-green-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
                  }`}
                  data-testid="digest-tab-weekend"
                >
                  Weekend
                </button>
              </div>

              {digestTab === 'weekday' && (
                <div className="flex flex-wrap gap-3 items-center">
                  {weekdaySlots.map((slot, index) => {
                    const [h, m] = slot.time.split(':').map(Number);
                    const displayTime = h === 0 ? '12:' + String(m).padStart(2, '0') + ' AM' : h < 12 ? `${h}:${String(m).padStart(2, '0')} AM` : h === 12 ? '12:' + String(m).padStart(2, '0') + ' PM' : `${h - 12}:${String(m).padStart(2, '0')} PM`;
                    return (
                      <div key={`wd-${index}-${slot.time}`} className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={isSaving || !isLoaded}
                          onClick={() => {
                            setWeekdaySlots((prev) =>
                              prev.map((s, i) => (i === index ? { ...s, enabled: !s.enabled } : s))
                            );
                          }}
                          className={`flex flex-col items-center rounded-lg border-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                            slot.enabled
                              ? 'border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-900/30 dark:text-green-300'
                              : 'border-gray-200 bg-white text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400'
                          }`}
                          data-testid={`digest-weekday-${slot.time}`}
                        >
                          <span className="text-base font-semibold">{displayTime}</span>
                          <span className="text-xs opacity-75">{slot.label}</span>
                        </button>
                        <button
                          type="button"
                          aria-label="Edit time"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditSlot({ group: 'weekday', index });
                          }}
                          disabled={isSaving || !isLoaded}
                          className="p-2 rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                          data-testid={`edit-weekday-${index}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        {weekdaySlots.length > 1 && (
                          <button
                            type="button"
                            aria-label="Remove slot"
                            onClick={() => setWeekdaySlots((prev) => prev.filter((_, i) => i !== index))}
                            disabled={isSaving || !isLoaded}
                            className="p-2 rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                          >
                            <XCircle className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {weekdaySlots.length < 10 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setWeekdaySlots((prev) => [...prev, { time: '12:00', label: 'Custom', enabled: true }])}
                      disabled={isSaving || !isLoaded}
                      data-testid="add-weekday-slot"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add time
                    </Button>
                  )}
                </div>
              )}

              {digestTab === 'weekend' && (
                <div className="flex flex-wrap gap-3 items-center">
                  {weekendSlots.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">No weekend digest times. Add one if you want digests on weekends.</p>
                  ) : (
                    weekendSlots.map((slot, index) => {
                      const [h, m] = slot.time.split(':').map(Number);
                      const displayTime = h === 0 ? '12:' + String(m).padStart(2, '0') + ' AM' : h < 12 ? `${h}:${String(m).padStart(2, '0')} AM` : h === 12 ? '12:' + String(m).padStart(2, '0') + ' PM' : `${h - 12}:${String(m).padStart(2, '0')} PM`;
                      return (
                        <div key={`we-${index}-${slot.time}`} className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={isSaving || !isLoaded}
                            onClick={() => {
                              setWeekendSlots((prev) =>
                                prev.map((s, i) => (i === index ? { ...s, enabled: !s.enabled } : s))
                              );
                            }}
                            className={`flex flex-col items-center rounded-lg border-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                              slot.enabled
                                ? 'border-green-500 bg-green-50 text-green-700 dark:border-green-400 dark:bg-green-900/30 dark:text-green-300'
                                : 'border-gray-200 bg-white text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400'
                            }`}
                            data-testid={`digest-weekend-${slot.time}`}
                          >
                            <span className="text-base font-semibold">{displayTime}</span>
                            <span className="text-xs opacity-75">{slot.label}</span>
                          </button>
                          <button
                            type="button"
                            aria-label="Edit time"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditSlot({ group: 'weekend', index });
                            }}
                            disabled={isSaving || !isLoaded}
                            className="p-2 rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                            data-testid={`edit-weekend-${index}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            aria-label="Remove slot"
                            onClick={() => setWeekendSlots((prev) => prev.filter((_, i) => i !== index))}
                            disabled={isSaving || !isLoaded}
                            className="p-2 rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                          >
                            <XCircle className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })
                  )}
                  {weekendSlots.length < 10 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setWeekendSlots((prev) => [...prev, { time: '10:00', label: 'Weekend', enabled: true }])}
                      disabled={isSaving || !isLoaded}
                      data-testid="add-weekend-slot"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add time
                    </Button>
                  )}
                </div>
              )}

              {editSlot && (editSlot.group === 'weekday' ? weekdaySlots[editSlot.index] : weekendSlots[editSlot.index]) && (
                <EditDigestSlotDialog
                  open={!!editSlot}
                  onOpenChange={(open) => !open && setEditSlot(null)}
                  slot={
                    editSlot.group === 'weekday'
                      ? weekdaySlots[editSlot.index]!
                      : weekendSlots[editSlot.index]!
                  }
                  onSave={(updated) => {
                    if (editSlot.group === 'weekday') {
                      setWeekdaySlots((prev) => prev.map((s, i) => (i === editSlot.index ? updated : s)));
                    } else {
                      setWeekendSlots((prev) => prev.map((s, i) => (i === editSlot.index ? updated : s)));
                    }
                    setEditSlot(null);
                  }}
                  onRemove={
                    editSlot.group === 'weekend'
                      ? () => {
                          setWeekendSlots((prev) => prev.filter((_, i) => i !== editSlot.index));
                          setEditSlot(null);
                        }
                      : editSlot.group === 'weekday' && weekdaySlots.length > 1
                        ? () => {
                            setWeekdaySlots((prev) => prev.filter((_, i) => i !== editSlot.index));
                            setEditSlot(null);
                          }
                        : undefined
                  }
                  allowRemove={editSlot.group === 'weekend' || (editSlot.group === 'weekday' && weekdaySlots.length > 1)}
                />
              )}

              <div className="border-t pt-4 space-y-3">
                <h5 className="text-sm font-medium text-gray-500 dark:text-gray-400">Holidays</h5>
                <div className="flex flex-wrap items-center gap-4">
                  <Label htmlFor="holiday-mode">During school holidays</Label>
                  <select
                    id="holiday-mode"
                    value={holidayMode}
                    onChange={(e) => setHolidayMode(e.target.value as 'normal' | 'pause' | 'reduced')}
                    disabled={isSaving || !isLoaded}
                    className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                    data-testid="holiday-mode"
                  >
                    <option value="normal">Normal (send digests as usual)</option>
                    <option value="pause">Pause (no digests during breaks)</option>
                    <option value="reduced">Reduced (only critical alerts)</option>
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void settingsApi.suggestHolidays().then((r) => r && setToast(r.suggestion))}
                    disabled={isSaving || !isLoaded}
                    data-testid="ai-suggest-holidays"
                  >
                    AI Suggest
                  </Button>
                </div>
              </div>

              <div className="border-t pt-4 space-y-3">
                <h5 className="text-sm font-medium text-gray-500 dark:text-gray-400">Advanced</h5>
                <div className="flex items-center justify-between">
                  <Label>Custom Daily Digest</Label>
                  <Switch checked={dailyDigestEnabled} onCheckedChange={setDailyDigestEnabled} disabled={isSaving || !isLoaded} />
                </div>
                {dailyDigestEnabled && (
                  <div className="space-y-2">
                    <Label htmlFor="daily-time">Send at</Label>
                    <Input
                      id="daily-time"
                      type="time"
                      value={dailyDigestTime}
                      onChange={(e) => setDailyDigestTime(e.target.value)}
                      disabled={isSaving || !isLoaded}
                    />
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between">
                <Label>Weekly Digest</Label>
                <Switch checked={weeklyDigestEnabled} onCheckedChange={setWeeklyDigestEnabled} disabled={isSaving || !isLoaded} />
              </div>
              {weeklyDigestEnabled && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="weekly-day">Day</Label>
                    <select
                      id="weekly-day"
                      value={weeklyDigestDay}
                      onChange={(e) => setWeeklyDigestDay(e.target.value)}
                      disabled={isSaving || !isLoaded}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                    >
                      {['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].map((d) => (
                        <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="weekly-time">Time</Label>
                    <Input
                      id="weekly-time"
                      type="time"
                      value={weeklyDigestTime}
                      onChange={(e) => setWeeklyDigestTime(e.target.value)}
                      disabled={isSaving || !isLoaded}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="border-t pt-4 space-y-4">
              <h4 className="font-medium">Communication Style</h4>
              <div className="space-y-2">
                <Label>Tone</Label>
                <div className="flex gap-4">
                  {(['formal', 'casual', 'encouraging'] as const).map((t) => (
                    <label key={t} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="tone"
                        value={t}
                        checked={tone === t}
                        onChange={() => setTone(t)}
                        disabled={isSaving || !isLoaded}
                      />
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Frequency</Label>
                <div className="flex gap-4">
                  {(['minimal', 'balanced', 'proactive'] as const).map((f) => (
                    <label key={f} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="frequency"
                        value={f}
                        checked={frequency === f}
                        onChange={() => setFrequency(f)}
                        disabled={isSaving || !isLoaded}
                      />
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </label>
                  ))}
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Balanced: important updates without overwhelm
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="threshold-settings">
          <CardHeader>
            <CardTitle>Alert Rules</CardTitle>
            <CardDescription>Control when alerts are generated and how they are delivered</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <h4 className="font-medium">Thresholds</h4>
              <div className="space-y-2">
                <Label htmlFor="gradeDrop">Grade Drop Threshold</Label>
                <Input
                  id="gradeDrop"
                  type="number"
                  min={1}
                  max={100}
                  value={gradeDrop}
                  onChange={(e) => setGradeDrop(Number(e.target.value))}
                  data-testid="input-grade-drop-threshold"
                  disabled={isSaving || !isLoaded}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="daysBeforeDeadline">Days Before Deadline</Label>
                <Input
                  id="daysBeforeDeadline"
                  type="number"
                  min={0}
                  max={30}
                  value={daysBeforeDeadline}
                  onChange={(e) => setDaysBeforeDeadline(Number(e.target.value))}
                  data-testid="days-before-deadline"
                  disabled={isSaving || !isLoaded}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lowGradeThreshold">Low Grade Threshold</Label>
                <Input
                  id="lowGradeThreshold"
                  type="number"
                  min={0}
                  max={100}
                  value={lowGradeThreshold}
                  onChange={(e) => setLowGradeThreshold(Number(e.target.value))}
                  data-testid="low-grade-threshold"
                  disabled={isSaving || !isLoaded}
                />
              </div>
            </div>

            <div className="border-t pt-4 space-y-2">
              <h4 className="font-medium">Alert Types</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">Which alerts do you want to receive?</p>
              <div className="space-y-2">
                {ALERT_TYPE_KEYS.map((key) => {
                  const val = enabledTypes[key] ?? { enabled: true, severity: 'info' };
                  return (
                    <div key={key} className="flex items-center gap-4">
                      <input
                        id={`alert-${key}`}
                        type="checkbox"
                        checked={val.enabled}
                        onChange={(e) => setAlertType(key, e.target.checked, val.severity)}
                        disabled={isSaving || !isLoaded}
                      />
                      <Label htmlFor={`alert-${key}`} className="capitalize">{key.replace('_', ' ')}</Label>
                      <select
                        value={val.severity}
                        onChange={(e) => setAlertType(key, val.enabled, e.target.value)}
                        disabled={isSaving || !isLoaded}
                        className="flex h-8 rounded-md border border-input bg-transparent px-2 text-sm"
                      >
                        <option value="critical">Critical</option>
                        <option value="warning">Warning</option>
                        <option value="info">Info</option>
                        <option value="positive">Positive</option>
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="border-t pt-4 space-y-4">
              <h4 className="font-medium">Smart Behavior</h4>
              <div className="flex items-center gap-2">
                <input
                  id="prioritize-high"
                  type="checkbox"
                  checked={prioritizeHighImpact}
                  onChange={(e) => setPrioritizeHighImpact(e.target.checked)}
                  disabled={isSaving || !isLoaded}
                />
                <Label htmlFor="prioritize-high">Prioritize high-impact alerts (grade drops, missed deadlines first)</Label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="emphasize-weak"
                  type="checkbox"
                  checked={emphasizeWeakSubjects}
                  onChange={(e) => setEmphasizeWeakSubjects(e.target.checked)}
                  disabled={isSaving || !isLoaded}
                />
                <Label htmlFor="emphasize-weak">Emphasize weak subjects (more updates on struggling courses)</Label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="celebrate-wins"
                  type="checkbox"
                  checked={celebrateWins}
                  onChange={(e) => setCelebrateWins(e.target.checked)}
                  disabled={isSaving || !isLoaded}
                />
                <Label htmlFor="celebrate-wins">Celebrate wins (notify about improvements and good work)</Label>
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={isSaving || !isLoaded} data-testid="button-save-settings">
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </CardFooter>
        </Card>
      </form>

      <Card data-testid="notification-history">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Notification History
          </CardTitle>
          <CardDescription>Recent notifications sent to you</CardDescription>
        </CardHeader>
        <CardContent>
          {notificationHistory.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No notifications sent yet.</p>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {notificationHistory.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 rounded-md border p-3"
                  data-testid={`history-item-${item.id}`}
                >
                  <div className="mt-0.5">
                    {item.channel === 'email' ? (
                      <Mail className="h-4 w-4 text-blue-500" />
                    ) : (
                      <MessageSquare className="h-4 w-4 text-green-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">
                        {item.subject ?? 'Notification'}
                      </span>
                      {item.status === 'sent' || item.status === 'delivered' ? (
                        <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
                      ) : item.status === 'failed' ? (
                        <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                      ) : (
                        <Clock className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-1">
                      <span>{item.channel.toUpperCase()}</span>
                      <span>&middot;</span>
                      <span>{item.recipientEmail ?? item.recipientPhone ?? ''}</span>
                      <span>&middot;</span>
                      <span>{new Date(item.sentAt ?? item.createdAt).toLocaleString()}</span>
                    </div>
                    {item.status === 'failed' && item.failureReason && (
                      <p className="text-xs text-red-500 mt-1">{item.failureReason}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
