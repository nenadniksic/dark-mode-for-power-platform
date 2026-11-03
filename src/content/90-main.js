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

  /* ---------------------------------------------------------------- */
  /* Engine                                                           */
  /* ---------------------------------------------------------------- */
  class Engine {
    constructor() {
      this.trees = new Map(); // Document|ShadowRoot -> { sm, inline, obs }
      this.settings = null;
      this.opts = null;
      this.onAdopted = () => { for (const t of this.trees.values()) t.sm.scan(); };
      this.onShadow = (e) => { const r = e.target && e.target.shadowRoot; if (r) this.manage(r); };
    }

    update(settings) {
      const first = !this.settings;
      this.settings = settings;
      this.opts = { surface: settings.surface, contrast: settings.contrast, iconAdapt: settings.iconAdapt };
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
      return { opts: this.opts, isExcludedVar: CAPD.staticTheme.isExcludedVar, limitSelector: isDoc ? CAPD.CANVAS_LIMIT_SELECTOR : null };
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

  function effective(settings) {
    const s = { ...settings };
    if (root.__capdSettings) Object.assign(s, root.__capdSettings); // standalone test harness
    if (s.contrast === 'standard' && mqContrast.matches) s.contrast = 'high';
    return s;
  }

  function shouldRun(s) {
    if (!s.enabled) return false;
    if (mqForced.matches) return false;                       // Windows High Contrast owns the colours
    if (s.mode === 'system' && !mqDark.matches) return false;
    if ((role === 'maker' || role === 'maker-frame') && !s.makerPortal) return false;
    return true;
  }

  function apply(settings) {
    const s = effective(settings);
    const on = shouldRun(s);
    writeCache({ active: on, attrs: CAPD.staticTheme.htmlAttrs(s), at: Date.now() });
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

  // Console helpers for diagnostics: CAPD.stats() in the frame's console.
  CAPD.stats = () => {
    if (!engine) return { active: false, role };
    const out = { active: true, role, trees: [] };
    for (const [target, t] of engine.trees) out.trees.push({ target: target === document ? 'document' : 'shadow', ...t.sm.stats, overrides: t.sm.overrides.size });
    return out;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
