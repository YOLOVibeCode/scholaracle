'use client';

import { useRef, useState } from 'react';
import type { IStudentLoginInviteResponse, IStudentLoginStatus, IStudentMagicLinkResponse } from '@scholaracle/contracts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { studentsApi } from '@/lib/api/students';

export interface IStudentLoginRow {
  readonly id: string;
  readonly name: string;
  readonly login: IStudentLoginStatus;
}

export interface IStudentLoginsCardProps {
  readonly students: readonly IStudentLoginRow[];
  readonly onInvite: (
    studentId: string,
    email?: string
  ) => Promise<IStudentLoginInviteResponse>;
  readonly onRevoke: (studentId: string) => Promise<void>;
  readonly onShowGradesChange: (studentId: string, showGrades: boolean) => Promise<void>;
  readonly onIssueIpadLink: (studentId: string) => Promise<IStudentMagicLinkResponse>;
}

function loginSlug(name: string): string {
  return name.trim().split(/\s+/)[0]?.toLowerCase() ?? 'student';
}

function testId(name: string, suffix?: string): string {
  const slug = loginSlug(name);
  return suffix === undefined ? `student-login-${slug}` : `student-login-${slug}-${suffix}`;
}

export function StudentLoginsCard({
  students,
  onInvite,
  onRevoke,
  onShowGradesChange,
  onIssueIpadLink,
}: IStudentLoginsCardProps) {
  const [emails, setEmails] = useState<Record<string, string>>({});
  const emailsRef = useRef<Record<string, string>>({});
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [qrByStudent, setQrByStudent] = useState<Record<string, IStudentMagicLinkResponse>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sendLinkStudent, setSendLinkStudent] = useState<{
    id: string;
    channel: 'email' | 'sms';
    to: string;
    sending: boolean;
    sent: boolean;
    error: string | null;
  } | null>(null);

  const run = async (studentId: string, work: () => Promise<void>): Promise<void> => {
    setBusyId(studentId);
    try {
      await work();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card data-testid="student-logins-card">
      <CardHeader>
        <CardTitle>Student logins</CardTitle>
        <CardDescription>
          You are creating a login for your child. Students cannot sign up on their own.
          This login only shows the schoolwork you choose to share — never your school
          portal password.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {students.length === 0 && (
          <p className="text-sm text-muted-foreground">Add a student first, then create their login here.</p>
        )}
        {students.map((row) => {
          const slug = loginSlug(row.name);
          const busy = busyId === row.id;
          const revealed = passwords[row.id];
          return (
            <div
              key={row.id}
              className="space-y-3 rounded-lg border p-4"
              data-testid={testId(row.name)}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{row.name}</p>
                  {row.login.provisioned && row.login.email !== undefined && (
                    <p className="text-sm text-muted-foreground">{row.login.email}</p>
                  )}
                </div>
                {row.login.provisioned && (
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`${slug}-show-grades`} className="text-sm font-normal">
                      Show grades
                    </Label>
                    <Switch
                      id={`${slug}-show-grades`}
                      data-testid={testId(row.name, 'show-grades')}
                      checked={row.login.showGrades}
                      disabled={busy}
                      onCheckedChange={(checked) => {
                        void run(row.id, () => onShowGradesChange(row.id, checked));
                      }}
                    />
                  </div>
                )}
              </div>

              {revealed !== undefined && (
                <div className="rounded-md bg-muted px-3 py-2 text-sm">
                  <p className="text-muted-foreground">Temporary password — copy it now. It will not be shown again.</p>
                  <p className="mt-1 font-mono" data-testid={testId(row.name, 'temp-password')}>
                    {revealed}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    data-testid={testId(row.name, 'copy')}
                    onClick={() => {
                      void navigator.clipboard?.writeText(revealed);
                    }}
                  >
                    Copy password
                  </Button>
                </div>
              )}

              {row.login.provisioned ? (
                <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-testid={testId(row.name, 'ipad')}
                    disabled={busy}
                    onClick={() => {
                      void run(row.id, async () => {
                        const issued = await onIssueIpadLink(row.id);
                        setQrByStudent((prev) => ({ ...prev, [row.id]: issued }));
                      });
                    }}
                  >
                    iPad sign-in
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-testid={testId(row.name, 'send-link')}
                    disabled={busy}
                    onClick={() =>
                      setSendLinkStudent({
                        id: row.id,
                        channel: 'email',
                        to: '',
                        sending: false,
                        sent: false,
                        error: null,
                      })
                    }
                  >
                    Send login link
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-testid={testId(row.name, 'reset')}
                    disabled={busy}
                    onClick={() => {
                      void run(row.id, async () => {
                        const result = await onInvite(row.id);
                        setPasswords((prev) => ({ ...prev, [row.id]: result.temporaryPassword }));
                      });
                    }}
                  >
                    Reset password
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    data-testid={testId(row.name, 'revoke')}
                    disabled={busy}
                    onClick={() => {
                      void run(row.id, async () => {
                        await onRevoke(row.id);
                        setPasswords((prev) => {
                          const next = { ...prev };
                          delete next[row.id];
                          return next;
                        });
                        setQrByStudent((prev) => {
                          const next = { ...prev };
                          delete next[row.id];
                          return next;
                        });
                      });
                    }}
                  >
                    Revoke login
                  </Button>
                </div>
                {qrByStudent[row.id] !== undefined && (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Scan with the iPad camera. This code expires in 15 minutes.
                    </p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={qrByStudent[row.id]?.qrDataUrl}
                      alt="Scan with the iPad camera to open studio"
                      width={192}
                      height={192}
                      data-testid={testId(row.name, 'qr')}
                    />
                  </div>
                )}
                {sendLinkStudent?.id === row.id && (
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
                    <p className="text-sm font-medium">Send login link for {row.name}</p>
                    <div className="flex gap-2 flex-wrap">
                      <select
                        className="h-9 rounded-md border bg-background px-2 text-sm"
                        value={sendLinkStudent.channel}
                        onChange={(e) =>
                          setSendLinkStudent((s) =>
                            s ? { ...s, channel: e.target.value as 'email' | 'sms', sent: false, error: null } : null
                          )
                        }
                      >
                        <option value="email">Email</option>
                        <option value="sms">SMS</option>
                      </select>
                      <Input
                        className="flex-1 min-w-[160px]"
                        placeholder={sendLinkStudent.channel === 'email' ? 'email@example.com' : '+1 555 000 0000'}
                        value={sendLinkStudent.to}
                        onChange={(e) =>
                          setSendLinkStudent((s) =>
                            s ? { ...s, to: e.target.value, sent: false, error: null } : null
                          )
                        }
                        disabled={sendLinkStudent.sending || sendLinkStudent.sent}
                        data-testid={testId(row.name, 'send-link-to')}
                      />
                      <Button
                        size="sm"
                        disabled={sendLinkStudent.sending || sendLinkStudent.sent || !sendLinkStudent.to.trim()}
                        data-testid={testId(row.name, 'send-link-submit')}
                        onClick={async () => {
                          if (!sendLinkStudent) return;
                          setSendLinkStudent((s) => s && { ...s, sending: true, error: null });
                          const result = await studentsApi.sendStudentMagicLink(
                            row.id,
                            sendLinkStudent.channel,
                            sendLinkStudent.to
                          );
                          if (result.success) {
                            setSendLinkStudent((s) => s && { ...s, sending: false, sent: true });
                          } else {
                            setSendLinkStudent((s) =>
                              s ? { ...s, sending: false, error: result.message ?? 'Failed to send' } : null
                            );
                          }
                        }}
                      >
                        {sendLinkStudent.sending ? 'Sending…' : sendLinkStudent.sent ? 'Sent ✓' : 'Send'}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setSendLinkStudent(null)}>
                        Cancel
                      </Button>
                    </div>
                    {sendLinkStudent.error && (
                      <p className="text-xs text-destructive">{sendLinkStudent.error}</p>
                    )}
                    {sendLinkStudent.sent && (
                      <p className="text-xs text-green-600 dark:text-green-400">
                        Login link sent — expires in 24 hours.
                      </p>
                    )}
                  </div>
                )}
                </div>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="flex-1 space-y-1">
                    <Label htmlFor={`${slug}-email`}>Student email</Label>
                    <Input
                      id={`${slug}-email`}
                      type="email"
                      autoComplete="off"
                      placeholder="name@example.com"
                      data-testid={testId(row.name, 'email')}
                      value={emails[row.id] ?? row.login.email ?? ''}
                      onChange={(event) => {
                        const value = event.target.value;
                        emailsRef.current[row.id] = value;
                        setEmails((prev) => ({ ...prev, [row.id]: value }));
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    data-testid={testId(row.name, 'create')}
                    disabled={busy}
                    onClick={() => {
                      const email = (
                        emailsRef.current[row.id] ??
                        emails[row.id] ??
                        row.login.email ??
                        ''
                      ).trim();
                      void run(row.id, async () => {
                        const result = await onInvite(
                          row.id,
                          email.length > 0 ? email : undefined
                        );
                        setPasswords((prev) => ({ ...prev, [row.id]: result.temporaryPassword }));
                      });
                    }}
                  >
                    Create login
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
