'use client';

import { useState } from 'react';
import type {
  ISharingInviteRequest,
  ISharingInviteResult,
  SharingAlertChannel,
  SharingInvitePerStudentStatus,
  SharingLabel,
} from '@scholaracle/contracts';
import { Check, Copy, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { sharingApi } from '@/lib/api/sharing';
import { LABEL_TEXT } from '@/lib/sharing/access';

/** A student the viewer may share (owner or admin). */
export interface IShareCandidate {
  readonly id: string;
  readonly name: string;
}

export interface ShareFormProps {
  students: readonly IShareCandidate[];
  /** Pre-ticked students; the current student when opened from a student page. */
  defaultStudentIds?: readonly string[];
  onSent?: (result: ISharingInviteResult, body: ISharingInviteRequest) => void;
  onDone?: () => void;
}

const RESULT_TEXT: Record<SharingInvitePerStudentStatus, string> = {
  invited: 'Invitation sent',
  already_invited: 'Already invited',
  already_accepted: 'Already has access',
  no_access: 'You cannot share this student',
};

const SELECT_CLASS =
  'border-input h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] dark:bg-input/30';

/**
 * Share dialog body (sharing-spec §4.4 step 1): person, label, admin, students, channels, Send.
 * Shows the per-student outcome and, when texting was requested, the opt-in link to pass on.
 */
export function ShareForm({ students, defaultStudentIds, onSent, onDone }: ShareFormProps) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [label, setLabel] = useState<SharingLabel>('parent');
  const [isAdmin, setIsAdmin] = useState(false);
  const [selected, setSelected] = useState<readonly string[]>(() => {
    if (defaultStudentIds && defaultStudentIds.length > 0) return defaultStudentIds;
    return students.length === 1 ? [students[0]!.id] : [];
  });
  const [channels, setChannels] = useState<Record<SharingAlertChannel, boolean>>({
    email: true,
    push: true,
    sms: false,
  });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ISharingInviteResult | null>(null);
  const [copied, setCopied] = useState(false);

  const nameOf = (id: string): string => students.find((s) => s.id === id)?.name ?? 'Student';
  const smsBlocked = channels.sms && phone.trim() === '';

  const toggleStudent = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  };

  const toggleChannel = (channel: SharingAlertChannel) => {
    setChannels((prev) => ({ ...prev, [channel]: !prev[channel] }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail.includes('@')) {
      setError('Enter the person’s email address.');
      return;
    }
    if (selected.length === 0) {
      setError('Pick at least one student.');
      return;
    }
    if (smsBlocked) {
      setError('Texts need a phone number.');
      return;
    }
    const alertChannels = (Object.keys(channels) as SharingAlertChannel[]).filter(
      (c) => channels[c]
    );
    const body: ISharingInviteRequest = {
      email: trimmedEmail,
      label,
      studentIds: selected,
      alertChannels,
      ...(name.trim() ? { name: name.trim() } : {}),
      ...(phone.trim() ? { phone: phone.trim() } : {}),
      ...(isAdmin ? { isAdmin: true } : {}),
    };
    setSending(true);
    try {
      const sent = await sharingApi.invite(body);
      setResult(sent);
      onSent?.(sent, body);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send the invitation');
    } finally {
      setSending(false);
    }
  };

  const copyLink = async () => {
    if (!result?.smsOptInUrl) return;
    try {
      await navigator.clipboard.writeText(result.smsOptInUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const reset = () => {
    setResult(null);
    setEmail('');
    setName('');
    setPhone('');
    setIsAdmin(false);
    setCopied(false);
    setError(null);
  };

  if (result) {
    const who = name.trim() || email.trim();
    return (
      <div className="space-y-4" data-testid="share-result">
        <ul className="space-y-1 text-sm">
          {result.perStudent.map((row) => (
            <li
              key={row.studentId}
              className="flex items-center justify-between rounded border px-3 py-2"
              data-testid={`share-result-${row.studentId}`}
            >
              <span className="font-medium">{nameOf(row.studentId)}</span>
              <span
                className={
                  row.status === 'invited'
                    ? 'text-green-700 dark:text-green-400'
                    : 'text-muted-foreground'
                }
              >
                {RESULT_TEXT[row.status]}
              </span>
            </li>
          ))}
        </ul>
        {result.perStudent.some((r) => r.status === 'invited') && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Mail className="h-4 w-4" aria-hidden="true" />
            One email went to {who} with a link that works for 7 days.
          </p>
        )}
        {result.smsOptInUrl && (
          <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <p className="text-sm font-medium">Texts need {who}&apos;s own consent</p>
            <p className="text-xs text-muted-foreground">
              Pass this link on to {who}: they must opt in to texts themselves. Nothing is texted
              to their number before they do.
            </p>
            <div className="flex gap-2">
              <Input
                readOnly
                value={result.smsOptInUrl}
                onFocus={(e) => e.currentTarget.select()}
                data-testid="share-sms-link"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={copyLink}
                data-testid="share-copy-link"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={reset} data-testid="share-another">
            Share with someone else
          </Button>
          <Button type="button" onClick={onDone} data-testid="share-done">
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="share-form">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="share-email">Email *</Label>
          <Input
            id="share-email"
            type="email"
            placeholder="person@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={sending}
            required
            data-testid="share-email"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="share-name">Name</Label>
          <Input
            id="share-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={sending}
            data-testid="share-name"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="share-phone">Phone (for texts)</Label>
          <Input
            id="share-phone"
            type="tel"
            placeholder="+1 555 000 0000"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={sending}
            data-testid="share-phone"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="share-label">Label</Label>
          <select
            id="share-label"
            className={SELECT_CLASS}
            value={label}
            onChange={(e) => setLabel(e.target.value as SharingLabel)}
            disabled={sending}
            data-testid="share-label"
          >
            {(Object.keys(LABEL_TEXT) as SharingLabel[]).map((value) => (
              <option key={value} value={value}>
                {LABEL_TEXT[value]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-3 pb-1">
          <Switch
            id="share-admin"
            checked={isAdmin}
            onCheckedChange={setIsAdmin}
            disabled={sending}
            data-testid="share-admin"
          />
          <Label htmlFor="share-admin" className="leading-tight">
            <span>
              Can manage
              <span className="block text-xs font-normal text-muted-foreground">
                Edit the student, connect portals, invite others
              </span>
            </span>
          </Label>
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Students</legend>
        {students.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="share-no-students">
            You can only share students you own or manage.
          </p>
        ) : (
          <div className="grid gap-1 sm:grid-cols-2">
            {students.map((s) => (
              <label key={s.id} className="flex items-center gap-2 rounded border px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={selected.includes(s.id)}
                  onChange={() => toggleStudent(s.id)}
                  disabled={sending}
                  data-testid={`share-student-${s.id}`}
                />
                <span>{s.name}</span>
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Alerts for this person</legend>
        <div className="flex flex-wrap gap-3 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={channels.email}
              onChange={() => toggleChannel('email')}
              disabled={sending}
              data-testid="share-channel-email"
            />
            Email
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={channels.push}
              onChange={() => toggleChannel('push')}
              disabled={sending}
              data-testid="share-channel-push"
            />
            Push
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={channels.sms}
              onChange={() => toggleChannel('sms')}
              disabled={sending}
              data-testid="share-channel-sms"
            />
            Text
            <span className="text-xs text-muted-foreground">(needs a phone; they opt in themselves)</span>
          </label>
        </div>
        {smsBlocked && (
          <p className="text-xs text-amber-700 dark:text-amber-400" data-testid="share-sms-needs-phone">
            Add a phone number to offer texts.
          </p>
        )}
      </fieldset>

      {error && (
        <p className="text-sm text-destructive" role="alert" data-testid="share-error">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        {onDone && (
          <Button type="button" variant="ghost" onClick={onDone} disabled={sending}>
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          disabled={sending || students.length === 0}
          data-testid="share-submit"
        >
          <Mail className="h-4 w-4" />
          {sending ? 'Sending…' : 'Send invitation'}
        </Button>
      </div>
    </form>
  );
}
