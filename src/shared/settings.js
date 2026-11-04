/*
 * Dark Mode for Power Platform — settings (shared by content scripts, popup,
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
    look: 'classic',       // 'classic' | 'neon' (cyberpunk: violet-black, hot pink, cyan focus)
    contrast: 'standard',  // 'standard' | 'high'
    backdrop: 'dark',      // 'dark' | 'light'  (the dotted area around the app canvas)
    makerPortal: true,     // theme make.powerapps.com pages outside Studio too
    sharePoint: false,     // theme SharePoint sites too (opt-in: needs optional host access)
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
    if (!['classic', 'neon'].includes(s.look)) s.look = DEFAULTS.look;
    if (!['standard', 'high'].includes(s.contrast)) s.contrast = DEFAULTS.contrast;
    if (!['dark', 'light'].includes(s.backdrop)) s.backdrop = DEFAULTS.backdrop;
    s.enabled = !!s.enabled; s.makerPortal = !!s.makerPortal; s.sharePoint = !!s.sharePoint; s.iconAdapt = !!s.iconAdapt; s.devDiagnostics = !!s.devDiagnostics;
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

  /*
   * SharePoint is opt-in.  Its sites are optional host permissions, asked for
   * when the user switches the setting on and handed back when it goes off,
   * so the extension never holds access to SharePoint it is not using.  The
   * service worker registers the content scripts while both the setting and
   * the access are in place.  Hosts: worldwide and GCC (sharepoint.com), GCC
   * High (sharepoint.us), DoD (sharepoint-mil.us), 21Vianet (sharepoint.cn).
   */
  const SP_ORIGINS = Object.freeze([
    'https://*.sharepoint.com/*',
    'https://*.sharepoint.us/*',
    'https://*.sharepoint-mil.us/*',
    'https://*.sharepoint.cn/*',
  ]);
  const SP_HOST_RE = /(^|\.)sharepoint(-mil)?\.(com|us|cn)$/i;
  const hasPermissions = () => hasChrome && chrome.permissions && typeof chrome.permissions.request === 'function';

  const sharePoint = {
    ORIGINS: SP_ORIGINS,
    /** A SharePoint host.  OneDrive (<tenant>-my.sharepoint.com) is not: it has a dark mode of its own. */
    isHost(host) {
      const h = String(host || '').toLowerCase();
      return SP_HOST_RE.test(h) && !/^[^.]+-my\./.test(h);
    },
    /** Whether the extension currently holds access to SharePoint sites. */
    async granted() {
      if (!hasPermissions()) return false;
      try { return await chrome.permissions.contains({ origins: SP_ORIGINS }); } catch (e) { return false; }
    },
    /**
     * Ask for SharePoint access and switch the setting on.  Call it straight
     * from the click or change handler, before any await: Chrome shows the
     * prompt only during a user gesture.  If the prompt closes the popup, the
     * service worker sees the grant and switches the setting on itself.
     */
    async enable() {
      if (!hasPermissions()) return false;
      let ok = false;
      // the request is made synchronously, before this function first yields
      try { ok = await chrome.permissions.request({ origins: SP_ORIGINS }); } catch (e) { return false; }
      if (ok) await save({ sharePoint: true });
      return ok;
    },
    /** Switch the setting off and hand the access back. */
    async disable() {
      await save({ sharePoint: false });
      if (!hasPermissions()) return;
      try { await chrome.permissions.remove({ origins: SP_ORIGINS }); } catch (e) { /* already gone */ }
    },
    /** Re-run `cb` when SharePoint access is granted or removed (Chrome's site-access controls included). */
    onAccessChange(cb) {
      if (!hasPermissions() || !chrome.permissions.onAdded) return;
      chrome.permissions.onAdded.addListener(cb);
      chrome.permissions.onRemoved.addListener(cb);
    },
    /**
     * Wire a switch in the popup or the options page.  It shows on only while
     * the setting is on AND the access is granted (settings sync between
     * browsers, access does not), and `onRender(settings, granted)` lets the
     * page explain the difference.
     */
    bindSwitch(input, onRender) {
      const render = async () => {
        const [s, ok] = await Promise.all([load(), sharePoint.granted()]);
        input.checked = s.sharePoint && ok;
        if (onRender) onRender(s, ok);
      };
      input.addEventListener('change', async () => {
        if (input.checked) await sharePoint.enable(); // asks for access synchronously, inside this gesture
        else await sharePoint.disable();
        render();
      });
      onChange(render);
      sharePoint.onAccessChange(render);
      render();
      return render;
    },
  };
  CAPD.sharePoint = sharePoint;
})(typeof globalThis !== 'undefined' ? globalThis : this);
