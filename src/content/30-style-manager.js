/*
 * Dark Mode for Power Platform — style manager.
 *
 * Owns every <style> element the extension injects into a document (or a
 * shadow root): the static theme, one override sheet per page stylesheet,
 * and the inline-colour rules.  Keeps them last in the tree so they win
 * ties on order of appearance, and re-processes page stylesheets when the
 * MAIN-world hook reports CSSOM changes.
 */
(function (root) {
  'use strict';
  const CAPD = (root.CAPD = root.CAPD || {});
  const rewriter = CAPD.rewriter;

  const FETCH_TIMEOUT_MS = 15000;
  const sheetText = new Map(); // url -> Promise<string|null>

  /** Fetch cross-origin stylesheet text, first directly (CORS), then via the service worker. */
  function fetchSheetText(url) {
    if (sheetText.has(url)) return sheetText.get(url);
    const p = (async () => {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
        const res = await fetch(url, { mode: 'cors', credentials: 'omit', signal: ctrl.signal });
        clearTimeout(timer);
        if (res.ok) return await res.text();
      } catch (e) { /* fall through to the background relay */ }
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
          const reply = await chrome.runtime.sendMessage({ type: 'capd:fetch-css', url });
          if (reply && typeof reply.text === 'string') return reply.text;
        }
      } catch (e) { /* ignore */ }
      return null;
    })();
    sheetText.set(url, p);
    return p;
  }

  class StyleManager {
    /**
     * @param {Document|ShadowRoot} target  the tree to manage
     * @param {object} options { opts, isExcludedVar, limitSelector, scheduler }
     */
    constructor(target, options) {
      this.target = target;
      this.doc = target.ownerDocument || target;
      this.options = options;
      this.isShadow = !(target instanceof Document);
      this.container = this.isShadow ? target : this.doc.documentElement;
      this.staticEl = null;
      this.tunedEl = null;
      this.inlineEl = null;
      this.overrides = new Map();   // CSSStyleSheet -> { el, signature }
      this.pending = new Set();     // sheets scheduled for (re)processing
      this.flushTimer = 0;
      this.pendingSince = 0;
      this.disposed = false;
      this.stats = { sheets: 0, rules: 0, foreign: 0, ms: 0 };
    }

    makeStyle(kind) {
      const el = this.doc.createElement('style');
      el.setAttribute(CAPD.STYLE_ATTR, kind);
      return el;
    }

    /** Install / replace the static theme CSS. */
    setStaticCSS(css) {
      if (!this.staticEl) {
        this.staticEl = this.makeStyle('static');
        this.container.appendChild(this.staticEl);
      }
      if (this.staticEl.textContent !== css) this.staticEl.textContent = css;
      this.ensureOrder();
    }

    /** Hand-written theme rules; placed after the generated overrides so they win ties. */
    setTunedCSS(css) {
      if (!this.tunedEl) {
        this.tunedEl = this.makeStyle('tuned');
        this.container.appendChild(this.tunedEl);
      }
      if (this.tunedEl.textContent !== css) this.tunedEl.textContent = css;
      this.ensureOrder();
    }

    setInlineCSS(css) {
      if (!this.inlineEl) {
        this.inlineEl = this.makeStyle('inline');
        this.container.appendChild(this.inlineEl);
      }
      if (this.inlineEl.textContent !== css) this.inlineEl.textContent = css;
      this.ensureOrder();
    }

    /** All page stylesheets of the managed tree. */
    pageSheets() {
      const list = [];
      const sheets = this.target.styleSheets;
      for (let i = 0; i < sheets.length; i++) {
        const s = sheets[i];
        if (this.isOwn(s)) continue;
        list.push(s);
      }
      const adopted = this.target.adoptedStyleSheets;
      if (adopted) for (const s of adopted) list.push(s);
      return list;
    }

    isOwn(sheet) {
      const node = sheet.ownerNode;
      return !!(node && node.getAttribute && node.getAttribute(CAPD.STYLE_ATTR));
    }

    /** Schedule every page sheet (new or changed) for processing. */
    scan() {
      if (this.disposed) return;
      const live = new Set();
      for (const sheet of this.pageSheets()) {
        live.add(sheet);
        const rec = this.overrides.get(sheet);
        const sig = this.signature(sheet);
        if (!rec || rec.signature !== sig) this.pending.add(sheet);
      }
      // drop overrides for sheets that are gone
      for (const [sheet, rec] of this.overrides) {
        if (!live.has(sheet)) { rec.el.remove(); this.overrides.delete(sheet); }
      }
      this.flushSoon();
    }

    /** Re-process the sheet owned by this <style>/<link> node (CSSOM hook signal). */
    touchNode(node) {
      const sheet = node.sheet;
      if (sheet && !this.isOwn(sheet)) { this.pending.add(sheet); this.flushSoon(); }
    }

    signature(sheet) {
      let n = -1;
      try { n = sheet.cssRules.length; } catch (e) { n = -2; }
      const node = sheet.ownerNode;
      const rev = node && node.getAttribute ? node.getAttribute(CAPD.REV_ATTR) || '' : '';
      return `${n}|${rev}|${sheet.href || ''}|${sheet.disabled ? 1 : 0}`;
    }

    /**
     * Trailing debounce: CSS-in-JS libraries insert rules in bursts, so wait
     * for a short quiet period, but never longer than ~400 ms in total.
     */
    flushSoon() {
      if (this.disposed) return;
      const now = performance.now();
      if (!this.pendingSince) this.pendingSince = now;
      if (this.flushTimer) {
        if (now - this.pendingSince < 400) clearTimeout(this.flushTimer);
        else return;
      }
      this.flushTimer = setTimeout(() => { this.flushTimer = 0; this.pendingSince = 0; this.flush(); }, 60);
    }

    /** Process pending sheets in time slices so large bursts never jank the page. */
    flush() {
      if (this.disposed) return;
      const started = performance.now();
      const budget = 10;
      const it = this.pending.values();
      let next = it.next();
      while (!next.done) {
        const sheet = next.value;
        this.pending.delete(sheet);
        this.process(sheet);
        if (performance.now() - started > budget) break;
        next = it.next();
      }
      if (this.pending.size) this.flushSoon();
      else this.ensureOrder();
    }

    ctx() {
      const foreign = [];
      return {
        opts: this.options.opts,
        isExcludedVar: this.options.isExcludedVar,
        scoped: !!this.options.limitSelector,
        onForeign: (url, media) => foreign.push({ url, media }),
        onError: (e) => CAPD.log('rule error', e),
        foreign,
      };
    }

    process(sheet) {
      const t0 = performance.now();
      let rec = this.overrides.get(sheet);
      if (!rec) {
        rec = { el: this.makeStyle('override'), signature: '' };
        this.overrides.set(sheet, rec);
        this.container.appendChild(rec.el);
      }
      rec.signature = this.signature(sheet);
      if (sheet.disabled) { rec.el.textContent = ''; return; }
      const owner = sheet.ownerNode;
      if (this.options.onBrand && owner && owner.id && owner.id.indexOf('fui-FluentProvider') === 0) this.readBrand(sheet, owner.id);
      const ctx = this.ctx();
      let css = null;
      try {
        css = rewriter.rewriteSheet(sheet, ctx);
      } catch (e) {
        // Cross-origin stylesheet: fetch its text and process a constructed copy.
        if (sheet.href) {
          this.processForeign(sheet, rec, sheet.href, sheet.media && sheet.media.mediaText);
          return;
        }
        css = '';
      }
      for (const f of ctx.foreign) this.processForeign(sheet, rec, f.url, f.media, true);
      const text = rewriter.scoped(css, this.options.limitSelector);
      if (rec.el.textContent !== text) rec.el.textContent = text;
      this.stats.sheets++;
      this.stats.ms += performance.now() - t0;
    }

    /** Report a Fluent v9 provider's light brand colour (its theme's step 80) to the engine. */
    readBrand(sheet, id) {
      try {
        const rules = sheet.cssRules;
        for (let i = 0; i < rules.length; i++) {
          const st = rules[i].style;
          const v = st && st.getPropertyValue('--colorBrandBackground');
          if (v && v.trim()) { this.options.onBrand(v.trim(), id); return; }
        }
      } catch (e) { /* unreadable sheet: keep the current brand */ }
    }

    async processForeign(sheet, rec, url, media, append) {
      this.stats.foreign++;
      const text = await fetchSheetText(url);
      if (this.disposed || text == null) return;
      if (!this.overrides.has(sheet)) return; // sheet went away meanwhile
      let css = '';
      try {
        const constructed = new CSSStyleSheet();
        constructed.replaceSync(text);
        css = rewriter.rewriteRules(constructed.cssRules, this.ctx(), 0);
      } catch (e) {
        CAPD.log('foreign sheet failed', url, e);
        return;
      }
      if (media) css = `@media ${media}{${css}}`;
      const scopedCss = rewriter.scoped(css, this.options.limitSelector);
      if (append) rec.el.textContent += scopedCss;
      else if (rec.el.textContent !== scopedCss) rec.el.textContent = scopedCss;
      this.ensureOrder();
    }

    /**
     * Keep our elements last, in the order: static, page-sheet overrides in
     * page order, inline rules.  Cheap when nothing moved.
     *
     * Another copy of the engine on the same page (the extension installed
     * twice, say from the store and unpacked, or the standalone test bundle)
     * keeps its own elements last as well.  Its elements are tolerated in the
     * tail: if each engine insisted on following the other, every append
     * would trigger the other's observer and the two would re-append forever.
     */
    ensureOrder() {
      if (this.disposed) return;
      const wanted = [];
      if (this.staticEl) wanted.push(this.staticEl);
      for (const sheet of this.pageSheets()) {
        const rec = this.overrides.get(sheet);
        if (rec) wanted.push(rec.el);
      }
      if (this.tunedEl) wanted.push(this.tunedEl);
      if (this.inlineEl) wanted.push(this.inlineEl);
      if (!wanted.length) return;
      if (this.inOrder(wanted)) return;
      for (const el of wanted) this.container.appendChild(el);
    }

    /** True when `wanted` ends the container in order, allowing only other engines' elements in between. */
    inOrder(wanted) {
      const mine = new Set(wanted);
      const kids = this.container.childNodes;
      let w = wanted.length - 1;
      for (let i = kids.length - 1; i >= 0 && w >= 0; i--) {
        const k = kids[i];
        if (k === wanted[w]) { w--; continue; }
        if (mine.has(k)) return false;   // one of ours, out of order
        if (k.nodeType === 1 && k.getAttribute && k.getAttribute(CAPD.STYLE_ATTR)) continue; // another engine's
        return false;                    // a page node sits among ours
      }
      return w < 0;
    }

    /** Regenerate everything (settings changed). */
    rebuild(options) {
      if (options) this.options = { ...this.options, ...options };
      for (const sheet of this.overrides.keys()) this.pending.add(sheet);
      this.flushSoon();
    }

    dispose() {
      this.disposed = true;
      clearTimeout(this.flushTimer);
      if (this.staticEl) this.staticEl.remove();
      if (this.tunedEl) this.tunedEl.remove();
      if (this.inlineEl) this.inlineEl.remove();
      for (const rec of this.overrides.values()) rec.el.remove();
      this.overrides.clear();
      this.pending.clear();
    }
  }

  CAPD.StyleManager = StyleManager;
  CAPD.fetchSheetText = fetchSheetText;
})(typeof globalThis !== 'undefined' ? globalThis : this);
