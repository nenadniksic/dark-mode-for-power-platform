/*
 * Canvas Studio Dark Mode — content-script entry point.
 *
 * Decides whether this frame is part of the Power Apps maker experience,
 * applies a flash-free fallback from a cached state, loads settings and
 * runs the theme engine: static layers + CSSOM rewriting + inline colours +
 * mutation tracking, for the document and any open shadow roots.
 */
(function (root) {
  'use strict';
  const CAPD = root.CAPD;
  if (!CAPD || CAPD.booted) return;
  CAPD.booted = true;
  if (typeof document === 'undefined' || !document.documentElement) return;
  if (!/html/i.test(document.contentType || 'text/html')) return;

  /* ---------------------------------------------------------------- */
  /* Where are we?                                                    */
  /* ---------------------------------------------------------------- */
  function detectRole() {
    const loc = location;
    const host = loc.hostname.toLowerCase();
    const path = loc.pathname;
    const isTop = (() => { try { return window.top === window; } catch (e) { return false; } })();
    const makerHost = /^make(\.preview|\.test)?\.powerapps\.(com|cn)$/.test(host) || /^make\.(gov|high)\.powerapps\.us$/.test(host) || host === 'make.apps.appsplatform.us';
    if (makerHost) {
      if (/\/canvas(\/|$)/.test(path)) return isTop ? 'studio-host' : 'maker-frame';
      return isTop ? 'maker' : 'maker-frame';
    }
    // Power Automate: its own portal and designer, and the Flows pages the
    // Power Apps portal embeds from it (an iframe named widgetIFrame).
    const automateHost = /^make(\.preview|\.test)?\.powerautomate\.(com|cn)$/.test(host) || /^make\.(gov|high)\.powerautomate\.us$/.test(host) || /(^|\.)flow\.microsoft\.com$/.test(host);
    if (automateHost) return isTop ? 'automate' : 'automate-frame';
    if (host === 'apps.powerapps.com' || /^apps\./.test(host) || /\/play\//.test(path) || /webplayer|iframeapp|\/player\//i.test(path)) return 'player';
    if (/^authoring\./.test(host) || /\.gateway\.prod\.island\.powerapps\./.test(host) || window.name === 'EmbeddedStudio' || window.name === 'preloadStudio' || /\/embed\/?$/.test(path)) return 'studio';
    try {
      const ao = loc.ancestorOrigins;
      if (ao && ao.length && /^https:\/\/make(\.preview|\.test)?\.powerapps\.(com|cn)$|^https:\/\/make\.(gov|high)\.powerapps\.us$|^https:\/\/make\.apps\.appsplatform\.us$/.test(ao[0])) return 'maker-frame';
    } catch (e) { /* ignore */ }
    return 'none';
  }

  const role = detectRole();
  CAPD.role = role;
  /** Roles the "Maker portal pages" setting switches off (Studio is always themed). */
  const PORTAL_ROLES = new Set(['maker', 'maker-frame', 'automate', 'automate-frame']);
  if (role === 'none' || role === 'player') return;

  /* ---------------------------------------------------------------- */
  /* Flash-free start: remember the last state per origin             */
  /* ---------------------------------------------------------------- */
  const LS_KEY = 'capd:v1';
  function readCache() { try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) { return null; } }
  function writeCache(v) { try { localStorage.setItem(LS_KEY, JSON.stringify(v)); } catch (e) { /* ignore */ } }

  const html = document.documentElement;
  let fallbackEl = null;
  function setFallback(on) {
    if (on && !fallbackEl) {
      fallbackEl = document.createElement('style');
      fallbackEl.setAttribute(CAPD.STYLE_ATTR, 'fallback');
      fallbackEl.textContent = (CAPD.themeCSS && CAPD.themeCSS.fallback) || '';
      html.appendChild(fallbackEl);
    } else if (!on && fallbackEl) {
      fallbackEl.remove(); fallbackEl = null;
    }
  }
  function setHtmlAttrs(attrs) {
    for (const [k, v] of Object.entries(attrs)) if (html.getAttribute(k) !== v) html.setAttribute(k, v);
  }
  function clearHtmlAttrs() {
    for (const a of [...html.attributes]) if (a.name.startsWith('data-capd')) html.removeAttribute(a.name);
  }

  const cached = readCache();
  if (cached && cached.active && cached.attrs) { setHtmlAttrs(cached.attrs); setFallback(true); }
  // The page's brand colour from the last visit, so the first paint already
  // uses it (Power Automate is blue, not Power Apps purple).
  if (cached && typeof cached.brand === 'string') CAPD.brandSeed = cached.brand;

  /* ---------------------------------------------------------------- */
  /* Engine                                                           */
  /* ---------------------------------------------------------------- */
  class Engine {
    constructor() {
      this.trees = new Map(); // Document|ShadowRoot -> { sm, inline, obs }
      this.settings = null;
      this.opts = null;
      this.onAdopted = () => { for (const t of this.trees.values()) t.sm.scan(); };
      this.onBrand = (value, id) => this.adoptBrand(value, id);
      this.brandFrom = 0;
      this.onShadow = (e) => { const r = e.target && e.target.shadowRoot; if (r) this.manage(r); };
    }

    update(settings) {
      const first = !this.settings;
      this.settings = settings;
      this.opts = { surface: settings.surface, contrast: settings.contrast, iconAdapt: settings.iconAdapt, look: settings.look };
      setHtmlAttrs(CAPD.staticTheme.htmlAttrs(settings));
      if (first) {
        document.addEventListener('capd:adopted', this.onAdopted, true);
        document.addEventListener('capd:shadow', this.onShadow, true);
        this.manage(document);
        // pick up shadow roots that already exist
        const all = document.querySelectorAll('*');
        for (let i = 0; i < all.length; i++) if (all[i].shadowRoot) this.manage(all[i].shadowRoot);
      } else {
        for (const [target, t] of this.trees) this.refresh(target, t);
      }
    }

    managerOptions(target) {
      const isDoc = target === document;
      return { opts: this.opts, isExcludedVar: CAPD.staticTheme.isExcludedVar, limitSelector: isDoc ? CAPD.CANVAS_LIMIT_SELECTOR : null, onBrand: this.onBrand };
    }

    /**
     * A FluentProvider declared its brand.  The root provider (the lowest
     * number, fui-FluentProvider1) decides; nested providers for callouts or
     * Copilot panes do not repaint the whole page.
     */
    adoptBrand(value, id) {
      const n = parseInt(String(id).replace(/^\D+/, ''), 10) || 1;
      if (this.brandFrom && this.brandFrom < n) return;
      const c = CAPD.color.parse(value);
      if (!c) return;
      this.brandFrom = n;
      const seed = CAPD.color.toHex(c);
      if (seed === CAPD.brandSeed) return;
      CAPD.brandSeed = seed;
      writeCache({ ...(readCache() || {}), brand: seed });
      for (const [target, t] of this.trees) this.installCSS(target, t);
    }

    manage(target) {
      if (this.trees.has(target)) return;
      const isDoc = target === document;
      const sm = new CAPD.StyleManager(target, this.managerOptions(target));
      const inline = new CAPD.InlineProcessor(this.managerOptions(target));
      const obs = new CAPD.DomObserver(target, { styleManager: sm, inline, onShadowRoot: (r) => this.manage(r) });
      const t = { sm, inline, obs };
      this.trees.set(target, t);
      this.installCSS(target, t);
      obs.start();
      sm.scan();
      const rootEl = isDoc ? document.documentElement : target;
      if (isDoc) inline.processTree(rootEl);
      else for (const child of target.children) inline.processTree(child);
      CAPD.log('managing', isDoc ? 'document' : 'shadow root', role);
    }

    installCSS(target, t) {
      const isDoc = target === document;
      t.sm.setStaticCSS(CAPD.staticTheme.buildStatic(this.settings, isDoc));
      t.sm.setTunedCSS(CAPD.staticTheme.buildTuned(this.settings, role, isDoc));
      t.sm.setInlineCSS(CAPD.staticTheme.buildInline(isDoc));
    }

    refresh(target, t) {
      const o = this.managerOptions(target);
      this.installCSS(target, t);
      t.sm.rebuild(o);
      t.inline.options = o;
      const rootEl = target === document ? document.documentElement : target;
      if (target === document) t.inline.reprocess(rootEl);
      else for (const child of target.children) t.inline.reprocess(child);
    }

    stop() {
      document.removeEventListener('capd:adopted', this.onAdopted, true);
      document.removeEventListener('capd:shadow', this.onShadow, true);
      for (const [target, t] of this.trees) {
        t.obs.stop();
        t.sm.dispose();
        if (target === document) t.inline.dispose(document.documentElement);
        else for (const child of target.children) t.inline.dispose(child);
      }
      this.trees.clear();
    }
  }

  /* ---------------------------------------------------------------- */
  /* Settings → engine                                                */
  /* ---------------------------------------------------------------- */
  const mq = (q) => { try { return matchMedia(q); } catch (e) { return { matches: false, addEventListener() {} }; } };
  const mqDark = mq('(prefers-color-scheme: dark)');
  const mqForced = mq('(forced-colors: active)');
  const mqContrast = mq('(prefers-contrast: more)');

  let engine = null;

  /* Developer diagnostics can preview other settings in this page until it
     reloads (capd:override); nothing is saved. */
  let devOverride = null;
  const OVERRIDABLE = ['look', 'surface', 'contrast', 'backdrop', 'iconAdapt'];

  function effective(settings) {
    const s = { ...settings };
    if (root.__capdSettings) Object.assign(s, root.__capdSettings); // standalone test harness
    if (devOverride && settings.devDiagnostics) Object.assign(s, devOverride);
    if (s.contrast === 'standard' && mqContrast.matches) s.contrast = 'high';
    return s;
  }

  function shouldRun(s) {
    if (!s.enabled) return false;
    if (mqForced.matches) return false;                       // Windows High Contrast owns the colours
    if (s.mode === 'system' && !mqDark.matches) return false;
    if (PORTAL_ROLES.has(role) && !s.makerPortal) return false;
    return true;
  }

  let lastSettings = null;
  function apply(settings) {
    lastSettings = settings;
    const s = effective(settings);
    const on = shouldRun(s);
    if (!devOverride) writeCache({ ...(readCache() || {}), active: on, attrs: CAPD.staticTheme.htmlAttrs(s), at: Date.now() });
    if (on) {
      if (!engine) engine = new Engine();
      engine.update(s);
      setFallback(true); // harmless baseline that also covers frames created later
    } else {
      if (engine) { engine.stop(); engine = null; }
      setFallback(false);
      clearHtmlAttrs();
    }
    CAPD.active = on;
  }

  function reload() { CAPD.settings.load().then(apply).catch((e) => CAPD.warn('settings', e)); }
  reload();
  CAPD.settings.onChange(apply);
  for (const m of [mqDark, mqForced, mqContrast]) { try { m.addEventListener('change', reload); } catch (e) { /* ignore */ } }

  /** Full removal (used by the test harness and when the extension is unloaded). */
  CAPD.teardown = () => {
    if (engine) { engine.stop(); engine = null; }
    setFallback(false);
    clearHtmlAttrs();
    CAPD.active = false;
    CAPD.booted = false;
  };

  /*
   * Diagnostics bridge.  Studio and the Flows pages run in cross-origin
   * frames, where the console needs a context switch to reach CAPD.audit().
   * The maker page that embeds a frame (or a maker page itself) can request
   * the audit by message instead:
   *   frames[0].postMessage({ type: 'capd:audit' }, '*')     // a framed page
   *   postMessage({ type: 'capd:audit' }, location.origin)   // this page
   * and receives { type: 'capd:audit-result', role, frame, result }.  Only
   * the direct parent or the page itself is answered, only on a Power Apps
   * or Power Automate maker origin, and only with style diagnostics.
   */
  const MAKER_ORIGIN_RE = /^https:\/\/make(\.preview|\.test)?\.(powerapps|powerautomate)\.(com|cn)$|^https:\/\/make\.(gov|high)\.(powerapps|powerautomate)\.us$|^https:\/\/make\.apps\.appsplatform\.us$/;
  /*
   * With "Developer diagnostics" switched on in the options page (off by
   * default), the same bridge also answers
   *   { type: 'capd:inspect', x, y }  or  { type: 'capd:inspect', selector }
   * with the elements there and the colour rules that apply to them, and
   *   { type: 'capd:probe-css', css }
   * by installing test CSS last in the page (an empty string removes it), and
   *   { type: 'capd:override', settings: { look: 'neon' } }
   * by previewing those settings in this page until it reloads (null clears).
   */
  let probeEl = null;
  function probeCSS(css) {
    if (!css) { if (probeEl) { probeEl.remove(); probeEl = null; } return { removed: true }; }
    if (!probeEl) { probeEl = document.createElement('style'); probeEl.setAttribute(CAPD.STYLE_ATTR, 'probe'); }
    probeEl.textContent = String(css);
    document.documentElement.appendChild(probeEl);
    return { installed: probeEl.textContent.length };
  }
  const BRIDGE_TYPES = { 'capd:audit': 'capd:audit-result', 'capd:inspect': 'capd:inspect-result', 'capd:probe-css': 'capd:probe-css-result', 'capd:override': 'capd:override-result' };
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || typeof d !== 'object' || !Object.prototype.hasOwnProperty.call(BRIDGE_TYPES, d.type)) return;
    if (!MAKER_ORIGIN_RE.test(e.origin)) return;
    const fromParent = window.parent !== window && e.source === window.parent;
    const fromSelf = e.source === window && e.origin === location.origin;
    if (!fromParent && !fromSelf) return;
    let result;
    try {
      if (d.type === 'capd:audit') result = !CAPD.active ? { inactive: true } : CAPD.audit ? CAPD.audit({ limit: Math.min(+d.limit || 40, 200) }) : { error: 'audit unavailable' };
      else if (!(lastSettings && lastSettings.devDiagnostics)) result = { error: 'Developer diagnostics is off (extension options)' };
      else if (d.type === 'capd:inspect') result = CAPD.inspect({ x: +d.x, y: +d.y, selector: typeof d.selector === 'string' ? d.selector : undefined, depth: +d.depth || 3, ancestors: Math.min(+d.ancestors || 0, 8), max: Math.min(+d.max || 3, 10) });
      else if (d.type === 'capd:override') {
        const o = d.settings && typeof d.settings === 'object' ? d.settings : null;
        devOverride = o ? Object.fromEntries(OVERRIDABLE.filter((k) => k in o).map((k) => [k, o[k]])) : null;
        apply(lastSettings);
        result = { override: devOverride, look: CAPD.staticTheme.htmlAttrs(effective(lastSettings))['data-capd-look'] };
      }
      else result = probeCSS(typeof d.css === 'string' ? d.css : '');
    } catch (err) { result = { error: String((err && err.message) || err) }; }
    try { e.source.postMessage({ type: BRIDGE_TYPES[d.type], id: d.id, role, frame: location.origin + location.pathname, result }, e.origin); } catch (err) { /* ignore */ }
  });

  // Console helpers for diagnostics: CAPD.stats() in the frame's console.
  CAPD.stats = () => {
    if (!engine) return { active: false, role };
    const out = { active: true, role, trees: [] };
    for (const [target, t] of engine.trees) out.trees.push({ target: target === document ? 'document' : 'shadow', ...t.sm.stats, overrides: t.sm.overrides.size });
    return out;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
