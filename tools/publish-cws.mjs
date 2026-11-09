#!/usr/bin/env node
/*
 * Publishes the packaged extension through the Chrome Web Store API (v2):
 * uploads dist/dark-mode-for-power-platform-<version>.zip to the existing
 * store item and submits it for review.
 *
 *   node tools/publish-cws.mjs            upload and submit; goes live once approved
 *   node tools/publish-cws.mjs --staged   upload and submit; once approved, waits for
 *                                         you to press Publish in the dashboard
 *   node tools/publish-cws.mjs --status   read only: checks the credentials and IDs and
 *                                         prints what is published and what is submitted
 *   --tag v1.3.0                          refuses unless the tag names manifest.json's
 *                                         version (the release workflow passes it)
 *
 * Environment (setup steps: CHROMEWEBSTORE.md, "Automated publishing"):
 *   CWS_PUBLISHER_ID         Developer Dashboard > Publisher > Settings
 *   CWS_ITEM_ID              the 32-letter ID in the item's store URL
 *   CWS_SERVICE_ACCOUNT_KEY  the service account's JSON key, the whole file as text
 *   CWS_ACCESS_TOKEN         or a ready token instead of the key, for example from
 *                            gcloud auth print-access-token --impersonate-service-account=<email>
 *                              --scopes=https://www.googleapis.com/auth/chromewebstore
 *
 * The API cannot edit the store listing or the Privacy practices tab. When a
 * release adds a permission, enter its justification in the dashboard first.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const API = 'https://chromewebstore.googleapis.com';
export const SCOPE = 'https://www.googleapis.com/auth/chromewebstore';
const TOKEN_URI = 'https://oauth2.googleapis.com/token';
const zipName = (version) => `dark-mode-for-power-platform-${version}.zip`;

export function readVersions(rootDir) {
  const read = (file) => JSON.parse(fs.readFileSync(path.join(rootDir, file), 'utf8')).version;
  return { manifest: read('manifest.json'), pkg: read('package.json') };
}

/* The version being released, or an error saying which of the three disagrees. */
export function checkVersions({ manifest, pkg }, tag) {
  if (manifest !== pkg) throw new Error(`manifest.json says ${manifest} but package.json says ${pkg}; bump both`);
  if (tag && tag.replace(/^v/, '') !== manifest) throw new Error(`tag ${tag} does not match manifest.json version ${manifest}`);
  return manifest;
}

const b64url = (value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');

/* A self-signed JWT for Google's service-account token exchange (RS256). */
export function signJwt(key, nowSeconds = Math.floor(Date.now() / 1000)) {
  const header = b64url({ alg: 'RS256', typ: 'JWT', ...(key.private_key_id ? { kid: key.private_key_id } : {}) });
  const claims = b64url({ iss: key.client_email, scope: SCOPE, aud: key.token_uri || TOKEN_URI, iat: nowSeconds, exp: nowSeconds + 3600 });
  const signature = crypto.sign('sha256', Buffer.from(`${header}.${claims}`), key.private_key).toString('base64url');
  return `${header}.${claims}.${signature}`;
}

/* One HTTP call; a non-2xx answer becomes an error carrying Google's own message. */
async function call(fetchImpl, method, url, { token, body, headers = {}, timeoutMs = 60_000 } = {}) {
  const res = await fetchImpl(url, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!res.ok) {
    const why = json.error?.message || json.error_description || json.error || text || res.statusText;
    throw new Error(`${method} ${url.replace(API, '')} failed with HTTP ${res.status}: ${typeof why === 'string' ? why : JSON.stringify(why)}`);
  }
  return json;
}

export async function getAccessToken(env, fetchImpl, nowSeconds) {
  if (env.CWS_ACCESS_TOKEN) return env.CWS_ACCESS_TOKEN.trim();
  if (!env.CWS_SERVICE_ACCOUNT_KEY) throw new Error('set CWS_SERVICE_ACCOUNT_KEY (the service account JSON key) or CWS_ACCESS_TOKEN');
  let key;
  try { key = JSON.parse(env.CWS_SERVICE_ACCOUNT_KEY); } catch { throw new Error('CWS_SERVICE_ACCOUNT_KEY is not valid JSON; paste the whole key file'); }
  if (!key.client_email || !key.private_key) throw new Error('CWS_SERVICE_ACCOUNT_KEY has no client_email or private_key; use a service account key file');
  const body = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: signJwt(key, nowSeconds) });
  const json = await call(fetchImpl, 'POST', key.token_uri || TOKEN_URI, { body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  if (!json.access_token) throw new Error('the token endpoint returned no access_token');
  return json.access_token;
}

export function describe(status) {
  const revision = (label, r) => `${label}: ${r ? r.state + (r.distributionChannels ?? []).map((c) => ` ${c.crxVersion} (${c.deployPercentage}%)`).join(',') : 'none'}`;
  return [
    `item ${status.itemId}`,
    revision('published', status.publishedItemRevisionStatus),
    revision('submitted', status.submittedItemRevisionStatus),
    ...(status.takenDown ? ['TAKEN DOWN for a policy violation'] : []),
    ...(status.warned ? ['WARNED for a policy violation; fix it before it is taken down'] : []),
  ].join('\n');
}

const inProgress = (state) => state === 'IN_PROGRESS' || state === 'UPLOAD_IN_PROGRESS';

export async function run({
  mode = 'publish', tag, rootDir, env = process.env, fetch: fetchImpl = globalThis.fetch, log = console.log,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), pollMs = 5_000, pollTries = 36,
}) {
  const version = checkVersions(readVersions(rootDir), tag);
  for (const name of ['CWS_PUBLISHER_ID', 'CWS_ITEM_ID']) if (!env[name]) throw new Error(`set ${name}`);
  if (!/^[a-p]{32}$/.test(env.CWS_ITEM_ID)) {
    throw new Error(`CWS_ITEM_ID must be the item's 32-letter ID (letters a to p), as in its dashboard and store addresses; got ${env.CWS_ITEM_ID.length} characters starting ${env.CWS_ITEM_ID.slice(0, 6)}`);
  }
  const zip = path.join(rootDir, 'dist', zipName(version));
  if (mode !== 'status' && !fs.existsSync(zip)) throw new Error(`dist/${zipName(version)} not found; run npm run package first`);

  const name = `publishers/${encodeURIComponent(env.CWS_PUBLISHER_ID)}/items/${encodeURIComponent(env.CWS_ITEM_ID)}`;
  const item = `${API}/v2/${name}`;
  const token = await getAccessToken(env, fetchImpl);
  const status = await call(fetchImpl, 'GET', `${item}:fetchStatus`, { token });
  log(describe(status));
  if (mode === 'status') return status;

  if (status.submittedItemRevisionStatus?.state === 'PENDING_REVIEW') {
    throw new Error('a submission is already in review; wait for it to finish, or cancel it in the dashboard, then run this again');
  }
  const live = status.publishedItemRevisionStatus?.distributionChannels ?? [];
  if (live.some((c) => c.crxVersion === version)) throw new Error(`${version} is already published; bump the version in manifest.json and package.json`);

  const bytes = fs.readFileSync(zip);
  log(`uploading dist/${zipName(version)} (${(bytes.length / 1024).toFixed(1)} KB)`);
  const upload = await call(fetchImpl, 'POST', `${API}/upload/v2/${name}:upload`, {
    token, body: bytes, headers: { 'Content-Type': 'application/zip' }, timeoutMs: 300_000,
  });
  let state = upload.uploadState;
  for (let i = 0; inProgress(state) && i < pollTries; i++) {
    await sleep(pollMs);
    state = (await call(fetchImpl, 'GET', `${item}:fetchStatus`, { token })).lastAsyncUploadState;
  }
  if (inProgress(state)) throw new Error(`the store was still processing the upload after ${(pollTries * pollMs) / 1000} s; check the dashboard, then submit from there`);
  if (state !== 'SUCCEEDED') throw new Error(`the upload failed (${state}): ${JSON.stringify(upload)}`);
  if (upload.crxVersion && upload.crxVersion !== version) throw new Error(`the store read version ${upload.crxVersion} from the package, expected ${version}`);

  const publishType = mode === 'staged' ? 'STAGED_PUBLISH' : 'DEFAULT_PUBLISH';
  const result = await call(fetchImpl, 'POST', `${item}:publish`, {
    token, body: JSON.stringify({ publishType }), headers: { 'Content-Type': 'application/json' },
  });
  for (const w of result.warningInfo?.warnings ?? []) log(`warning: ${w.reason}: ${w.description}`);
  log(`submitted ${version} for review (${result.state}); ${mode === 'staged'
    ? 'once approved, publish it from the dashboard within 30 days'
    : 'it goes live when approved'}`);
  return result;
}

export function parseArgs(argv) {
  const out = { mode: 'publish' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--status') out.mode = 'status';
    else if (arg === '--staged') out.mode = 'staged';
    else if (arg === '--tag') {
      out.tag = argv[++i];
      if (!out.tag) throw new Error('--tag needs a value, such as v1.3.0');
    } else throw new Error(`unknown argument ${arg}`);
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  try {
    await run({ ...parseArgs(process.argv.slice(2)), rootDir });
  } catch (err) {
    console.error(`publish-cws: ${err.message}`);
    process.exitCode = 1;
  }
}
