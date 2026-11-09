import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run, checkVersions, readVersions, signJwt, getAccessToken, parseArgs, SCOPE } from '../tools/publish-cws.mjs';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const KEY = { client_email: 'publisher@example.iam.gserviceaccount.com', private_key: privateKey, private_key_id: 'kid1', token_uri: 'https://oauth2.googleapis.com/token' };
const ITEM_ID = 'abcdefghijklmnopabcdefghijklmnop';
const ENV = { CWS_PUBLISHER_ID: 'pub1', CWS_ITEM_ID: ITEM_ID, CWS_SERVICE_ACCOUNT_KEY: JSON.stringify(KEY) };
const ITEM = `v2/publishers/pub1/items/${ITEM_ID}`;

/* A fake project folder holding the two version files and, unless told not to, the zip. */
const made = [];
after(() => { for (const dir of made) fs.rmSync(dir, { recursive: true, force: true }); });
function project(version = '1.3.0', { zip = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cws-'));
  made.push(dir);
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ version }));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version }));
  if (zip) {
    fs.mkdirSync(path.join(dir, 'dist'));
    fs.writeFileSync(path.join(dir, 'dist', `dark-mode-for-power-platform-${version}.zip`), 'PK fake zip');
  }
  return dir;
}

/* fetch stand-in: routes are "METHOD /path" -> body, [status, body] or (callIndex, init) => either. */
function fakeFetch(routes) {
  const calls = [];
  const counts = {};
  const fetch = async (url, init = {}) => {
    const route = `${init.method} ${new URL(url).pathname.replace(/^\//, '')}`;
    calls.push({ route, url, init });
    if (!(route in routes)) throw new Error(`unexpected request ${route}`);
    counts[route] = (counts[route] ?? 0) + 1;
    const answer = typeof routes[route] === 'function' ? routes[route](counts[route], init) : routes[route];
    const [status, body] = Array.isArray(answer) ? answer : [200, answer];
    return { ok: status >= 200 && status < 300, status, statusText: '', text: async () => JSON.stringify(body) };
  };
  fetch.calls = calls;
  fetch.routes = () => calls.map((c) => c.route);
  return fetch;
}

const token = { 'POST token': { access_token: 'tok', expires_in: 3600 } };
const quiet = { log: () => {}, sleep: async () => {} };

test('every place the version is written carries the same version', () => {
  const { manifest, pkg } = readVersions(repoRoot);
  assert.equal(pkg, manifest, 'package.json');
  const read = (file) => fs.readFileSync(path.join(repoRoot, file), 'utf8');
  assert.equal(read('src/content/00-namespace.js').match(/CAPD\.VERSION = '([^']+)'/)[1], manifest, 'CAPD.VERSION');
  assert.equal(read('src/options/options.html').match(/<span id="version">([^<]+)<\/span>/)[1], manifest, 'options page');
});

test('the tag, manifest and package versions must agree', () => {
  assert.equal(checkVersions({ manifest: '1.3.0', pkg: '1.3.0' }, 'v1.3.0'), '1.3.0');
  assert.equal(checkVersions({ manifest: '1.3.0', pkg: '1.3.0' }), '1.3.0');
  assert.throws(() => checkVersions({ manifest: '1.3.0', pkg: '1.3.0' }, 'v1.3.1'), /tag v1\.3\.1 does not match/);
  assert.throws(() => checkVersions({ manifest: '1.3.0', pkg: '1.2.1' }, 'v1.3.0'), /package\.json says 1\.2\.1/);
});

test('the service-account JWT is RS256-signed by the key and asks for the store scope', () => {
  const jwt = signJwt(KEY, 1_000_000);
  const [h, c, s] = jwt.split('.');
  const header = JSON.parse(Buffer.from(h, 'base64url'));
  const claims = JSON.parse(Buffer.from(c, 'base64url'));
  assert.deepEqual(header, { alg: 'RS256', typ: 'JWT', kid: 'kid1' });
  assert.deepEqual(claims, { iss: KEY.client_email, scope: SCOPE, aud: KEY.token_uri, iat: 1_000_000, exp: 1_003_600 });
  assert.ok(crypto.verify('sha256', Buffer.from(`${h}.${c}`), publicKey, Buffer.from(s, 'base64url')));
});

test('the key is exchanged for a token; a ready token skips the exchange', async () => {
  const fetch = fakeFetch(token);
  assert.equal(await getAccessToken(ENV, fetch, 1_000_000), 'tok');
  const form = new URLSearchParams(String(fetch.calls[0].init.body));
  assert.equal(form.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  assert.equal(form.get('assertion'), signJwt(KEY, 1_000_000));

  const none = fakeFetch({});
  assert.equal(await getAccessToken({ CWS_ACCESS_TOKEN: ' ready \n' }, none), 'ready');
  assert.equal(none.calls.length, 0);
  await assert.rejects(getAccessToken({}, none), /set CWS_SERVICE_ACCOUNT_KEY/);
  await assert.rejects(getAccessToken({ CWS_SERVICE_ACCOUNT_KEY: '{"type":"x"}' }, none), /no client_email/);
});

test('publish: upload, wait while the store processes it, then submit for review', async () => {
  let statusCalls = 0;
  const fetch = fakeFetch({
    ...token,
    [`GET ${ITEM}:fetchStatus`]: () => (++statusCalls === 1
      ? { itemId: 'item1', publishedItemRevisionStatus: { state: 'PUBLISHED', distributionChannels: [{ crxVersion: '1.2.1', deployPercentage: 100 }] } }
      : { lastAsyncUploadState: statusCalls === 2 ? 'IN_PROGRESS' : 'SUCCEEDED' }),
    [`POST upload/${ITEM}:upload`]: { itemId: 'item1', uploadState: 'IN_PROGRESS' },
    [`POST ${ITEM}:publish`]: { itemId: 'item1', state: 'PENDING_REVIEW' },
  });
  const result = await run({ rootDir: project(), tag: 'v1.3.0', env: ENV, fetch, ...quiet });
  assert.equal(result.state, 'PENDING_REVIEW');
  assert.deepEqual(fetch.routes(), [
    'POST token', `GET ${ITEM}:fetchStatus`, `POST upload/${ITEM}:upload`,
    `GET ${ITEM}:fetchStatus`, `GET ${ITEM}:fetchStatus`, `POST ${ITEM}:publish`,
  ]);
  const upload = fetch.calls[2].init;
  assert.equal(upload.headers.Authorization, 'Bearer tok');
  assert.equal(String(upload.body), 'PK fake zip');
  assert.deepEqual(JSON.parse(fetch.calls[5].init.body), { publishType: 'DEFAULT_PUBLISH' });
});

test('--staged asks the store to hold the approved version for a manual publish', async () => {
  const fetch = fakeFetch({
    ...token,
    [`GET ${ITEM}:fetchStatus`]: { itemId: 'item1' },
    [`POST upload/${ITEM}:upload`]: { uploadState: 'SUCCEEDED', crxVersion: '1.3.0' },
    [`POST ${ITEM}:publish`]: { state: 'PENDING_REVIEW' },
  });
  await run({ mode: 'staged', rootDir: project(), env: ENV, fetch, ...quiet });
  assert.deepEqual(JSON.parse(fetch.calls.at(-1).init.body), { publishType: 'STAGED_PUBLISH' });
});

test('--status reads and never uploads, and needs no zip', async () => {
  const fetch = fakeFetch({ ...token, [`GET ${ITEM}:fetchStatus`]: { itemId: 'item1' } });
  const lines = [];
  await run({ mode: 'status', rootDir: project('1.3.0', { zip: false }), env: ENV, fetch, log: (l) => lines.push(l) });
  assert.deepEqual(fetch.routes(), ['POST token', `GET ${ITEM}:fetchStatus`]);
  assert.match(lines.join('\n'), /published: none/);
});

test('refuses before uploading when a submission is in review or the version is already live', async () => {
  for (const [status, why] of [
    [{ submittedItemRevisionStatus: { state: 'PENDING_REVIEW' } }, /already in review/],
    [{ publishedItemRevisionStatus: { state: 'PUBLISHED', distributionChannels: [{ crxVersion: '1.3.0', deployPercentage: 100 }] } }, /already published/],
  ]) {
    const fetch = fakeFetch({ ...token, [`GET ${ITEM}:fetchStatus`]: status });
    await assert.rejects(run({ rootDir: project(), env: ENV, fetch, ...quiet }), why);
    assert.ok(!fetch.routes().some((r) => r.includes(':upload')));
  }
});

test('a failed upload, a wrong version or an HTTP error stops before submitting', async () => {
  const cases = [
    [{ uploadState: 'FAILED' }, /upload failed \(FAILED\)/],
    [{ uploadState: 'SUCCEEDED', crxVersion: '1.2.9' }, /read version 1\.2\.9/],
    [[400, { error: { code: 400, message: 'Version must be greater than published' } }], /HTTP 400: Version must be greater than published/],
  ];
  for (const [answer, why] of cases) {
    const fetch = fakeFetch({ ...token, [`GET ${ITEM}:fetchStatus`]: {}, [`POST upload/${ITEM}:upload`]: answer });
    await assert.rejects(run({ rootDir: project(), env: ENV, fetch, ...quiet }), why);
    assert.ok(!fetch.routes().some((r) => r.endsWith(':publish')));
  }
});

test('checks the inputs before touching the network', async () => {
  const fetch = fakeFetch({});
  await assert.rejects(run({ rootDir: project('1.3.0', { zip: false }), env: ENV, fetch, ...quiet }), /run npm run package first/);
  await assert.rejects(run({ rootDir: project(), env: { CWS_ITEM_ID: 'x' }, fetch, ...quiet }), /set CWS_PUBLISHER_ID/);
  await assert.rejects(run({ rootDir: project(), tag: 'v9.9.9', env: ENV, fetch, ...quiet }), /does not match/);
  // A service-account key ID (40 hex digits) is not an item ID.
  await assert.rejects(run({ rootDir: project(), env: { ...ENV, CWS_ITEM_ID: '0123456789abcdef0123456789abcdef01234567' }, fetch, ...quiet }), /32-letter ID/);
  assert.equal(fetch.calls.length, 0);
  assert.deepEqual(parseArgs(['--staged', '--tag', 'v1.3.0']), { mode: 'staged', tag: 'v1.3.0' });
  assert.throws(() => parseArgs(['--tag']), /needs a value/);
  assert.throws(() => parseArgs(['--force']), /unknown argument/);
});
