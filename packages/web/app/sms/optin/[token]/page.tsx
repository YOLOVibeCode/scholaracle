'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SmsOptInCheckbox } from '@/components/legal/SmsOptInCheckbox';
import { smsOptInApi, type ISmsOptInInviteView } from '@/lib/api/smsOptIn';
import {
  SCHOLARMANCY_SMS_SUPPORT_EMAIL,
  SMS_CONSENT_REQUIRED_MESSAGE,
} from '@scholaracle/contracts';

type LoadState = { kind: 'loading' } | { kind: 'expired' } | { kind: 'ready'; invite: ISmsOptInInviteView };

function useInvite(token: string): LoadState {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  useEffect(() => {
    let isActive = true;
    smsOptInApi
      .get(token)
      .then((invite) => isActive && setState({ kind: 'ready', invite }))
      .catch(() => isActive && setState({ kind: 'expired' }));
    return () => {
      isActive = false;
    };
  }, [token]);
  return state;
}

function OptInForm({ token, invite, onDone }: {
  readonly token: string;
  readonly invite: ISmsOptInInviteView;
  readonly onDone: () => void;
}) {
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    if (!consent) {
      setError(SMS_CONSENT_REQUIRED_MESSAGE);
      return;
    }
    setIsSaving(true);
    try {
      await smsOptInApi.submit(token, phone, true);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" data-testid="sms-optin-form">
      <div className="space-y-1">
        <Label htmlFor="sms-optin-phone">Your mobile number (US)</Label>
        <Input id="sms-optin-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
          required disabled={isSaving} data-testid="sms-optin-phone" />
        {invite.numberEnding && (
          <p className="text-xs text-gray-500">
            Use the number ending in {invite.numberEnding} that {invite.inviterName} added.
          </p>
        )}
      </div>
      <SmsOptInCheckbox checked={consent} onChange={setConsent} disabled={isSaving} id="sms-optin-consent" />
      {error && <p className="text-sm text-red-600" role="alert" data-testid="sms-optin-error">{error}</p>}
      <Button type="submit" disabled={isSaving} data-testid="sms-optin-submit">
        Opt in to texts
      </Button>
    </form>
  );
}

function InviteBody({ token, invite }: { readonly token: string; readonly invite: ISmsOptInInviteView }) {
  const [isDone, setIsDone] = useState(false);
  if (isDone) {
    return (
      <p data-testid="sms-optin-done">
        You&apos;re opted in. We sent one text to confirm. Reply STOP any time to stop, or HELP for help.
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <p>
        {invite.inviterName} added you to a student on Scholarmancy. If you want, Scholarmancy can text
        you grade and assignment alerts for that student and sign-in links for your account. Texts are
        optional; you&apos;ll still get email if you skip this.
      </p>
      <OptInForm token={token} invite={invite} onDone={() => setIsDone(true)} />
    </div>
  );
}

export default function SmsContactOptInPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? '';
  const state = useInvite(token);
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="mx-auto max-w-xl px-4 py-12">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Get Scholarmancy texts</CardTitle>
            <CardDescription>Scholarmancy is operated by Noctusoft, Inc. (https://noctusoft.com)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
            {state.kind === 'loading' && <p>Loading…</p>}
            {state.kind === 'expired' && (
              <p data-testid="sms-optin-expired">
                This link has expired or was already used. Ask the parent who invited you for a new one.
              </p>
            )}
            {state.kind === 'ready' && <InviteBody token={token} invite={state.invite} />}
            <p className="text-xs text-gray-500">
              Every message starts with &quot;Scholarmancy:&quot;. Message frequency varies. Message and data
              rates may apply. Support: {SCHOLARMANCY_SMS_SUPPORT_EMAIL}.{' '}
              <Link href="/sms" className="underline">How Scholarmancy texts work</Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
