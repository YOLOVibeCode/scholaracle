'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Save, Monitor, Link2, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { settingsApi, type IUserSettingsResponse } from '@/lib/api/settings';

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
        setTone((s.notifications.tone as 'formal' | 'casual' | 'encouraging') ?? 'encouraging');
        setFrequency((s.notifications.frequency as 'minimal' | 'balanced' | 'proactive') ?? 'balanced');
        setGradeDrop(s.alerts.gradeDrop);
        setDaysBeforeDeadline(s.alerts.daysBeforeDeadline);
        setLowGradeThreshold(s.alerts.lowGradeThreshold);
        setPrioritizeHighImpact(s.alerts.prioritizeHighImpact ?? true);
        setEmphasizeWeakSubjects(s.alerts.emphasizeWeakSubjects ?? true);
        setCelebrateWins(s.alerts.celebrateWins ?? true);
        if (s.alerts.enabledTypes) setEnabledTypes(s.alerts.enabledTypes as Record<string, { enabled: boolean; severity: string }>);
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
        },
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
                <p className="text-sm text-gray-600 dark:text-gray-400">Receive push notifications on your devices</p>
              </div>
              <input
                id="notify-push"
                name="notify-push"
                data-testid="toggle-push"
                type="checkbox"
                checked={pushNotifications}
                onChange={(e) => setPushNotifications(e.target.checked)}
                disabled={isSaving || !isLoaded}
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
              <h4 className="font-medium">Digest Schedule</h4>
              <div className="flex items-center justify-between">
                <Label>Daily Digest</Label>
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
    </div>
  );
}
