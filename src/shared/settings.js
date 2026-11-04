/*
 * Dark Mode for Power Platform — settings (shared by content scripts, popup,
 * options page and the service worker).
 *
 * Settings live in chrome.storage.sync so they follow the user's profile;
 * when sync is unavailable (or the script runs outside an extension, e.g.
 * the standalone test bundle) an in-memory store is used instead.  The one
 * exception is a switch by hand under a schedule (scheduleOverride), kept in
 * chrome.storage.local: it belongs to the screen it was made at, not to every
 * browser the profile syncs to.  load() and onChange() hand out both as one
 * settings object, and save() writes each field where it belongs.
 */
(function (root) {
  'use strict';
  const CAPD = (root.CAPD = root.CAPD || {});

  const DEFAULTS = Object.freeze({
    enabled: true,
    mode: 'dark',          // 'dark' | 'system' | 'sun' (sunset to sunrise) | 'custom' (darkFrom to darkTo); see schedule.js
    darkFrom: '19:00',     // custom hours by this computer's clock, 'HH:MM' (24 h); kept while another mode is chosen
    darkTo: '07:00',
    latitude: null,        // sunset to sunrise: the user's own location in degrees, or null for the time zone's city
    longitude: null,
    scheduleOverride: null, // a switch by hand under a schedule, { mode, dark, at } (schedule.js); this computer only
    surface: 'dark',       // 'dim' | 'dark' | 'black'
    look: 'classic',       // 'classic' | 'neon' (cyberpunk: violet-black, hot pink, cyan focus)
    contrast: 'standard',  // 'standard' | 'high'
    backdrop: 'dark',      // 'dark' | 'light'  (the dotted area around the app canvas)
    makerPortal: true,     // theme make.powerapps.com pages outside Studio too
    iconAdapt: true,       // lighten dark neutral strokes in Studio's icon sprites
    devDiagnostics: false, // let the maker page's console inspect framed pages and try CSS (debugging only)
    schemaVersion: 1,
  });

  const KEY = 'settings';
  const hasChrome = typeof chrome !== 'undefined' && chrome && chrome.storage;
  const area = hasChrome ? (chrome.storage.sync || chrome.storage.local) : null;
  const LOCAL_KEY = 'device'; // this computer's part, in chrome.storage.local
  const localArea = hasChrome ? chrome.storage.local || null : null;
  let memory = { ...DEFAULTS };
  const listeners = new Set();

  function normalize(raw) {
    const s = { ...DEFAULTS, ...(raw && typeof raw === 'object' ? raw : {}) };
    if (!['dark', 'system', 'sun', 'custom'].includes(s.mode)) s.mode = DEFAULTS.mode;
    for (const k of ['darkFrom', 'darkTo']) if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s[k])) s[k] = DEFAULTS[k];
    // Coordinates: both or neither, rounded to two decimals (about 1 km, plenty for sunset times).
    const coord = (v, max) => ((typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number.isFinite(+v) && Math.abs(+v) <= max ? Math.round(+v * 100) / 100 : null);
    s.latitude = coord(s.latitude, 90); s.longitude = coord(s.longitude, 180);
    if (s.latitude === null || s.longitude === null) { s.latitude = null; s.longitude = null; }
    const o = s.scheduleOverride;
    s.scheduleOverride = o && typeof o === 'object' && ['sun', 'custom'].includes(o.mode) && typeof o.dark === 'boolean' && Number.isFinite(o.at) ? { mode: o.mode, dark: o.dark, at: o.at } : null;
    if (!['dim', 'dark', 'black'].includes(s.surface)) s.surface = DEFAULTS.surface;
    if (!['classic', 'neon'].includes(s.look)) s.look = DEFAULTS.look;
    if (!['standard', 'high'].includes(s.contrast)) s.contrast = DEFAULTS.contrast;
    if (!['dark', 'light'].includes(s.backdrop)) s.backdrop = DEFAULTS.backdrop;
    s.enabled = !!s.enabled; s.makerPortal = !!s.makerPortal; s.iconAdapt = !!s.iconAdapt; s.devDiagnostics = !!s.devDiagnostics;
    return s;
  }

  async function load() {
    if (!area) return normalize(memory);
    try {
      const [got, here] = await Promise.all([area.get(KEY), localArea ? localArea.get(LOCAL_KEY) : null]);
      const synced = { ...(got && got[KEY]) };
      delete synced.scheduleOverride;
      const local = (here && here[LOCAL_KEY]) || {};
      return normalize({ ...synced, scheduleOverride: local.scheduleOverride });
    } catch (e) {
      return normalize(memory);
    }
  }

  async function save(patch) {
    const current = await load();
    const p = { ...(patch && typeof patch === 'object' ? patch : {}) };
    const next = normalize({ ...current, ...p });
    // Choosing another appearance, or using the master switch, ends a switch by hand.
    if (!('scheduleOverride' in p) && (next.mode !== current.mode || next.enabled !== current.enabled)) next.scheduleOverride = null;
    if (!area) {
      memory = next;
      for (const cb of listeners) { try { cb(next); } catch (e) { /* ignore */ } }
      return next;
    }
    // Synced part first: a switch by hand only counts under its own mode, so
    // a new mode arriving before the cleared switch never shows the old one.
    const { scheduleOverride, ...synced } = next;
    if (Object.keys(p).some((k) => k !== 'scheduleOverride')) await area.set({ [KEY]: synced });
    if (localArea && JSON.stringify(scheduleOverride) !== JSON.stringify(current.scheduleOverride)) await localArea.set({ [LOCAL_KEY]: { scheduleOverride } });
    return next;
  }

  function onChange(cb) {
    listeners.add(cb);
    if (hasChrome && chrome.storage.onChanged && !onChange.bound) {
      onChange.bound = true;
      let seq = 0;
      let reported = '';
      chrome.storage.onChanged.addListener((changes) => {
        if (!changes[KEY] && !changes[LOCAL_KEY]) return;
        // Read both parts again.  One save can change both, and each change
        // arrives on its own, so report only the newest read, and only when
        // it differs from the last one reported.
        const mine = ++seq;
        load().then((next) => {
          const text = JSON.stringify(next);
          if (mine !== seq || text === reported) return;
          reported = text;
          for (const fn of listeners) { try { fn(next); } catch (e) { /* ignore */ } }
        });
      });
    }
    return () => listeners.delete(cb);
  }

  CAPD.settings = { DEFAULTS, KEY, load, save, onChange, normalize };
})(typeof globalThis !== 'undefined' ? globalThis : this);
