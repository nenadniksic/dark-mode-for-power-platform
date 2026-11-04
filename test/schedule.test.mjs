import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// Custom hours follow the local clock; pin one with a DST change in spring.
process.env.TZ = 'Europe/Belgrade';

const require = createRequire(import.meta.url);
require('../src/shared/settings.js');
require('../src/shared/timezones.js');
require('../src/shared/schedule.js');
const { settings, schedule } = globalThis.CAPD;

const MIN = 60000;
const local = (y, mo, d, h, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const utc = (iso) => Date.parse(iso);
const near = (actual, expected, label, tol = 3 * MIN) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${label}: ${new Date(actual).toISOString()} vs ${new Date(expected).toISOString()}`);
const base = settings.normalize({});
const sunAt = (latitude, longitude) => ({ ...base, mode: 'sun', latitude, longitude });

/* ---- sunset to sunrise -------------------------------------------------- */

test('sunset and sunrise match published times within a few minutes', () => {
  // London, 21 June 2024: sunrise 04:43 BST, sunset 21:21 BST.
  const london = schedule.state(sunAt(51.51, -0.13), utc('2024-06-21T12:00:00Z'));
  assert.equal(london.dark, false);
  assert.equal(london.until.kind, 'sunset');
  near(london.until.at, utc('2024-06-21T20:21:00Z'), 'London sunset');
  assert.equal(london.then.kind, 'sunrise');
  near(london.then.at, utc('2024-06-22T03:43:00Z'), 'London next sunrise');
  near(london.since.at, utc('2024-06-21T03:43:00Z'), 'London sunrise');

  // New York, 21 December 2024: sunrise 07:17 EST, sunset 16:32 EST.
  const ny = schedule.state(sunAt(40.71, -74.01), utc('2024-12-22T02:00:00Z')); // 21:00 EST
  assert.equal(ny.dark, true);
  near(ny.since.at, utc('2024-12-21T21:32:00Z'), 'New York sunset');
  assert.equal(ny.until.kind, 'sunrise');
  near(ny.until.at, utc('2024-12-22T12:17:00Z'), 'New York next sunrise');

  // Sydney, 21 December 2024 (southern summer): sunrise 05:41 AEDT, sunset 20:05 AEDT.
  const sydney = schedule.state(sunAt(-33.87, 151.21), utc('2024-12-21T01:00:00Z')); // noon AEDT
  assert.equal(sydney.dark, false);
  near(sydney.since.at, utc('2024-12-20T18:41:00Z'), 'Sydney sunrise');
  near(sydney.until.at, utc('2024-12-21T09:05:00Z'), 'Sydney sunset');
});

test('polar night is dark all day and the midnight sun is light all day', () => {
  const winter = schedule.state(sunAt(69.65, 18.96), utc('2024-12-21T12:00:00Z')); // Tromsø
  assert.equal(winter.dark, true);
  assert.equal(winter.until, null);
  assert.match(schedule.summary(winter), /Dark all day/);
  const summer = schedule.state(sunAt(69.65, 18.96), utc('2024-06-21T00:00:00Z'));
  assert.equal(summer.dark, false);
  assert.equal(summer.until, null);
  assert.match(schedule.summary(summer), /Light all day/);
});

test('the state is the same seen from either side of each change', () => {
  const s = sunAt(44.8, 20.5);
  const st = schedule.state(s, utc('2026-11-04T10:00:00Z'));
  assert.equal(schedule.isDark(s, st.until.at - 1000), false);
  assert.equal(schedule.isDark(s, st.until.at + 1000), true);
  assert.equal(schedule.isDark(s, st.then.at - 1000), true);
  assert.equal(schedule.isDark(s, st.then.at + 1000), false);
});

/* ---- where the sun is computed for ------------------------------------- */

test('without coordinates, the time zone city is used', () => {
  assert.deepEqual(schedule.zoneLocation('Europe/Belgrade'), { zone: 'Europe/Belgrade', place: 'Belgrade', latitude: 44.8, longitude: 20.5 });
  assert.equal(schedule.zoneLocation('Asia/Calcutta').place, 'Kolkata', 'the older name Chrome reports for India');
  assert.equal(schedule.zoneLocation('America/Argentina/Buenos_Aires').place, 'Buenos Aires');
  assert.equal(schedule.zoneLocation('US/Pacific').place, 'Los Angeles');
  for (const z of ['UTC', 'Etc/GMT+5', '', 'Nowhere/Atlantis']) assert.equal(schedule.zoneLocation(z), null, z);

  const sun = { ...base, mode: 'sun' };
  assert.equal(schedule.location(sun, 'Europe/Belgrade').source, 'timezone');
  assert.deepEqual(schedule.location({ ...sun, latitude: 51.5, longitude: -0.13 }, 'Europe/Belgrade'), { source: 'manual', latitude: 51.5, longitude: -0.13 });
  assert.match(schedule.placeText(schedule.location(sun, 'Europe/Belgrade')), /^Belgrade \(44\.8° N, 20\.5° E\), from your time zone$/);
});

test('with no location at all, sunset to sunrise falls back to the custom hours', () => {
  const s = { ...base, mode: 'sun', darkFrom: '19:00', darkTo: '07:00' };
  const st = schedule.state(s, local(2026, 11, 4, 20), 'UTC');
  assert.equal(st.fallback, true);
  assert.equal(st.dark, true);
  assert.equal(st.until.at, local(2026, 11, 5, 7));
  assert.equal(schedule.state(s, local(2026, 11, 4, 20), 'Europe/Belgrade').fallback, false);
});

/* ---- custom hours ------------------------------------------------------- */

test('overnight custom hours', () => {
  const s = { ...base, mode: 'custom', darkFrom: '19:00', darkTo: '07:00' };
  const evening = schedule.state(s, local(2026, 11, 4, 20));
  assert.equal(evening.dark, true);
  assert.equal(evening.since.at, local(2026, 11, 4, 19));
  assert.equal(evening.until.at, local(2026, 11, 5, 7));
  const noon = schedule.state(s, local(2026, 11, 4, 12));
  assert.equal(noon.dark, false);
  assert.equal(noon.until.at, local(2026, 11, 4, 19));
  assert.equal(noon.then.at, local(2026, 11, 5, 7));
  assert.equal(schedule.isDark(s, local(2026, 11, 4, 6, 59)), true);
  assert.equal(schedule.isDark(s, local(2026, 11, 4, 7, 0)), false, 'the end minute is light');
  assert.equal(schedule.isDark(s, local(2026, 11, 4, 19, 0)), true, 'the start minute is dark');
});

test('same-day custom hours, and a night that loses an hour to DST', () => {
  const day = { ...base, mode: 'custom', darkFrom: '09:00', darkTo: '17:30' };
  assert.equal(schedule.isDark(day, local(2026, 11, 4, 8, 59)), false);
  assert.equal(schedule.isDark(day, local(2026, 11, 4, 12)), true);
  assert.equal(schedule.state(day, local(2026, 11, 4, 12)).until.at, local(2026, 11, 4, 17, 30));
  // Belgrade's clocks go from 02:00 to 03:00 on 29 March 2026: that night is 11 hours long.
  const night = { ...base, mode: 'custom', darkFrom: '19:00', darkTo: '07:00' };
  const st = schedule.state(night, local(2026, 3, 28, 23));
  assert.equal(st.until.at, local(2026, 3, 29, 7));
  assert.equal(st.until.at - st.since.at, 11 * 60 * MIN);
});

test('equal start and end never turn dark mode on', () => {
  const s = { ...base, mode: 'custom', darkFrom: '08:00', darkTo: '08:00' };
  const st = schedule.state(s, local(2026, 11, 4, 8));
  assert.equal(st.empty, true);
  assert.equal(st.dark, false);
  assert.equal(schedule.summary(st), 'Pick two different times');
});

test('only the scheduled modes are scheduled; the others are always "dark" as far as the schedule goes', () => {
  for (const mode of ['dark', 'system']) {
    assert.equal(schedule.isScheduled({ ...base, mode }), false);
    assert.equal(schedule.state({ ...base, mode }), null);
    assert.equal(schedule.isDark({ ...base, mode }), true);
  }
  assert.equal(schedule.isScheduled({ ...base, mode: 'sun' }), true);
  assert.equal(schedule.isScheduled({ ...base, mode: 'custom' }), true);
});

/* ---- settings ----------------------------------------------------------- */

test('settings accept the new modes and reject bad hours and coordinates', () => {
  assert.equal(settings.normalize({ mode: 'sun' }).mode, 'sun');
  assert.equal(settings.normalize({ mode: 'custom' }).mode, 'custom');
  assert.equal(settings.normalize({ mode: 'sometimes' }).mode, 'dark');
  const bad = settings.normalize({ darkFrom: '25:00', darkTo: '7:00' });
  assert.equal(bad.darkFrom, '19:00');
  assert.equal(bad.darkTo, '07:00');
  const rounded = settings.normalize({ latitude: '44.8123', longitude: 20.4567 });
  assert.equal(rounded.latitude, 44.81);
  assert.equal(rounded.longitude, 20.46);
  for (const [latitude, longitude] of [[95, 20], [44, 181], [44, null], [null, 20], ['', 20], [true, 20], ['north', 20]]) {
    const s = settings.normalize({ latitude, longitude });
    assert.deepEqual([s.latitude, s.longitude], [null, null], `${latitude}, ${longitude}`);
  }
  assert.deepEqual([settings.normalize({ latitude: 0, longitude: 0 }).latitude, settings.normalize({ latitude: 0, longitude: 0 }).longitude], [0, 0]);
});

test('each choice keeps its hours and location while you switch between them, and the master switch keeps the choice', async () => {
  await settings.save({ ...settings.DEFAULTS });
  await settings.save({ mode: 'custom', darkFrom: '21:30', darkTo: '06:15' });
  await settings.save({ mode: 'sun', latitude: 44.82, longitude: 20.46 });
  await settings.save({ mode: 'system' });
  await settings.save({ mode: 'custom' });
  let s = await settings.load();
  assert.deepEqual([s.mode, s.darkFrom, s.darkTo, s.latitude, s.longitude], ['custom', '21:30', '06:15', 44.82, 20.46]);

  await settings.save({ enabled: false }); // the master switch
  await settings.save({ enabled: true });
  s = await settings.load();
  assert.equal(s.mode, 'custom');
  assert.equal(s.darkFrom, '21:30');

  // Working out the schedule never writes anything back.
  const frozen = Object.freeze({ ...s });
  schedule.state(frozen, local(2026, 11, 4, 22));
  assert.deepEqual(await settings.load(), s);
  await settings.save({ ...settings.DEFAULTS });
});

/* ---- switching by hand -------------------------------------------------- */

const night = { ...base, mode: 'custom', darkFrom: '19:00', darkTo: '07:00' };
const belgrade = { ...base, mode: 'sun', latitude: 44.82, longitude: 20.46 };

test('switched to light in the dark hours, it stays light until the schedule says light anyway', () => {
  const at = local(2026, 11, 4, 21);
  const s = { ...night, ...schedule.flip(night, at) };
  assert.deepEqual(s.scheduleOverride, { mode: 'custom', dark: false, at });
  const now = schedule.current(s, local(2026, 11, 4, 23));
  assert.equal(now.dark, false);
  assert.equal(now.overridden, true);
  assert.equal(now.resumes.at, local(2026, 11, 5, 7), 'the schedule takes over at the end of the dark hours');
  assert.equal(now.until.at, local(2026, 11, 5, 19), 'so what is shown next changes when they start again');
  assert.equal(schedule.summary(now), `Light until ${schedule.clock(local(2026, 11, 5, 19))}, switched by you`);
  assert.equal(schedule.isDark(s, local(2026, 11, 5, 6, 59)), false);
  const morning = schedule.current(s, local(2026, 11, 5, 7, 1));
  assert.equal(morning.overridden, false);
  assert.equal(morning.dark, false);
  assert.equal(schedule.isDark(s, local(2026, 11, 5, 19, 1)), true, 'dark again at 19:00, as usual');
});

test('switched to dark in the light hours, it stays dark through the night', () => {
  const at = local(2026, 11, 4, 12);
  const s = { ...night, ...schedule.flip(night, at) };
  const st = schedule.current(s, local(2026, 11, 4, 13));
  assert.equal(st.dark, true);
  assert.equal(st.since.at, at);
  assert.equal(st.until.at, local(2026, 11, 5, 7));
  assert.equal(schedule.isDark(s, local(2026, 11, 4, 18, 59)), true);
  assert.equal(schedule.isDark(s, local(2026, 11, 5, 6, 59)), true);
  assert.equal(schedule.isDark(s, local(2026, 11, 5, 7, 1)), false);
});

test('sunset to sunrise: switched to light after dark, the next sunset turns it dark again', () => {
  const at = local(2026, 11, 4, 21);
  const s = { ...belgrade, ...schedule.flip(belgrade, at) };
  const st = schedule.current(s, at + MIN);
  assert.equal(st.dark, false);
  assert.equal(st.resumes.kind, 'sunrise');
  assert.equal(st.until.kind, 'sunset');
  assert.ok(st.until.at > local(2026, 11, 5, 16) && st.until.at < local(2026, 11, 5, 17), 'the sunset of 5 November');
  assert.match(schedule.summary(st), /^Light until sunset at .+, switched by you$/);
  assert.equal(schedule.isDark(s, st.until.at + MIN), true);
});

test('pressing again goes back to the schedule; Always dark and Follow system keep the master switch', () => {
  const at = local(2026, 11, 4, 21);
  const once = { ...night, ...schedule.flip(night, at) };
  assert.deepEqual(schedule.flip(once, at + MIN), { scheduleOverride: null });
  assert.equal(schedule.isDark({ ...once, scheduleOverride: null }, at + MIN), true);
  assert.deepEqual(schedule.flip({ ...base, mode: 'dark' }, at), { enabled: false });
  assert.deepEqual(schedule.flip({ ...base, mode: 'system' }, at), { enabled: false });
  // With the extension off, the shortcut turns it on: dark even in the light hours.
  const off = { ...night, enabled: false };
  assert.deepEqual(schedule.flip(off, local(2026, 11, 4, 12)), { enabled: true, scheduleOverride: { mode: 'custom', dark: true, at: local(2026, 11, 4, 12) } });
  assert.deepEqual(schedule.flip(off, at), { enabled: true, scheduleOverride: null });
  assert.deepEqual(schedule.flip({ ...base, enabled: false }, at), { enabled: true, scheduleOverride: null });
});

test('a switch counts only under the appearance it was made in, and not from the future', () => {
  const at = local(2026, 11, 4, 21);
  const o = { mode: 'custom', dark: false, at };
  assert.equal(schedule.isDark({ ...night, scheduleOverride: o }, at + MIN), false);
  assert.equal(schedule.isDark({ ...belgrade, scheduleOverride: o }, at + MIN), true, 'made under custom hours');
  assert.equal(schedule.isDark({ ...night, scheduleOverride: o }, at - MIN), true, 'the clock was set back');
  // Hours changed after the switch: the new hours' next change ends it.
  assert.equal(schedule.isDark({ ...night, darkFrom: '22:00', scheduleOverride: o }, local(2026, 11, 4, 21, 30)), false);
  assert.equal(schedule.isDark({ ...night, darkFrom: '22:00', scheduleOverride: o }, local(2026, 11, 4, 22, 1)), true);
});

test('settings keep a switch only in a sound shape', () => {
  const at = local(2026, 11, 4, 21);
  assert.equal(settings.DEFAULTS.scheduleOverride, null);
  assert.deepEqual(settings.normalize({ scheduleOverride: { mode: 'sun', dark: true, at, extra: 1 } }).scheduleOverride, { mode: 'sun', dark: true, at });
  for (const bad of [{ mode: 'dark', dark: true, at }, { mode: 'sun', dark: 'yes', at }, { mode: 'sun', dark: true, at: 'now' }, 'sun', 1]) {
    assert.equal(settings.normalize({ scheduleOverride: bad }).scheduleOverride, null, JSON.stringify(bad));
  }
});
