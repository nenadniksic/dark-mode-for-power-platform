/*
 * Canvas Studio Dark Mode — settings (shared by content scripts, popup,
 * options page and the service worker).
 *
 * Settings live in chrome.storage.sync so they follow the user's profile;
 * when sync is unavailable (or the script runs outside an extension, e.g.
 * the standalone test bundle) an in-memory store is used instead.
 */
(function (root) {
  'use strict';
  const CAPD = (root.CAPD = root.CAPD || {});

  const DEFAULTS = Object.freeze({
    enabled: true,
    mode: 'dark',          // 'dark' | 'system'
    surface: 'dark',       // 'dim' | 'dark' | 'black'
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
  let memory = { ...DEFAULTS };
  const listeners = new Set();

  function normalize(raw) {
    const s = { ...DEFAULTS, ...(raw && typeof raw === 'object' ? raw : {}) };
    if (!['dark', 'system'].includes(s.mode)) s.mode = DEFAULTS.mode;
    if (!['dim', 'dark', 'black'].includes(s.surface)) s.surface = DEFAULTS.surface;
    if (!['standard', 'high'].includes(s.contrast)) s.contrast = DEFAULTS.contrast;
    if (!['dark', 'light'].includes(s.backdrop)) s.backdrop = DEFAULTS.backdrop;
    s.enabled = !!s.enabled; s.makerPortal = !!s.makerPortal; s.iconAdapt = !!s.iconAdapt; s.devDiagnostics = !!s.devDiagnostics;
    return s;
  }

  async function load() {
    if (!area) return normalize(memory);
    try {
      const got = await area.get(KEY);
      return normalize(got && got[KEY]);
    } catch (e) {
      return normalize(memory);
    }
  }

  async function save(patch) {
    const current = await load();
    const next = normalize({ ...current, ...patch });
    if (!area) {
      memory = next;
      for (const cb of listeners) { try { cb(next); } catch (e) { /* ignore */ } }
      return next;
    }
    await area.set({ [KEY]: next });
    return next;
  }

  function onChange(cb) {
    listeners.add(cb);
    if (hasChrome && chrome.storage.onChanged && !onChange.bound) {
      onChange.bound = true;
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (!changes[KEY]) return;
        const next = normalize(changes[KEY].newValue);
        for (const fn of listeners) { try { fn(next); } catch (e) { /* ignore */ } }
      });
    }
    return () => listeners.delete(cb);
  }

  CAPD.settings = { DEFAULTS, KEY, load, save, onChange, normalize };
})(typeof globalThis !== 'undefined' ? globalThis : this);
