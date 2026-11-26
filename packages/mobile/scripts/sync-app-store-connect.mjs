#!/usr/bin/env node
/**
 * Push TestFlight "Test Information" from store-metadata/testflight.json
 * via the App Store Connect API. This is the form Apple requires before
 * an external TestFlight link can be generated.
 *
 * The review sign-in (the demo parent Apple's reviewer signs in as):
 *   DEMO_ACCOUNT_PASSWORD — the demo parent's password on the production API
 *                       (the API variable of the same name). It is not in any
 *                       tracked file. To set or change the sign-in, read it
 *                       from the vault for this one run:
 *                         opx run --env-file <file with DEMO_ACCOUNT_PASSWORD=op://…> \
 *                           --reason "TestFlight review sign-in" -- pnpm sync:testflight
 *                       The script never prints it. Without the variable, the
 *                       sign-in already on App Store Connect is left as it is.
 *
 * Required:
 *   ASC_API_KEY_PATH  — path to AuthKey_*.p8 (or ASC_API_KEY = PEM contents)
 *   ASC_KEY_ID        — default RA29BTM8KJ
 *   ASC_ISSUER_ID     — default from eas.json
 *   ASC_APP_ID        — default 6798499288
 *
 * Optional (fills Beta App Review contact; Apple will not let you Save
 * in the UI without these, and review submission needs them):
 *   ASC_CONTACT_FIRST_NAME
 *   ASC_CONTACT_LAST_NAME
 *   ASC_CONTACT_PHONE
 *   ASC_CONTACT_EMAIL  — defaults to apple@darkware.net
 *
 * `--check` validates the inputs and sends nothing.
 */
import { createPrivateKey, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const META_PATH = resolve(ROOT, 'store-metadata/testflight.json');
const LOCAL_DEMO_LOGIN_PATH = resolve(ROOT, 'src/demo/demoLogin.ts');

const KEY_ID = process.env.ASC_KEY_ID ?? 'RA29BTM8KJ';
const ISSUER_ID = process.env.ASC_ISSUER_ID ?? '69a6de75-883e-47e3-e053-5b8c7c11a4d1';
const APP_ID = process.env.ASC_APP_ID ?? '6798499288';
const ASC_API = 'https://api.appstoreconnect.apple.com';

const CHECK_ONLY = process.argv.includes('--check');
const PASSWORD_ENV = 'DEMO_ACCOUNT_PASSWORD';
/** The API ignores a shorter DEMO_ACCOUNT_PASSWORD (demoSignInRepair.ts). */
const PASSWORD_MIN_LENGTH = 12;

/** The documented demo password for a developer machine. The live server does not accept it. */
function localDemoPassword() {
  try {
    const source = readFileSync(LOCAL_DEMO_LOGIN_PATH, 'utf8');
    return /DEMO_PASSWORD\s*=\s*'([^']+)'/.exec(source)?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * The password Apple's reviewer signs in with, from the environment, or null when none
 * is given. With null the sign-in already on App Store Connect is left as it is, so a
 * build that runs this script at its end never replaces a working sign-in.
 * Throws on a value that cannot work, without ever putting the value in the message.
 */
function reviewPassword(meta) {
  if ('demoAccountPassword' in meta) {
    throw new Error(
      'store-metadata/testflight.json must not hold a password. Remove demoAccountPassword; ' +
        `the script reads ${PASSWORD_ENV} from the environment.`
    );
  }
  const value = process.env[PASSWORD_ENV] ?? '';
  if (value.length === 0) return null;
  if (value.length < PASSWORD_MIN_LENGTH) {
    throw new Error(
      `${PASSWORD_ENV} is shorter than ${PASSWORD_MIN_LENGTH} characters. The production API ` +
        'ignores a demo password that short, so the reviewer could not sign in. Read the ' +
        'real one from the vault for this run (see the top of this file).'
    );
  }
  if (value === localDemoPassword()) {
    throw new Error(
      `${PASSWORD_ENV} is the documented local demo password. The production API does not ` +
        'accept it, so the reviewer could not sign in. Use the private one from the vault.'
    );
  }
  return value;
}

function loadKeyPem() {
  if (process.env.ASC_API_KEY && process.env.ASC_API_KEY.includes('BEGIN')) {
    return process.env.ASC_API_KEY;
  }
  const fromEnv = process.env.ASC_API_KEY_PATH;
  const fallback = resolve(ROOT, '../../AuthKey_RA29BTM8KJ.p8');
  const path = fromEnv && fromEnv.length > 0 ? fromEnv : fallback;
  try {
    return readFileSync(path, 'utf8');
  } catch {
    throw new Error(`ASC API key not found at ${path}. Set ASC_API_KEY_PATH or ASC_API_KEY.`);
  }
}

function makeJwt(pem) {
  const header = { alg: 'ES256', kid: KEY_ID, typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: ISSUER_ID,
    iat: now,
    exp: now + 19 * 60,
    aud: 'appstoreconnect-v1',
  };
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const unsigned = `${b64(header)}.${b64(payload)}`;
  const key = createPrivateKey(pem);
  const sig = sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' });
  return `${unsigned}.${sig.toString('base64url')}`;
}

async function asc(jwt, method, path, body) {
  const res = await fetch(`${ASC_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const detail = JSON.stringify(json?.errors ?? json, null, 2);
    throw new Error(`${method} ${path} → ${res.status}\n${detail}`);
  }
  return json;
}

async function main() {
  const meta = JSON.parse(readFileSync(META_PATH, 'utf8'));
  const password = reviewPassword(meta);
  const signIn =
    password === null
      ? `left as it is on App Store Connect (${PASSWORD_ENV} is not set)`
      : `${meta.demoAccountName}, password from ${PASSWORD_ENV} (${password.length} characters)`;
  console.log(`ok  review sign-in: ${signIn}`);
  if (CHECK_ONLY) {
    console.log('check only: nothing was sent to App Store Connect.');
    return;
  }

  const jwt = makeJwt(loadKeyPem());

  const urls = [meta.privacyPolicyUrl, meta.marketingUrl, meta.supportUrl];
  for (const url of urls) {
    const res = await fetch(url, { method: 'GET', redirect: 'follow' });
    if (!res.ok) {
      throw new Error(`Store URL ${url} returned ${res.status} — App Review will reject this.`);
    }
    console.log(`ok  ${res.status}  ${url}`);
  }

  const locs = await asc(jwt, 'GET', `/v1/apps/${APP_ID}/betaAppLocalizations`);
  let loc = (locs.data ?? []).find((row) => row.attributes?.locale === 'en-US') ?? locs.data?.[0];
  if (!loc) {
    const created = await asc(jwt, 'POST', '/v1/betaAppLocalizations', {
      data: {
        type: 'betaAppLocalizations',
        attributes: {
          locale: 'en-US',
          description: meta.betaDescription,
          feedbackEmail: meta.feedbackEmail,
          marketingUrl: meta.marketingUrl,
          privacyPolicyUrl: meta.privacyPolicyUrl,
        },
        relationships: {
          app: { data: { type: 'apps', id: APP_ID } },
        },
      },
    });
    loc = created.data;
    console.log('ok  betaAppLocalizations (en-US) created');
  } else {
    await asc(jwt, 'PATCH', `/v1/betaAppLocalizations/${loc.id}`, {
      data: {
        type: 'betaAppLocalizations',
        id: loc.id,
        attributes: {
          description: meta.betaDescription,
          feedbackEmail: meta.feedbackEmail,
          marketingUrl: meta.marketingUrl,
          privacyPolicyUrl: meta.privacyPolicyUrl,
        },
      },
    });
    console.log('ok  betaAppLocalizations (en-US) updated');
  }

  const review = await asc(jwt, 'GET', `/v1/apps/${APP_ID}/betaAppReviewDetail`);
  const reviewId = review.data?.id;
  if (!reviewId) throw new Error('No betaAppReviewDetail on this app');

  const first = process.env.ASC_CONTACT_FIRST_NAME;
  const last = process.env.ASC_CONTACT_LAST_NAME;
  const phone = process.env.ASC_CONTACT_PHONE;
  const email = process.env.ASC_CONTACT_EMAIL ?? 'apple@darkware.net';
  const hasContact = Boolean(first && last && phone);

  // The notes go up every time. The sign-in goes up only when DEMO_ACCOUNT_PASSWORD is
  // given, and the reviewer contact only when all three contact values are given.
  // What is not sent stays as it is on App Store Connect.
  const attributes = {
    demoAccountRequired: Boolean(meta.demoAccountRequired),
    notes: meta.reviewNotes,
    ...(password === null
      ? {}
      : { demoAccountName: meta.demoAccountName, demoAccountPassword: password }),
    ...(hasContact
      ? {
          contactEmail: email,
          contactFirstName: first,
          contactLastName: last,
          contactPhone: phone,
        }
      : {}),
  };
  await asc(jwt, 'PATCH', `/v1/betaAppReviewDetails/${reviewId}`, {
    data: { type: 'betaAppReviewDetails', id: reviewId, attributes },
  });
  const sent = [
    'notes',
    ...(password === null ? [] : ['sign-in']),
    ...(hasContact ? ['contact'] : []),
  ];
  console.log(`ok  betaAppReviewDetail updated (${sent.join(' + ')})`);
  if (password === null) {
    console.log(`    sign-in left as it is: set ${PASSWORD_ENV} from the vault to change it.`);
  }
  if (!hasContact) {
    console.log(
      '    reviewer contact left as it is: set ASC_CONTACT_FIRST_NAME, ASC_CONTACT_LAST_NAME and ASC_CONTACT_PHONE to change it.'
    );
  }

  console.log('\nTestFlight Test Information is synced.');
  console.log(
    'Next: App Store Connect → TestFlight → External group → add build → Submit for Review.'
  );
  console.log('After Apple approves the beta, enable a public link on that group.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
