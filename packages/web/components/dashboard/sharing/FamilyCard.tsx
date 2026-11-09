'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ISharingPerson, SharingAlertChannel, StudentAccess } from '@scholaracle/contracts';
import {
  BellOff,
  Check,
  Clock,
  Crown,
  Link2,
  LogOut,
  Mail,
  RotateCcw,
  Settings2,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { ConfirmDialog, ErrorDisplay } from '@/components/common';
import { sharingApi, type ISharingPersonPatch } from '@/lib/api/sharing';
import type { ISessionUser } from '@/lib/auth/sessionUser';
import { useAsyncData } from '@/lib/hooks';
import {
  LABEL_TEXT,
  canChangeAdmin,
  canEditOwnAlerts,
  canLeave,
  canManagePeople,
  canRemovePerson,
  canResend,
  isViewerRow,
  roleChipLabel,
  statusChipLabel,
  textsChipLabel,
} from '@/lib/sharing/access';
import { ALERT_TYPE_OPTIONS } from '@/lib/sharing/alertTypeOptions';

export interface FamilyCardProps {
  studentId: string;
  studentName: string;
  /** The viewer's access to this student; decides which controls render. */
  access: StudentAccess;
  /** The signed-in user, to find their own row. */
  viewer: ISessionUser | null;
  /** Display name for the owner row, when known. */
  ownerName?: string;
  /** Opens the Share dialog (owner and admin only). */
  onShare?: () => void;
  /** Called after the viewer left the student. */
  onLeft?: () => void;
  /** Bump to reload the list (after the Share dialog sent an invitation). */
  refreshToken?: number;
}

interface INotice {
  readonly kind: 'ok' | 'error';
  readonly text: string;
}

/** A confirmation in progress. `key` is the row the result (or its error) is reported under. */
type Pending =
  | { kind: 'remove'; person: ISharingPerson; key: string }
  | { kind: 'leave' }
  | null;

const CHANNELS: readonly { value: SharingAlertChannel; label: string }[] = [
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'Text' },
  { value: 'push', label: 'Push' },
];

function rowKey(person: ISharingPerson, index: number): string {
  if (person.isOwner) return 'owner';
  return person.email ?? person.userId ?? String(index);
}

function MyAlertsPanel({
  person,
  saving,
  onSave,
  onSilence,
  onClose,
}: {
  person: ISharingPerson;
  saving: boolean;
  onSave: (patch: ISharingPersonPatch) => void;
  onSilence: () => void;
  onClose: () => void;
}) {
  const [receiveAlerts, setReceiveAlerts] = useState(person.receiveAlerts !== false);
  const [channels, setChannels] = useState<readonly SharingAlertChannel[]>(
    person.alertChannels ?? ['email']
  );
  const [types, setTypes] = useState<readonly string[]>(
    person.alertTypes ?? ALERT_TYPE_OPTIONS.map((o) => o.value)
  );

  const toggle = <T,>(list: readonly T[], value: T): readonly T[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  return (
    <div
      className="mt-3 space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3"
      data-testid="family-my-alerts-panel"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">My alerts</p>
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Close" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <label className="flex items-center gap-3 text-sm">
        <Switch
          checked={receiveAlerts}
          onCheckedChange={setReceiveAlerts}
          disabled={saving}
          data-testid="family-alerts-receive"
        />
        Send me alerts
      </label>
      <fieldset className="space-y-1">
        <legend className="text-xs font-medium text-muted-foreground">Channels</legend>
        <div className="flex flex-wrap gap-3 text-sm">
          {CHANNELS.map((c) => (
            <label key={c.value} className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={channels.includes(c.value)}
                onChange={() => setChannels((prev) => toggle(prev, c.value))}
                disabled={saving || !receiveAlerts}
                data-testid={`family-alerts-channel-${c.value}`}
              />
              {c.label}
            </label>
          ))}
        </div>
        {channels.includes('sms') && person.smsStatus !== 'opted_in' && (
          <p className="text-xs text-muted-foreground">
            Texts start after you opt in from the link the inviter shared.
          </p>
        )}
      </fieldset>
      <fieldset className="space-y-1">
        <legend className="text-xs font-medium text-muted-foreground">Alert types</legend>
        <div className="grid gap-1 text-sm sm:grid-cols-2">
          {ALERT_TYPE_OPTIONS.map((o) => (
            <label key={o.value} className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={types.includes(o.value)}
                onChange={() => setTypes((prev) => toggle(prev, o.value))}
                disabled={saving || !receiveAlerts}
                data-testid={`family-alerts-type-${o.value}`}
              />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onSilence}
          disabled={saving}
          data-testid="family-silence"
        >
          <BellOff className="h-4 w-4" />
          Silence
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => onSave({ receiveAlerts, alertChannels: channels, alertTypes: types })}
          disabled={saving}
          data-testid="family-alerts-save"
        >
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

/**
 * "Family & guardians" for one student (sharing-spec §4.8): everyone who can see the student,
 * with role, status and texting chips; role-aware controls (resend, make admin, remove, share)
 * for owners and admins; "My alerts" and "Leave" on the viewer's own row. Built on
 * `/api/students/:id/contacts*` and `/api/sharing/*`.
 */
export function FamilyCard({
  studentId,
  studentName,
  access,
  viewer,
  ownerName,
  onShare,
  onLeft,
  refreshToken = 0,
}: FamilyCardProps) {
  const fetchPeople = useCallback(() => sharingApi.listPeople(studentId), [studentId]);
  const { data: people, isLoading, error, retry } = useAsyncData(fetchPeople, { retryCount: 1 });
  // useAsyncData keeps fetchFn in a ref and reloads only on its own triggers, so a new student
  // or a bumped refreshToken (the Share dialog just sent an invitation) has to ask it to.
  const reloadKey = `${studentId}|${refreshToken}`;
  const lastReloadKey = useRef(reloadKey);
  useEffect(() => {
    if (lastReloadKey.current === reloadKey) return;
    lastReloadKey.current = reloadKey;
    retry();
  }, [reloadKey, retry]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notices, setNotices] = useState<Readonly<Record<string, INotice>>>({});
  const [openAlertsKey, setOpenAlertsKey] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [cardError, setCardError] = useState<string | null>(null);

  const notify = (key: string, notice: INotice | null) => {
    setNotices((prev) => {
      const next = { ...prev };
      if (notice) next[key] = notice;
      else delete next[key];
      return next;
    });
  };

  const run = async (key: string, action: () => Promise<INotice | null>, reload = true) => {
    setBusyKey(key);
    setCardError(null);
    notify(key, null);
    try {
      const notice = await action();
      notify(key, notice);
      if (reload) retry();
    } catch (err) {
      notify(key, {
        kind: 'error',
        text: err instanceof Error ? err.message : 'That did not work. Try again.',
      });
    } finally {
      setBusyKey(null);
    }
  };

  /**
   * Pending rows get their invitation again (by group, or re-issued for a row invited before
   * groups existed); accepted rows get a 24 h sign-in link. Never the other way round.
   */
  const resend = (key: string, person: ISharingPerson) =>
    run(
      key,
      async () => {
        const email = person.email ?? '';
        if (person.status === 'pending') {
          if (person.inviteGroupId) await sharingApi.resend(person.inviteGroupId);
          else await sharingApi.resendContact(studentId, email);
          return { kind: 'ok', text: 'Invitation re-sent. The link works for 7 days.' };
        }
        await sharingApi.sendLoginLink(studentId, email, 'email');
        return { kind: 'ok', text: 'Sign-in link sent. It expires in 24 hours.' };
      },
      // A legacy row gains its group id on the server; reload so the next click uses it.
      person.status === 'pending' && !person.inviteGroupId
    );

  const toggleAdmin = (key: string, person: ISharingPerson) =>
    run(key, async () => {
      await sharingApi.setAdmin(studentId, person.email ?? '', !person.isAdmin);
      return {
        kind: 'ok',
        text: person.isAdmin ? 'Admin rights removed.' : 'Now an admin.',
      };
    });

  const reinvite = (key: string, person: ISharingPerson) =>
    run(key, async () => {
      await sharingApi.invite({
        email: person.email ?? '',
        label: person.role,
        studentIds: [studentId],
        ...(person.name ? { name: person.name } : {}),
        ...(person.isAdmin ? { isAdmin: true } : {}),
      });
      return { kind: 'ok', text: 'Invitation sent again.' };
    });

  const saveMyAlerts = (key: string, person: ISharingPerson, patch: ISharingPersonPatch) =>
    run(key, async () => {
      await sharingApi.updatePerson(studentId, person.email ?? '', patch);
      setOpenAlertsKey(null);
      return { kind: 'ok', text: 'Alert settings saved.' };
    });

  const silence = (key: string, person: ISharingPerson) =>
    run(key, async () => {
      await sharingApi.updatePerson(studentId, person.email ?? '', {
        receiveAlerts: false,
        alertChannels: [],
      });
      setOpenAlertsKey(null);
      return { kind: 'ok', text: `${studentName} is silenced for you. Turn alerts back on any time.` };
    });

  const confirmPending = async () => {
    if (!pending) return;
    const current = pending;
    setPending(null);
    if (current.kind === 'remove') {
      await run(current.key, async () => {
        await sharingApi.removePerson(studentId, current.person.email ?? '');
        return null;
      });
      return;
    }
    setBusyKey('leave');
    setCardError(null);
    try {
      await sharingApi.leave(studentId);
      onLeft?.();
    } catch (err) {
      setCardError(err instanceof Error ? err.message : 'Could not leave this student.');
    } finally {
      setBusyKey(null);
    }
  };

  const list = people ?? [];
  const manager = canManagePeople(access);

  return (
    <Card data-testid="family-card">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            <div>
              <CardTitle className="text-base">Family &amp; guardians</CardTitle>
              <CardDescription>
                People who can see {studentName}&apos;s grades and get their own alerts.
              </CardDescription>
            </div>
          </div>
          {manager && onShare && (
            <Button size="sm" onClick={onShare} data-testid="family-share">
              <UserPlus className="h-4 w-4" />
              Share
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {cardError && <ErrorDisplay error={cardError} title="Something went wrong" />}
        {error && !isLoading && (
          <ErrorDisplay error={error} title="Failed to load people" onRetry={retry} />
        )}
        {isLoading && !people && (
          <p className="py-2 text-sm text-muted-foreground" data-testid="family-loading">
            Loading…
          </p>
        )}
        {list.map((p, i) => {
          const key = rowKey(p, i);
          const mine = isViewerRow(p, viewer);
          const busy = busyKey === key;
          const notice = notices[key];
          const displayName = p.isOwner
            ? (ownerName ?? 'Account owner')
            : (p.name ?? p.email ?? 'Invited adult');
          const statusLabel = statusChipLabel(p);
          return (
            <div key={key} className="rounded-lg border p-3" data-testid={`family-row-${key}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                      p.isOwner
                        ? 'bg-primary/10 text-primary'
                        : p.status === 'accepted'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : p.status === 'declined'
                            ? 'bg-muted text-muted-foreground'
                            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                    }`}
                    aria-hidden="true"
                  >
                    {p.isOwner ? (
                      <Crown className="h-3.5 w-3.5" />
                    ) : p.status === 'accepted' ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : p.status === 'declined' ? (
                      <X className="h-3.5 w-3.5" />
                    ) : (
                      <Clock className="h-3.5 w-3.5" />
                    )}
                  </div>
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium" data-testid={`family-name-${key}`}>
                        {displayName}
                        {mine && <span className="text-muted-foreground"> (you)</span>}
                      </span>
                      {!p.isOwner && (
                        <Badge variant="secondary" className="text-[10px]">
                          {LABEL_TEXT[p.role]}
                        </Badge>
                      )}
                      <Badge
                        variant={p.isOwner ? 'default' : 'outline'}
                        className={`text-[10px] ${!p.isOwner && p.isAdmin ? 'border-primary/50 text-primary' : ''}`}
                        data-testid={`family-chip-role-${key}`}
                      >
                        {roleChipLabel(p)}
                      </Badge>
                      {!p.isOwner && (
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            statusLabel === 'Accepted'
                              ? 'border-green-300 text-green-700 dark:text-green-400'
                              : statusLabel === 'Invited'
                                ? 'border-amber-300 text-amber-700 dark:text-amber-400'
                                : 'text-muted-foreground'
                          }`}
                          data-testid={`family-chip-status-${key}`}
                        >
                          {statusLabel}
                        </Badge>
                      )}
                      {!p.isOwner && (
                        <Badge
                          variant="outline"
                          className="text-[10px] text-muted-foreground"
                          data-testid={`family-chip-texts-${key}`}
                        >
                          {textsChipLabel(p)}
                        </Badge>
                      )}
                    </div>
                    {p.email && <p className="text-xs text-muted-foreground">{p.email}</p>}
                    {notice && (
                      <p
                        className={`text-xs ${notice.kind === 'ok' ? 'text-green-700 dark:text-green-400' : 'text-destructive'}`}
                        data-testid={`family-notice-${key}`}
                        role={notice.kind === 'error' ? 'alert' : 'status'}
                      >
                        {notice.text}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1">
                  {canResend(access, p, viewer) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void resend(key, p)}
                      disabled={busy}
                      data-testid={`family-resend-${key}`}
                    >
                      {p.status === 'pending' ? (
                        <Mail className="h-3.5 w-3.5" />
                      ) : (
                        <Link2 className="h-3.5 w-3.5" />
                      )}
                      {p.status === 'pending' ? 'Resend' : 'Send sign-in link'}
                    </Button>
                  )}
                  {manager && !p.isOwner && p.status === 'declined' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void reinvite(key, p)}
                      disabled={busy}
                      data-testid={`family-reinvite-${key}`}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Re-invite
                    </Button>
                  )}
                  {canChangeAdmin(access, p, viewer) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void toggleAdmin(key, p)}
                      disabled={busy}
                      data-testid={`family-toggle-admin-${key}`}
                    >
                      {p.isAdmin ? (
                        <ShieldOff className="h-3.5 w-3.5" />
                      ) : (
                        <ShieldCheck className="h-3.5 w-3.5" />
                      )}
                      {p.isAdmin ? 'Remove admin' : 'Make admin'}
                    </Button>
                  )}
                  {canRemovePerson(access, p, viewer) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setPending({ kind: 'remove', person: p, key })}
                      disabled={busy}
                      data-testid={`family-remove-${key}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove
                    </Button>
                  )}
                  {canEditOwnAlerts(p, viewer) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setOpenAlertsKey((k) => (k === key ? null : key))}
                      disabled={busy}
                      aria-expanded={openAlertsKey === key}
                      data-testid={`family-my-alerts-${key}`}
                    >
                      <Settings2 className="h-3.5 w-3.5" />
                      My alerts
                    </Button>
                  )}
                  {canLeave(p, viewer) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setPending({ kind: 'leave' })}
                      disabled={busy || busyKey === 'leave'}
                      data-testid={`family-leave-${key}`}
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Leave
                    </Button>
                  )}
                </div>
              </div>
              {openAlertsKey === key && canEditOwnAlerts(p, viewer) && (
                <MyAlertsPanel
                  person={p}
                  saving={busy}
                  onSave={(patch) => void saveMyAlerts(key, p, patch)}
                  onSilence={() => void silence(key, p)}
                  onClose={() => setOpenAlertsKey(null)}
                />
              )}
            </div>
          );
        })}
        {!isLoading && !error && list.length === 0 && (
          <p className="py-2 text-sm text-muted-foreground">Nobody else follows {studentName} yet.</p>
        )}
        {!manager && (
          <p className="text-xs text-muted-foreground" data-testid="family-member-note">
            Only the owner or an admin can invite or remove people.
          </p>
        )}
      </CardContent>

      <ConfirmDialog
        isOpen={pending !== null}
        title={pending?.kind === 'leave' ? `Stop following ${studentName}?` : 'Remove this person?'}
        description={
          pending?.kind === 'leave'
            ? `You will no longer see ${studentName} or get alerts about them. The owner is told by email and can invite you again.`
            : `${pending?.kind === 'remove' ? (pending.person.name ?? pending.person.email ?? 'They') : 'They'} will lose access to ${studentName} at once; their alerts and sign-in links stop.`
        }
        confirmLabel={pending?.kind === 'leave' ? 'Leave' : 'Remove'}
        isSubmitting={busyKey === 'leave'}
        onConfirm={() => void confirmPending()}
        onCancel={() => setPending(null)}
      />
    </Card>
  );
}
