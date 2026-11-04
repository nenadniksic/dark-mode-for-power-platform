/*
 * Where a switch by hand under a schedule is kept: in this computer's
 * chrome.storage.local, beside the synced settings, read back as one settings
 * object, and cleared by a new appearance or the master switch.  Runs
 * src/shared/settings.js against a stub of chrome.storage.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

process.env.TZ = 'Europe/Belgrade';
const require = createRequire(import.meta.url);

/* ---- chrome.storage: sync and local areas, with change events ----------- */
const stores = { sync: new Map(), local: new Map() };
const writes = { sync: 0, local: 0 };
const changeListeners = [];
const copy = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
function area(name) {
  return {
    async get(key) { return stores[name].has(key) ? { [key]: copy(stores[name].get(key)) } : {}; },
    async set(obj) {
      writes[name]++;
      const changes = {};
      for (const [k, v] of Object.entries(obj)) {
        const old = stores[name].get(k);
        if (JSON.stringify(old) === JSON.stringify(v)) continue; // Chrome reports real changes only
        stores[name].set(k, copy(v));
        changes[k] = { oldValue: copy(old), newValue: copy(v) };
      }
      if (Object.keys(changes).length) setTimeout(() => changeListeners.forEach((fn) => fn(changes, name)));
    },
  };
}
globalThis.chrome = { storage: { sync: area('sync'), local: area('local'), onChanged: { addListener: (fn) => changeListeners.push(fn) } } };

require('../src/shared/settings.js');
require('../src/shared/timezones.js');
require('../src/shared/schedule.js');
const { settings, schedule } = globalThis.CAPD;
const at = new Date(2026, 10, 4, 21).getTime(); // 4 Nov 2026, 21:00: dark hours
const settle = () => new Promise((r) => setTimeout(r, 5));

test('a switch is kept on this computer, not in the synced settings', async () => {
  await settings.save({ mode: 'custom', darkFrom: '19:00', darkTo: '07:00' });
  const before = { ...writes };
  await settings.save(schedule.flip(await settings.load(), at));
  assert.equal(writes.sync, before.sync, 'nothing written to sync');
  assert.equal(writes.local, before.local + 1);
  assert.equal(stores.sync.get('settings').scheduleOverride, undefined);
  assert.deepEqual(stores.local.get('device'), { scheduleOverride: { mode: 'custom', dark: false, at } });
  const s = await settings.load();
  assert.deepEqual(s.scheduleOverride, { mode: 'custom', dark: false, at });
  assert.equal(schedule.isDark(s, at + 60000), false);
});

test('other settings leave it alone; a new appearance or the master switch ends it', async () => {
  await settings.save({ surface: 'black', darkTo: '06:30' });
  assert.ok((await settings.load()).scheduleOverride, 'kept through other changes');

  await settings.save({ mode: 'custom' }); // the same appearance again
  assert.ok((await settings.load()).scheduleOverride);

  await settings.save({ mode: 'sun' });
  assert.equal((await settings.load()).scheduleOverride, null, 'a new appearance');

  await settings.save({ mode: 'custom' });
  await settings.save(schedule.flip(await settings.load(), at));
  await settings.save({ enabled: false });
  assert.equal((await settings.load()).scheduleOverride, null, 'the master switch');

  // The shortcut with the extension off sets both in one save.
  const s = await settings.load();
  await settings.save(schedule.flip(s, new Date(2026, 10, 4, 12).getTime()));
  const on = await settings.load();
  assert.equal(on.enabled, true);
  assert.equal(on.scheduleOverride.dark, true);
});

test('a switch that reached the synced settings some other way is ignored', async () => {
  await settings.save({ scheduleOverride: null });
  stores.sync.set('settings', { ...stores.sync.get('settings'), scheduleOverride: { mode: 'custom', dark: false, at } });
  assert.equal((await settings.load()).scheduleOverride, null);
});

test('listeners hear about a switch, with the synced settings beside it', async () => {
  const heard = [];
  settings.onChange((s) => heard.push(s));
  await settings.save({ mode: 'custom', surface: 'dim' });
  await settle();
  heard.length = 0;
  await settings.save(schedule.flip(await settings.load(), at));
  await settle();
  assert.equal(heard.length, 1);
  assert.equal(heard[0].surface, 'dim');
  assert.equal(heard[0].scheduleOverride.at, at);

  // One save that changes both parts is reported once, in its final state.
  heard.length = 0;
  await settings.save({ mode: 'sun' });
  await settle();
  assert.equal(heard.length, 1);
  assert.equal(heard[0].mode, 'sun');
  assert.equal(heard[0].scheduleOverride, null);
});
