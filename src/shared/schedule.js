/*
 * Dark Mode for Power Platform — schedules (shared by content scripts, popup
 * and options page).
 *
 * Two scheduled appearances besides "Always dark" and "Follow system":
 *   sun     dark from sunset to sunrise where the user is
 *   custom  dark between two clock times the user picks (overnight is fine)
 *
 * Everything is computed locally from the settings and this computer's clock
 * and time zone; nothing asks for location access or goes online.  The
 * location for sunset and sunrise is the one the user entered, or else the
 * principal city of this computer's time zone (src/shared/timezones.js).
 * Without either (a "UTC" clock, say) sunset to sunrise falls back to the
 * custom hours, and the pages say so.
 *
 * The schedule is never written back to the settings: it only decides
 * whether the theme is on right now, so the user's own choices (the mode,
 * the hours, the location, the master switch) survive every switch.
 */
(function (root) {
  'use strict';
  const CAPD = (root.CAPD = root.CAPD || {});

  const MODES = Object.freeze(['sun', 'custom']);
  const DAY = 86400000;
  const HOUR = 3600000;
  const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

  /** 'HH:MM' -> minutes after midnight, or NaN. */
  function minutes(hhmm) {
    const m = TIME_RE.exec(String(hhmm || ''));
    return m ? +m[1] * 60 + +m[2] : NaN;
  }

  function isScheduled(s) { return !!s && MODES.includes(s.mode); }

  /* ---------------------------------------------------------------- */
  /* Where are we?                                                    */
  /* ---------------------------------------------------------------- */
  function timeZone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; }
  }

  /** The zone's principal city as { zone, place, latitude, longitude }, or null. */
  function zoneLocation(zone) {
    const table = CAPD.timeZones;
    if (!table || !zone) return null;
    const name = (CAPD.timeZoneAliases && CAPD.timeZoneAliases[zone]) || zone;
    const i = name.indexOf('/');
    if (i < 0) return null;
    const c = table[name.slice(0, i)] && table[name.slice(0, i)][name.slice(i + 1)];
    if (!c) return null;
    return { zone, place: name.slice(name.lastIndexOf('/') + 1).replace(/_/g, ' '), latitude: c[0], longitude: c[1] };
  }

  /** The location sunset and sunrise are computed for, or null when there is none. */
  function location(s, zone) {
    if (s && Number.isFinite(s.latitude) && Number.isFinite(s.longitude)) {
      return { source: 'manual', latitude: s.latitude, longitude: s.longitude };
    }
    const z = zoneLocation(zone === undefined ? timeZone() : zone);
    return z ? { source: 'timezone', ...z } : null;
  }

  /* ---------------------------------------------------------------- */
  /* Sunrise and sunset                                               */
  /* ---------------------------------------------------------------- */
  /*
   * The standard sunrise equation (mean anomaly, equation of centre,
   * ecliptic longitude, declination, hour angle at the -0.833° apparent
   * horizon), cycle by cycle of solar noon, as in NOAA's solar calculator and
   * Vladimir Agafonkin's SunCalc.  Within a minute or two of the published
   * tables away from the poles, which is all a theme switch needs.
   */
  const RAD = Math.PI / 180;
  const J1970 = 2440588;
  const J2000 = 2451545;
  const J0 = 0.0009;
  const OBLIQUITY = 23.4397 * RAD;
  const H0 = -0.833 * RAD;
  const fromJulian = (j) => (j + 0.5 - J1970) * DAY;
  const daysSinceJ2000 = (ms) => ms / DAY - 0.5 + J1970 - J2000;

  /** Solar noon, sunrise and sunset (ms) of cycle `n`, or the polar state when the sun stays up or down. */
  function sunCycle(n, lw, phi) {
    const ds = J0 + lw / (2 * Math.PI) + n;
    const M = RAD * (357.5291 + 0.98560028 * ds);
    const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
    const L = M + C + RAD * 102.9372 + Math.PI;
    const dec = Math.asin(Math.sin(OBLIQUITY) * Math.sin(L));
    const transit = (a) => J2000 + a + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
    const noon = transit(ds);
    const cosW = (Math.sin(H0) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
    if (!(cosW <= 1)) return { noon: fromJulian(noon), polar: 'night' }; // never rises (NaN at a pole counts as night)
    if (cosW < -1) return { noon: fromJulian(noon), polar: 'day' };     // never sets
    const set = transit(J0 + (Math.acos(cosW) + lw) / (2 * Math.PI) + n);
    return { noon: fromJulian(noon), rise: fromJulian(noon - (set - noon)), set: fromJulian(set) };
  }

  /* Events are { at, dark, kind }: from `at` on, the schedule says `dark`. */
  function sunEvents(latitude, longitude, now) {
    const lw = -longitude * RAD;
    const phi = latitude * RAD;
    const n0 = Math.round(daysSinceJ2000(now) - J0 - lw / (2 * Math.PI));
    const events = [];
    for (let n = n0 - 1; n <= n0 + 2; n++) {
      const c = sunCycle(n, lw, phi);
      // Solar midnight opens each cycle: night in a normal one (the sun is
      // down then if it sets at all), the polar state otherwise.
      events.push({ at: c.noon - DAY / 2, dark: c.polar !== 'day', kind: c.polar ? `polar-${c.polar}` : 'night' });
      if (!c.polar) events.push({ at: c.rise, dark: false, kind: 'sunrise' }, { at: c.set, dark: true, kind: 'sunset' });
    }
    return events;
  }

  /* ---------------------------------------------------------------- */
  /* Custom hours                                                     */
  /* ---------------------------------------------------------------- */
  function hoursEvents(from, to, now) {
    const base = new Date(now);
    const at = (dayOffset, min) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + dayOffset, Math.floor(min / 60), min % 60).getTime();
    const events = [];
    for (let d = -1; d <= 2; d++) events.push({ at: at(d, from), dark: true, kind: 'start' }, { at: at(d, to), dark: false, kind: 'end' });
    return events;
  }

  /* ---------------------------------------------------------------- */
  /* State                                                            */
  /* ---------------------------------------------------------------- */
  /**
   * From a list of events: dark or not at `now`, since when, until when
   * (the next change, or null when none is due within a day or so: polar
   * day or night), and the change after that.
   */
  function fromEvents(events, now) {
    events.sort((a, b) => a.at - b.at);
    let i = -1;
    for (let k = 0; k < events.length; k++) if (events[k].at <= now) i = k;
    if (i < 0) i = 0;
    const dark = events[i].dark;
    let since = null;
    for (let k = i; k >= 0 && events[k].dark === dark; k--) since = events[k];
    if (since === events[0]) since = null; // began before the window we looked at
    const changes = [];
    let state = dark;
    for (let k = i + 1; k < events.length && changes.length < 2; k++) {
      if (events[k].dark !== state) { changes.push(events[k]); state = events[k].dark; }
    }
    const pick = (e) => (e ? { at: e.at, kind: e.kind } : null);
    return { dark, since: pick(since), until: pick(changes[0]), then: pick(changes[1]) };
  }

  /**
   * What the schedule says at `now` (ms), for a scheduled mode; null for the
   * other modes.  { mode, dark, since, until, then, location, fallback,
   * empty }: `fallback` when sunset to sunrise has no location and uses the
   * custom hours instead; `empty` when the custom hours start and end at the
   * same minute, which is never dark.
   */
  function state(s, now, zone) {
    if (!isScheduled(s)) return null;
    const t = Number.isFinite(now) ? now : Date.now();
    const from = minutes(s.darkFrom);
    const to = minutes(s.darkTo);
    if (s.mode === 'sun') {
      const loc = location(s, zone);
      if (loc) return { mode: 'sun', ...fromEvents(sunEvents(loc.latitude, loc.longitude, t), t), location: loc, fallback: false, empty: false };
    }
    const base = { mode: s.mode, location: null, fallback: s.mode === 'sun' };
    if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return { ...base, dark: false, since: null, until: null, then: null, empty: true };
    return { ...base, ...fromEvents(hoursEvents(from, to, t), t), empty: false };
  }

  /** Whether the theme should be on at `now` under a scheduled mode (true for every other mode). */
  function isDark(s, now, zone) {
    const st = state(s, now, zone);
    return st ? st.dark : true;
  }

  /* ---------------------------------------------------------------- */
  /* Words for the popup and the options page                         */
  /* ---------------------------------------------------------------- */
  // The user's own clock style: "4:38 PM" on a 12-hour clock, "16:38" and "06:51" on a 24-hour one.
  const HOUR12 = (() => { try { return !!new Intl.DateTimeFormat([], { hour: 'numeric' }).resolvedOptions().hour12; } catch (e) { return false; } })();
  const clock = (ms) => new Date(ms).toLocaleTimeString([], { hour: HOUR12 ? 'numeric' : '2-digit', minute: '2-digit' });
  const NAMES = { sunrise: 'sunrise', sunset: 'sunset', 'polar-day': 'midnight sun', 'polar-night': 'polar night' };
  const named = (e) => (NAMES[e.kind] ? `${NAMES[e.kind]} at ${clock(e.at)}` : clock(e.at));

  /** One line on what the schedule does next ("Light until sunset at 4:38 PM"). */
  function summary(st) {
    if (!st) return '';
    if (st.empty) return 'Pick two different times';
    if (!st.until) return st.dark ? 'Dark all day: the sun stays down here' : 'Light all day: the sun stays up here';
    return `${st.dark ? 'Dark' : 'Light'} until ${named(st.until)}`;
  }

  /** The dark period now or next, as "4:38 PM – 6:51 AM", or ''. */
  function darkSpan(st) {
    if (!st || st.empty) return '';
    if (st.dark) return st.until ? `${st.since ? clock(st.since.at) : '…'} – ${clock(st.until.at)}` : '';
    return st.until && st.then ? `${clock(st.until.at)} – ${clock(st.then.at)}` : '';
  }

  /** Where sunset and sunrise are computed for, in words. */
  function placeText(loc) {
    if (!loc) return '';
    const f = (v, pos, neg) => `${Math.abs(v).toFixed(1)}° ${v >= 0 ? pos : neg}`;
    const coords = `${f(loc.latitude, 'N', 'S')}, ${f(loc.longitude, 'E', 'W')}`;
    return loc.source === 'manual' ? coords : `${loc.place} (${coords}), from your time zone`;
  }

  CAPD.schedule = { MODES, HOUR, minutes, isScheduled, timeZone, zoneLocation, location, state, isDark, summary, darkSpan, placeText, clock };
})(typeof globalThis !== 'undefined' ? globalThis : this);
