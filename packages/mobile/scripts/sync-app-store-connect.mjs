#!/usr/bin/env node
/**
 * Push TestFlight "Test Information" from store-metadata/testflight.json
 * via the App Store Connect API. This is the form Apple requires before
 * an external TestFlight link can be generated.
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
 */
import { createPrivateKey, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const META_PATH = resolve(ROOT, 'store-metadata/testflight.json');

const KEY_ID = process.env.ASC_KEY_ID ?? 'RA29BTM8KJ';
const ISSUER_ID = process.env.ASC_ISSUER_ID ?? '69a6de75-883e-47e3-e053-5b8c7c11a4d1';
const APP_ID = process.env.ASC_APP_ID ?? '6798499288';
const ASC_API = 'https://api.appstoreconnect.apple.com';

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
    throw new Error(
      `ASC API key not found at ${path}. Set ASC_API_KEY_PATH or ASC_API_KEY.`
    );
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

  if (!first || !last || !phone) {
    console.log('skip betaAppReviewDetail — set ASC_CONTACT_FIRST_NAME, ASC_CONTACT_LAST_NAME, ASC_CONTACT_PHONE to fill Apple reviewer contact + demo login in one shot.');
    console.log('  Demo parent (paste into Sign-in Information):');
    console.log(`    ${meta.demoAccountName} / ${meta.demoAccountPassword}`);
  } else {
    await asc(jwt, 'PATCH', `/v1/betaAppReviewDetails/${reviewId}`, {
      data: {
        type: 'betaAppReviewDetails',
        id: reviewId,
        attributes: {
          demoAccountName: meta.demoAccountName,
          demoAccountPassword: meta.demoAccountPassword,
          demoAccountRequired: Boolean(meta.demoAccountRequired),
          notes: meta.reviewNotes,
          contactEmail: email,
          contactFirstName: first,
          contactLastName: last,
          contactPhone: phone,
        },
      },
    });
    console.log('ok  betaAppReviewDetail updated (contact + demo account + notes)');
  }

  console.log('\nTestFlight Test Information is synced.');
  console.log('Next: App Store Connect → TestFlight → External group → add build → Submit for Review.');
  console.log('After Apple approves the beta, enable a public link on that group.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
