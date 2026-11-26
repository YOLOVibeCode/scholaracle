#!/usr/bin/env node
/**
 * Push the Google Play store listing from store-metadata to Play Console, through
 * the Android Publisher API:
 *
 *   store-metadata/en-US.json (googlePlay)   title, short and full description,
 *                                            contact email, contact website
 *   store-metadata/google-play/icon.png             512 x 512
 *   store-metadata/google-play/feature-graphic.png  1024 x 500
 *   store-metadata/screenshots/google-play-phone    2 to 8 phone screenshots
 *
 * It opens one Play "edit" (a private draft of changes), replaces those fields and
 * images, asks Play to validate the edit, and commits it. If any step fails, the
 * edit is deleted and Play Console is left exactly as it was.
 *
 * It does not create or change a release, a testing group, or the countries the app
 * is sold in, and it cannot fill in the Play Console forms (app access, ads, content
 * rating, target audience, data safety): Google has no API for those.
 *
 * Required to send:
 *   GOOGLE_SERVICE_ACCOUNT_KEY_PATH — path to the Play service account JSON
 *                                     (see README, "Android Play submit credentials").
 *                                     The script never prints the key, the account's
 *                                     email, or the access token.
 *
 * `--check` validates the files and sends nothing. It needs no key.
 */
import { createSign } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LISTING_PATH = resolve(ROOT, 'store-metadata/en-US.json');
const ICON_PATH = resolve(ROOT, 'store-metadata/google-play/icon.png');
const FEATURE_GRAPHIC_PATH = resolve(ROOT, 'store-metadata/google-play/feature-graphic.png');
const SCREENSHOTS_DIR = resolve(ROOT, 'store-metadata/screenshots/google-play-phone');

const PACKAGE_NAME = process.env.PLAY_PACKAGE_NAME ?? 'com.scholarmancy.app';
const LANGUAGE = 'en-US';
const PUBLISHER = 'https://androidpublisher.googleapis.com';
const APP_PATH = `/androidpublisher/v3/applications/${PACKAGE_NAME}`;
const KEY_PATH_ENV = 'GOOGLE_SERVICE_ACCOUNT_KEY_PATH';

const CHECK_ONLY = process.argv.includes('--check');

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MB = 1024 * 1024;

function readPng(path) {
  let data;
  try {
    data = readFileSync(path);
  } catch {
    throw new Error(`Missing image: ${path}`);
  }
  if (!data.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error(`Not a PNG file: ${path}`);
  // IHDR is always the first chunk: width and height at bytes 16 to 23, colour type at byte 25.
  return {
    path,
    data,
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
    hasAlpha: [4, 6].includes(data.readUInt8(25)),
  };
}

/** Reads everything that would be sent and throws on anything Play would refuse. */
function loadListing() {
  const play = JSON.parse(readFileSync(LISTING_PATH, 'utf8')).googlePlay;
  if (!play) throw new Error('store-metadata/en-US.json has no googlePlay section.');

  const text = (name, max) => {
    const value = typeof play[name] === 'string' ? play[name].trim() : '';
    if (value.length === 0) throw new Error(`googlePlay.${name} is empty.`);
    if (value.length > max) {
      throw new Error(`googlePlay.${name} is ${value.length} characters; Play allows ${max}.`);
    }
    return value;
  };
  const title = text('title', 30);
  const shortDescription = text('shortDescription', 80);
  const fullDescription = text('fullDescription', 4000);
  const contactEmail = text('contactEmail', 254);
  const contactWebsite = text('contactWebsite', 2000);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail)) {
    throw new Error('googlePlay.contactEmail is not an email address.');
  }
  if (!contactWebsite.startsWith('https://')) {
    throw new Error('googlePlay.contactWebsite must start with https://');
  }

  const icon = readPng(ICON_PATH);
  if (icon.width !== 512 || icon.height !== 512) {
    throw new Error(`The icon must be 512 x 512; it is ${icon.width} x ${icon.height}.`);
  }
  if (icon.data.length > MB) throw new Error('The icon is over 1 MB.');

  const featureGraphic = readPng(FEATURE_GRAPHIC_PATH);
  if (featureGraphic.width !== 1024 || featureGraphic.height !== 500) {
    throw new Error(
      `The feature graphic must be 1024 x 500; it is ${featureGraphic.width} x ${featureGraphic.height}.`
    );
  }
  if (featureGraphic.hasAlpha) throw new Error('The feature graphic must have no transparency.');
  if (featureGraphic.data.length > 15 * MB) throw new Error('The feature graphic is over 15 MB.');

  const screenshots = readdirSync(SCREENSHOTS_DIR)
    .filter((name) => name.endsWith('.png'))
    .sort()
    .map((name) => readPng(resolve(SCREENSHOTS_DIR, name)));
  if (screenshots.length < 2 || screenshots.length > 8) {
    throw new Error(`Play takes 2 to 8 phone screenshots; the folder holds ${screenshots.length}.`);
  }
  for (const shot of screenshots) {
    const long = Math.max(shot.width, shot.height);
    const short = Math.min(shot.width, shot.height);
    if (short < 320 || long > 3840 || long > short * 2) {
      throw new Error(
        `Play would refuse the size of ${shot.path} (${shot.width} x ${shot.height}).`
      );
    }
    if (shot.hasAlpha) throw new Error(`Screenshot has transparency: ${shot.path}`);
    if (shot.data.length > 8 * MB) throw new Error(`Screenshot is over 8 MB: ${shot.path}`);
  }

  return {
    title,
    shortDescription,
    fullDescription,
    contactEmail,
    contactWebsite,
    icon,
    featureGraphic,
    screenshots,
  };
}

function describe(listing) {
  console.log(`ok  title              ${listing.title}`);
  console.log(`ok  short description  ${listing.shortDescription.length} characters`);
  console.log(`ok  full description   ${listing.fullDescription.length} characters`);
  console.log(`ok  contact            ${listing.contactEmail}, ${listing.contactWebsite}`);
  console.log(`ok  icon               ${listing.icon.width} x ${listing.icon.height}`);
  console.log(
    `ok  feature graphic    ${listing.featureGraphic.width} x ${listing.featureGraphic.height}`
  );
  console.log(`ok  phone screenshots  ${listing.screenshots.length}`);
}

async function accessToken(keyPath) {
  let key;
  try {
    key = JSON.parse(readFileSync(keyPath, 'utf8'));
  } catch {
    throw new Error(`Could not read the Play service account JSON named by ${KEY_PATH_ENV}.`);
  }
  const now = Math.floor(Date.now() / 1000);
  const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 600,
  })}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  const assertion = `${unsigned}.${signer.sign(key.private_key).toString('base64url')}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  // The response body can carry the token, so on failure only the status is reported.
  if (!res.ok) throw new Error(`Google refused the service account (HTTP ${res.status}).`);
  return (await res.json()).access_token;
}

/** One Play API call. Throws with Google's message, which never holds a credential. */
async function play(token, method, url, { json, png } = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(json ? { 'content-type': 'application/json' } : {}),
      ...(png ? { 'content-type': 'image/png' } : {}),
    },
    body: json ? JSON.stringify(json) : (png ?? undefined),
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const message = body?.error?.message ?? 'no message';
    const where = url.replace(PUBLISHER, '').replace(/\/edits\/[^/:]+/, '/edits/<id>');
    const hint =
      res.status === 403 && /:(validate|commit)$/.test(where) ? `\n${STORE_PRESENCE_HINT}` : '';
    throw new Error(`${method} ${where} → HTTP ${res.status}: ${message.slice(0, 400)}${hint}`);
  }
  return body;
}

/**
 * Play accepts the changes into an edit from any account that can open one, and checks
 * the account's permissions when the edit is validated or committed. An account that
 * may only publish releases is refused there (seen 26 Nov 2026).
 */
const STORE_PRESENCE_HINT =
  'The service account may not change the store listing. In Play Console → Users and ' +
  'permissions → the service account → App permissions, turn on "Manage store presence" ' +
  'for Scholarmancy, then run this again.';

async function replaceImages(token, editId, imageType, images) {
  const path = `${APP_PATH}/edits/${editId}/listings/${LANGUAGE}/${imageType}`;
  await play(token, 'DELETE', `${PUBLISHER}${path}`);
  for (const image of images) {
    await play(token, 'POST', `${PUBLISHER}/upload${path}?uploadType=media`, { png: image.data });
  }
}

async function main() {
  const listing = loadListing();
  describe(listing);
  if (CHECK_ONLY) {
    console.log('check only: nothing was sent to Google Play.');
    return;
  }

  const keyPath = process.env[KEY_PATH_ENV] ?? '';
  if (keyPath.length === 0) {
    throw new Error(
      `${KEY_PATH_ENV} is not set. Point it at the Play service account JSON, or run with --check.`
    );
  }
  const token = await accessToken(keyPath);

  const edit = await play(token, 'POST', `${PUBLISHER}${APP_PATH}/edits`, { json: {} });
  const editId = edit.id;
  const editUrl = `${PUBLISHER}${APP_PATH}/edits/${editId}`;
  console.log('ok  edit opened');
  try {
    await play(token, 'PUT', `${editUrl}/listings/${LANGUAGE}`, {
      json: {
        language: LANGUAGE,
        title: listing.title,
        shortDescription: listing.shortDescription,
        fullDescription: listing.fullDescription,
      },
    });
    console.log('ok  listing text set');

    await play(token, 'PATCH', `${editUrl}/details`, {
      json: {
        defaultLanguage: LANGUAGE,
        contactEmail: listing.contactEmail,
        contactWebsite: listing.contactWebsite,
      },
    });
    console.log('ok  contact email and website set');

    await replaceImages(token, editId, 'icon', [listing.icon]);
    console.log('ok  icon uploaded');
    await replaceImages(token, editId, 'featureGraphic', [listing.featureGraphic]);
    console.log('ok  feature graphic uploaded');
    await replaceImages(token, editId, 'phoneScreenshots', listing.screenshots);
    console.log(`ok  ${listing.screenshots.length} phone screenshots uploaded`);

    await play(token, 'POST', `${editUrl}:validate`);
    console.log('ok  Play validated the edit');
    await play(token, 'POST', `${editUrl}:commit`);
    console.log('ok  edit committed');
  } catch (err) {
    // An edit that is not committed changes nothing; delete it so none is left open.
    try {
      await play(token, 'DELETE', editUrl);
      console.error('The edit was deleted. Play Console is as it was.');
    } catch {
      console.error('The edit could not be deleted; Play drops an open edit by itself.');
    }
    throw err;
  }

  console.log('\nThe Google Play store listing is synced.');
  console.log(
    'Still to do by hand in Play Console (Google has no API for them): app access, ads, ' +
      'content rating, target audience, data safety, and the privacy policy link.'
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
