'use client';

import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { settingsApi } from '@/lib/api/settings';

export default function SettingsPage() {
  const [email, setEmail] = useState(''); // profile fields (not persisted yet)
  const [name, setName] = useState(''); // profile fields (not persisted yet)
  const [phone, setPhone] = useState(''); // profile fields (not persisted yet)

  const [pushNotifications, setPushNotifications] = useState(true);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [smsNotifications, setSmsNotifications] = useState(false);

  const [gradeDrop, setGradeDrop] = useState(5);
  const [daysBeforeDeadline, setDaysBeforeDeadline] = useState(2);
  const [lowGradeThreshold, setLowGradeThreshold] = useState(80);

  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const s = await settingsApi.get();
        setPushNotifications(s.notifications.push);
        setEmailNotifications(s.notifications.email);
        setSmsNotifications(s.notifications.sms);
        setGradeDrop(s.alerts.gradeDrop);
        setDaysBeforeDeadline(s.alerts.daysBeforeDeadline);
        setLowGradeThreshold(s.alerts.lowGradeThreshold);
      } catch {
        // settingsApi.get() already falls back; this is just defensive
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
      },
      alerts: {
        gradeDrop,
        daysBeforeDeadline,
        lowGradeThreshold,
      },
    });

    setIsSaving(false);
    setToast(ok ? 'Saved' : 'Failed to save');
  };

  return (
    <div className="space-y-6" data-testid="dashboard-settings-page">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-gray-600 dark:text-gray-400">Manage your account preferences</p>
      </div>

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
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="notify-push">Push Notifications</Label>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Receive push notifications on your devices
                </p>
              </div>
              <input
                id="notify-push"
                name="notify-push"
                data-testid="push-toggle"
                type="checkbox"
                checked={pushNotifications}
                onChange={(e) => setPushNotifications(e.target.checked)}
                disabled={isSaving || !isLoaded}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="notify-email">Email Notifications</Label>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Receive notifications via email
                </p>
              </div>
              <input
                id="notify-email"
                name="notify-email"
                data-testid="email-toggle"
                type="checkbox"
                checked={emailNotifications}
                onChange={(e) => setEmailNotifications(e.target.checked)}
                disabled={isSaving || !isLoaded}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="notify-sms">SMS Notifications</Label>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Receive notifications via SMS
                </p>
              </div>
              <input
                id="notify-sms"
                name="notify-sms"
                data-testid="sms-toggle"
                type="checkbox"
                checked={smsNotifications}
                onChange={(e) => setSmsNotifications(e.target.checked)}
                disabled={isSaving || !isLoaded}
              />
            </div>
          </CardContent>
        </Card>

        <Card data-testid="threshold-settings">
          <CardHeader>
            <CardTitle>Alert Thresholds</CardTitle>
            <CardDescription>Control when alerts are generated</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="gradeDrop">Grade Drop Threshold</Label>
              <Input
                id="gradeDrop"
                type="number"
                min={1}
                max={100}
                value={gradeDrop}
                onChange={(e) => setGradeDrop(Number(e.target.value))}
                data-testid="grade-drop-threshold"
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
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={isSaving || !isLoaded} data-testid="save-settings-button">
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  );
}

