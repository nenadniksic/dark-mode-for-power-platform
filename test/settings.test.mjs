import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
require('../src/shared/settings.js');
require('../src/content/00-namespace.js');
const CAPD = globalThis.CAPD;

test('SharePoint is opt-in and normalised to a boolean', () => {
  assert.equal(CAPD.settings.DEFAULTS.sharePoint, false);
  assert.equal(CAPD.settings.normalize({}).sharePoint, false);
  assert.equal(CAPD.settings.normalize({ sharePoint: 1 }).sharePoint, true);
  assert.equal(CAPD.settings.normalize({ sharePoint: 'yes', makerPortal: 0 }).makerPortal, false);
});

test('SharePoint hosts, in every cloud, and not OneDrive', () => {
  const is = CAPD.sharePoint.isHost;
  for (const h of ['contoso.sharepoint.com', 'contoso-admin.sharepoint.com', 'agency.sharepoint.us', 'army.sharepoint-mil.us', 'contoso.sharepoint.cn', 'CONTOSO.SharePoint.com']) assert.ok(is(h), h);
  for (const h of ['contoso-my.sharepoint.com', 'sharepointonline.com', 'static2.sharepointonline.com', 'make.powerapps.com', 'sharepoint.com.evil.example', 'evilsharepoint.com']) assert.ok(!is(h), h);
});

test('the SharePoint origins are the manifest\'s optional host permissions, and nothing is requested up front', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
  assert.deepEqual([...CAPD.sharePoint.ORIGINS].sort(), [...manifest.optional_host_permissions].sort());
  for (const o of CAPD.sharePoint.ORIGINS) {
    assert.ok(!manifest.host_permissions.includes(o), `${o} must stay optional`);
    for (const cs of manifest.content_scripts) assert.ok(!cs.matches.includes(o), `${o} is registered at run time, not declared`);
  }
  assert.ok(manifest.permissions.includes('scripting'));
  assert.ok(manifest.description.length <= 132, 'store limit');
});

test('without extension APIs the switch helpers do nothing and report no access', async () => {
  assert.equal(await CAPD.sharePoint.granted(), false);
  assert.equal(await CAPD.sharePoint.enable(), false);
});

test('FluentProvider creation order: Power Apps numbers, React useId (SharePoint) base-32 ids', () => {
  const o = CAPD.providerOrder;
  assert.equal(o('fui-FluentProvider1'), 1);
  assert.equal(o('fui-FluentProvider12'), 12);
  assert.equal(o('fui-FluentProviderr0'), 0);
  assert.equal(o('fui-FluentProviderrd'), 13);
  assert.equal(o('fui-FluentProviderr1f'), 47);
  assert.equal(o('fui-FluentProvider:r3:'), 3);
  assert.ok(o('fui-FluentProviderr0') < o('fui-FluentProviderr7'), 'the page-chrome provider (r0) outranks a nested one');
  assert.equal(o('something-else'), Number.MAX_SAFE_INTEGER);
});
