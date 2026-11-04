/*
 * The content script under a schedule: runs src/content/90-main.js against a
 * stub page and a fake clock, with the theme engine stubbed out, to check
 * that it turns the theme on and off at the scheduled times, re-arms its
 * timer, and does not paint a stale "dark" from its cache after a switch.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

process.env.TZ = 'Europe/Belgrade';
const require = createRequire(import.meta.url);
const local = (h, m = 0, sec = 0) => new Date(2026, 10, 4, h, m, sec).getTime(); // 4 Nov 2026, local time

/* ---- fake clock and timers --------------------------------------------- */
let now = local(12);
const realNow = Date.now;
Date.now = () => now;
const timers = [];
const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;
/** Run `fn` with timers captured instead of scheduled. */
function captured(fn) {
  globalThis.setTimeout = (cb, ms) => { timers.push({ cb, ms }); return timers.length; };
  globalThis.clearTimeout = () => {};
  try { return fn(); } finally { globalThis.setTimeout = realSetTimeout; globalThis.clearTimeout = realClearTimeout; }
}
const lastTimer = () => timers[timers.length - 1];

/* ---- a stub maker-portal page ------------------------------------------ */
const attrs = new Map();
const docListeners = {};
const html = {
  getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
  setAttribute: (k, v) => attrs.set(k, String(v)),
  removeAttribute: (k) => attrs.delete(k),
  get attributes() { return [...attrs.keys()].map((name) => ({ name })); },
  appendChild: (el) => el,
  children: [],
};
globalThis.document = {
  documentElement: html,
  contentType: 'text/html',
  visibilityState: 'visible',
  createElement: () => ({ setAttribute() {}, remove() {}, textContent: '' }),
  addEventListener: (type, fn) => { (docListeners[type] = docListeners[type] || []).push(fn); },
  removeEventListener() {},
  querySelectorAll: () => [],
};
globalThis.location = { hostname: 'make.powerapps.com', pathname: '/environments/x/home', origin: 'https://make.powerapps.com' };
globalThis.window = globalThis;
globalThis.top = globalThis;
globalThis.parent = globalThis;
globalThis.addEventListener = () => {};
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
const store = new Map();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
});
const readCache = () => JSON.parse(store.get('capd:v1') || 'null');

/* ---- extension scripts, with the engine stubbed ------------------------ */
require('../src/shared/settings.js');
require('../src/shared/timezones.js');
require('../src/shared/schedule.js');
const CAPD = globalThis.CAPD;
Object.assign(CAPD, {
  STYLE_ATTR: 'data-capd-style',
  CANVAS_LIMIT_SELECTOR: '.canvas',
  themeCSS: { fallback: '' },
  log() {}, warn() {},
  staticTheme: { htmlAttrs: () => ({ 'data-capd': 'dark' }), isExcludedVar: () => false, buildStatic: () => '', buildTuned: () => '', buildInline: () => '' },
  StyleManager: class { scan() {} setStaticCSS() {} setTunedCSS() {} setInlineCSS() {} rebuild() {} dispose() {} },
  InlineProcessor: class { processTree() {} reprocess() {} dispose() {} },
  DomObserver: class { start() {} stop() {} },
});
let current = CAPD.settings.normalize({ mode: 'custom', darkFrom: '11:00', darkTo: '13:00' });
let deferLoad = false;
let pendingLoad = null;
const changeListeners = [];
CAPD.settings.load = () => ({ then(cb) { if (deferLoad) pendingLoad = cb; else cb(current); return { catch() {} }; } });
CAPD.settings.onChange = (cb) => { changeListeners.push(cb); };
const changeSettings = (patch) => {
  current = CAPD.settings.normalize({ ...current, ...patch });
  captured(() => changeListeners[changeListeners.length - 1](current));
};
const boot = () => {
  delete require.cache[require.resolve('../src/content/90-main.js')];
  captured(() => require('../src/content/90-main.js'));
};

test('inside the custom hours the theme is on, and the next look is at most a minute away', () => {
  boot();
  assert.equal(CAPD.role, 'maker');
  assert.equal(CAPD.active, true);
  assert.equal(html.getAttribute('data-capd'), 'dark');
  assert.equal(lastTimer().ms, 60 * 1000, 'the switch at 13:00 is an hour away, so the timer is capped');
  const cache = readCache();
  assert.equal(cache.active, true);
  assert.equal(cache.until, local(13), 'the cache knows when its "on" runs out');
});

test('outside them the theme is off; a timer fires a second after the next start', () => {
  now = local(12, 1, 30);
  changeSettings({ darkFrom: '12:02', darkTo: '18:00' });
  assert.equal(CAPD.active, false);
  assert.equal(html.getAttribute('data-capd'), null);
  assert.equal(lastTimer().ms, local(12, 2) - now + 1000, 'thirty seconds to go, plus one');
});

test('when the timer fires after the start, the theme comes on without a settings change', () => {
  now = local(12, 2, 1);
  captured(() => lastTimer().cb());
  assert.equal(CAPD.active, true);
  assert.equal(html.getAttribute('data-capd'), 'dark');
  assert.equal(readCache().until, local(18));
});

test('a look that changes nothing only re-arms the timer', () => {
  const before = timers.length;
  let rebuilt = 0;
  const update = CAPD.StyleManager.prototype.setStaticCSS;
  CAPD.StyleManager.prototype.setStaticCSS = function () { rebuilt++; };
  now = local(12, 30);
  captured(() => docListeners.visibilitychange.forEach((fn) => fn()));
  CAPD.StyleManager.prototype.setStaticCSS = update;
  assert.equal(CAPD.active, true);
  assert.equal(rebuilt, 0, 'the theme was not rebuilt');
  assert.equal(timers.length, before + 1);
});

test('coming back to a tab after the end turns the theme off', () => {
  now = local(18, 5);
  captured(() => docListeners.visibilitychange.forEach((fn) => fn()));
  assert.equal(CAPD.active, false);
  assert.equal(html.getAttribute('data-capd'), null);
});

test('the other appearances arm no timer', () => {
  const before = timers.length;
  changeSettings({ mode: 'dark' });
  assert.equal(CAPD.active, true);
  assert.equal(timers.length, before);
  assert.equal(readCache().until, null);
});

test('a switch by hand turns the theme on in the light hours, until the dark hours are over', () => {
  now = local(18, 10);
  changeSettings({ mode: 'custom', darkFrom: '19:00', darkTo: '07:00' });
  assert.equal(CAPD.active, false);
  changeSettings(CAPD.schedule.flip(current, now)); // the shortcut
  assert.equal(CAPD.active, true);
  assert.equal(html.getAttribute('data-capd'), 'dark');
  assert.equal(readCache().until, local(24 + 7), 'cached as on until 07:00 tomorrow, not 19:00 today');
  assert.equal(lastTimer().ms, 60 * 1000);

  now = local(18, 50);
  captured(() => lastTimer().cb());
  assert.equal(CAPD.active, true, 'still on a minute later');

  // Pressed again before 19:00: back to the schedule, which says light.
  now = local(18, 55);
  changeSettings(CAPD.schedule.flip(current, now));
  assert.equal(current.scheduleOverride, null);
  assert.equal(CAPD.active, false);

  // Pressed once more: on, and at 19:00 the schedule takes over without a flicker.
  now = local(18, 56);
  changeSettings(CAPD.schedule.flip(current, now));
  assert.equal(CAPD.active, true);
  now = local(19, 30);
  captured(() => lastTimer().cb());
  assert.equal(CAPD.active, true);
  assert.equal(CAPD.schedule.current(current, now).overridden, false, 'the switch has run out');

  // So a press now is a new switch, to light until 07:00.
  changeSettings(CAPD.schedule.flip(current, now));
  assert.equal(CAPD.active, false);
  assert.equal(current.scheduleOverride.dark, false);
  changeSettings({ scheduleOverride: null });
});

test('on the next page load, a cached "on" that has run out is not painted before the settings arrive', () => {
  // Leave a cache that says "on until 18:00", then load the page at 18:05.
  now = local(12);
  changeSettings({ mode: 'custom', darkFrom: '11:00', darkTo: '18:00' });
  assert.equal(readCache().until, local(18));
  CAPD.teardown();
  assert.equal(html.getAttribute('data-capd'), null);

  now = local(18, 5);
  deferLoad = true;
  boot();
  assert.equal(html.getAttribute('data-capd'), null, 'stale cache: no flash of dark');
  captured(() => pendingLoad(current));
  assert.equal(CAPD.active, false);

  // And a cache that is still good is painted at once, as before.
  CAPD.teardown();
  now = local(12);
  store.set('capd:v1', JSON.stringify({ active: true, attrs: { 'data-capd': 'dark' }, until: local(18) }));
  boot();
  assert.equal(html.getAttribute('data-capd'), 'dark', 'fresh cache: dark from the first paint');
  CAPD.teardown();
  deferLoad = false;
});

test.after(() => { Date.now = realNow; });
