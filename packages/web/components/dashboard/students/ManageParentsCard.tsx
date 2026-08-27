'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Users, Trash2, Mail, Check, Clock, Crown, ShieldCheck, ShieldOff, Link2 } from 'lucide-react';
import { studentsApi } from '@/lib/api/students';
import { useAsyncData } from '@/lib/hooks';

interface SendLinkState {
  email: string;
  channel: 'email' | 'sms';
  to: string;
  sending: boolean;
  sent: boolean;
  error: string | null;
}

export interface ManageParentsCardProps {
  studentId: string;
  studentName: string;
  /** Whether the current user is the primary owner (can invite/remove). */
  isOwner: boolean;
}

export function ManageParentsCard({ studentId, studentName, isOwner }: ManageParentsCardProps) {
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'parent' | 'guardian' | 'caregiver'>('parent');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [sendLink, setSendLink] = useState<SendLinkState | null>(null);

  const fetchParents = useCallback(() => studentsApi.getParents(studentId), [studentId]);
  const { data: parents, retry: refreshParents } = useAsyncData(fetchParents, { retryCount: 1 });

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !inviteEmail.includes('@')) {
      setInviteError('Please enter a valid email address');
      return;
    }

    setInviting(true);
    setInviteError(null);
    setInviteSuccess(null);

    const result = await studentsApi.inviteParent(studentId, inviteEmail.trim(), inviteRole);
    setInviting(false);

    if (result.success) {
      setInviteSuccess(result.message ?? `Invitation sent to ${inviteEmail}`);
      setInviteEmail('');
      refreshParents();
    } else {
      setInviteError(result.message ?? 'Failed to send invitation');
    }
  };

  const handleToggleAdmin = async (email: string, currentlyAdmin: boolean) => {
    setToggling(email);
    setInviteError(null);
    try {
      const success = await studentsApi.setParentAdmin(studentId, email, !currentlyAdmin);
      if (success) {
        refreshParents();
      }
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Failed to update parent role');
    } finally {
      setToggling(null);
    }
  };

  const handleRemove = async (email: string) => {
    setRemoving(email);
    setInviteError(null);
    try {
      const success = await studentsApi.removeParent(studentId, email);
      if (success) {
        refreshParents();
      }
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Failed to remove parent');
    } finally {
      setRemoving(null);
    }
  };

  const openSendLink = (contactEmail: string, defaultTo: string) => {
    setSendLink({
      email: contactEmail,
      channel: 'email',
      to: defaultTo,
      sending: false,
      sent: false,
      error: null,
    });
  };

  const handleSendLink = async () => {
    if (!sendLink) return;
    setSendLink((s) => s && { ...s, sending: true, error: null, sent: false });
    const result = await studentsApi.sendContactMagicLink(
      studentId,
      sendLink.email,
      sendLink.channel,
      sendLink.to || undefined
    );
    if (result.success) {
      setSendLink((s) => s && { ...s, sending: false, sent: true });
    } else {
      setSendLink((s) => s && { ...s, sending: false, error: result.message ?? 'Failed to send link' });
    }
  };

  const parentList = parents ?? [];

  return (
    <Card data-testid="manage-parents-card">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-muted-foreground" />
          <div>
            <CardTitle className="text-base">Parents & Guardians</CardTitle>
            <CardDescription>
              People who can view {studentName}&apos;s grades and receive alerts
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current parents list */}
        <div className="space-y-2">
          {parentList.map((p, i) => (
            <div
              key={p.email ?? p.userId ?? i}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium ${
                    p.isOwner
                      ? 'bg-primary/10 text-primary'
                      : p.status === 'accepted'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                  }`}
                >
                  {p.isOwner ? (
                    <Crown className="h-3.5 w-3.5" />
                  ) : p.status === 'accepted' ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Clock className="h-3.5 w-3.5" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {p.name ?? p.email ?? 'Primary Parent'}
                    </span>
                    <Badge
                      variant={p.isOwner ? 'default' : 'secondary'}
                      className="text-[10px]"
                    >
                      {p.isOwner ? 'Owner' : p.role}
                    </Badge>
                    {p.isAdmin && !p.isOwner && (
                      <Badge variant="outline" className="text-[10px] border-primary/50 text-primary">
                        Admin
                      </Badge>
                    )}
                  </div>
                  {p.email && (
                    <span className="text-xs text-muted-foreground">{p.email}</span>
                  )}
                  {p.status === 'pending' && (
                    <span className="text-xs text-amber-600 dark:text-amber-400"> — invite pending</span>
                  )}
                </div>
              </div>

              {!p.isOwner && isOwner && p.status === 'accepted' && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-primary"
                    onClick={() => p.email && openSendLink(p.email, p.email)}
                    title="Send login link"
                    data-testid={`send-link-${p.email}`}
                  >
                    <Link2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-primary"
                    onClick={() => p.email && handleToggleAdmin(p.email, p.isAdmin)}
                    disabled={toggling === p.email}
                    title={p.isAdmin ? 'Remove admin rights' : 'Grant admin rights'}
                    data-testid={`toggle-admin-${p.email}`}
                  >
                    {p.isAdmin ? (
                      <ShieldOff className="h-3.5 w-3.5" />
                    ) : (
                      <ShieldCheck className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => p.email && handleRemove(p.email)}
                    disabled={removing === p.email}
                    data-testid={`remove-parent-${p.email}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
              {!p.isOwner && isOwner && p.status === 'pending' && (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-primary"
                    onClick={() => p.email && openSendLink(p.email, p.email)}
                    title="Send login link"
                    data-testid={`send-link-${p.email}`}
                  >
                    <Link2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => p.email && handleRemove(p.email)}
                    disabled={removing === p.email}
                    data-testid={`remove-parent-${p.email}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          ))}

          {parentList.length === 0 && (
            <p className="text-sm text-muted-foreground py-2">Loading...</p>
          )}
        </div>

        {/* Send login link panel */}
        {sendLink && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
            <p className="text-sm font-medium flex items-center gap-2">
              <Link2 className="h-4 w-4 text-primary" />
              Send login link to {sendLink.email}
            </p>
            <div className="flex gap-2 flex-wrap">
              <Select
                value={sendLink.channel}
                onValueChange={(v) =>
                  setSendLink((s) => s && { ...s, channel: v as 'email' | 'sms', sent: false, error: null })
                }
              >
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                </SelectContent>
              </Select>
              <Input
                className="flex-1 min-w-[160px]"
                placeholder={sendLink.channel === 'email' ? 'email@example.com' : '+1 555 000 0000'}
                value={sendLink.to}
                onChange={(e) =>
                  setSendLink((s) => s && { ...s, to: e.target.value, sent: false, error: null })
                }
                disabled={sendLink.sending || sendLink.sent}
              />
              <Button
                size="sm"
                onClick={handleSendLink}
                disabled={sendLink.sending || sendLink.sent || !sendLink.to.trim()}
                data-testid="send-link-submit"
              >
                {sendLink.sending ? 'Sending…' : sendLink.sent ? 'Sent ✓' : 'Send'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSendLink(null)}
              >
                Cancel
              </Button>
            </div>
            {sendLink.error && (
              <p className="text-xs text-destructive">{sendLink.error}</p>
            )}
            {sendLink.sent && (
              <p className="text-xs text-green-600 dark:text-green-400">
                Login link sent — it expires in 24 hours.
              </p>
            )}
          </div>
        )}

        {/* Invite form (owner only) */}
        {isOwner && (
          <div className="space-y-3 border-t pt-4">
            <p className="text-sm font-medium">Invite another parent or guardian</p>
            <p className="text-xs text-muted-foreground">
              They&apos;ll receive an invitation to create an account (or link their existing account)
              and will be able to see {studentName}&apos;s grades and receive their own alerts.
            </p>

            <div className="flex gap-2">
              <div className="flex-1 space-y-1">
                <Label htmlFor="invite-email" className="sr-only">
                  Email
                </Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="parent@example.com"
                  value={inviteEmail}
                  onChange={(e) => {
                    setInviteEmail(e.target.value);
                    setInviteError(null);
                    setInviteSuccess(null);
                  }}
                  disabled={inviting}
                  data-testid="invite-parent-email"
                />
              </div>
              <Select
                value={inviteRole}
                onValueChange={(v) => setInviteRole(v as typeof inviteRole)}
              >
                <SelectTrigger className="w-[130px]" data-testid="invite-parent-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="parent">Parent</SelectItem>
                  <SelectItem value="guardian">Guardian</SelectItem>
                  <SelectItem value="caregiver">Caregiver</SelectItem>
                </SelectContent>
              </Select>
              <Button
                onClick={handleInvite}
                disabled={inviting || !inviteEmail.trim()}
                data-testid="invite-parent-submit"
              >
                {inviting ? (
                  'Sending...'
                ) : (
                  <>
                    <Mail className="mr-2 h-4 w-4" />
                    Invite
                  </>
                )}
              </Button>
            </div>

            {inviteError && (
              <p className="text-sm text-destructive">{inviteError}</p>
            )}
            {inviteSuccess && (
              <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                <Check className="h-3.5 w-3.5" />
                {inviteSuccess}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
