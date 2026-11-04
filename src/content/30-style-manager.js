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
  /*
   * Page styles are rewritten as soon as they appear, before the browser
   * paints them: in the MutationObserver callback (a microtask after the
   * page's own script) or else in the next animation frame (also before its
   * paint).  A trailing timer used to wait 60-400 ms instead, so a page that
   * keeps adding styles while it builds (SharePoint adds 300 in two seconds)
   * painted light and turned dark in waves.  The budget caps the work done
   * before any one paint, so a huge burst cannot freeze the page.
   */
  const FRAME_BUDGET_MS = 40;
  const nextFrame = typeof requestAnimationFrame === 'function' ? (cb) => requestAnimationFrame(cb) : (cb) => setTimeout(cb, 16);
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
      this.frameArmed = false;
      this.spent = 0;               // ms of rewriting since the last frame
      this.recheck = false;         // look again next frame: see armFrame()
      this.disposed = false;
      this.stats = { sheets: 0, appends: 0, rules: 0, foreign: 0, ms: 0, frames: 0 };
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

    /** Rewrite every page sheet that is new or changed. */
    scan() {
      if (this.disposed) return;
      this.collect();
      this.flushSoon();
    }

    /** Queue every page sheet that is new or changed; drop overrides of sheets that are gone. */
    collect() {
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

    /** Rewrite what is pending now, within this frame's budget; the rest goes to the next frame. */
    flushSoon() {
      if (this.disposed || !this.pending.size) return;
      if (this.spent < FRAME_BUDGET_MS) this.flush();
      if (this.pending.size || this.recheck) this.armFrame();
    }

    /**
     * One callback per frame, before its paint: finish what the budget left
     * over, and look at the page's sheets once more.  The MAIN-world hook
     * stamps a sheet at most once per frame, so rules a library inserts a few
     * milliseconds after the stamp carry no signal of their own; a sheet
     * rewritten this frame is checked again in the next one, until a frame
     * finds nothing new.
     */
    armFrame() {
      if (this.frameArmed || this.disposed) return;
      this.frameArmed = true;
      nextFrame(() => {
        this.frameArmed = false;
        if (this.disposed) return;
        this.stats.frames++;
        this.spent = 0;
        if (this.recheck) { this.recheck = false; this.collect(); }
        if (this.pending.size) this.flush();
        if (this.pending.size || this.recheck) this.armFrame();
      });
    }

    /** Rewrite pending sheets until the frame's budget is spent. */
    flush() {
      if (this.disposed) return;
      const started = performance.now();
      const it = this.pending.values();
      let next = it.next();
      while (!next.done) {
        const sheet = next.value;
        this.pending.delete(sheet);
        this.process(sheet);
        this.recheck = true;
        if (this.spent + performance.now() - started > FRAME_BUDGET_MS) break;
        next = it.next();
      }
      this.spent += performance.now() - started;
      if (!this.pending.size) this.ensureOrder();
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
      if (sheet.disabled) { rec.el.textContent = ''; rec.count = 0; return; }
      const owner = sheet.ownerNode;
      if (this.options.onBrand && owner && owner.id && owner.id.indexOf('fui-FluentProvider') === 0) this.readBrand(sheet, owner.id);
      const ctx = this.ctx();
      if (this.appendNew(sheet, rec, ctx)) { this.stats.ms += performance.now() - t0; return; }
      let css = null;
      try {
        css = rewriter.rewriteSheet(sheet, ctx);
        this.remember(sheet, rec);
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

    /** Note where a sheet ended when it was last rewritten, so growth can be told from change. */
    remember(sheet, rec) {
      const rules = sheet.cssRules;
      const n = rules.length;
      rec.count = n;
      rec.head = n ? rules[0].cssText : '';
      rec.tail = n ? rules[n - 1].cssText : '';
    }

    /**
     * CSS-in-JS libraries (merge-styles, Griffel, load-themed-styles) grow a
     * sheet by adding rules at its end, often one component at a time.  When
     * the rules seen last time are still where they were (same first and last
     * rule), rewrite only the new ones and append them; any other change gets
     * a full rewrite.  Rewriting a sheet of thousands of rules for every few
     * new ones was most of the work while SharePoint builds a page.
     */
    appendNew(sheet, rec, ctx) {
      if (!rec.count) return false;
      let rules;
      try { rules = sheet.cssRules; } catch (e) { return false; }
      const n = rules.length;
      if (n <= rec.count || rules[0].cssText !== rec.head || rules[rec.count - 1].cssText !== rec.tail) return false;
      const added = [];
      for (let i = rec.count; i < n; i++) added.push(rules[i]);
      const css = rewriter.rewriteRules(added, ctx, 0);
      for (const f of ctx.foreign) this.processForeign(sheet, rec, f.url, f.media, true);
      rec.count = n;
      rec.tail = rules[n - 1].cssText;
      if (css) rec.el.appendChild(this.doc.createTextNode(rewriter.scoped(css, this.options.limitSelector)));
      this.stats.appends++;
      return true;
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
      for (const [sheet, rec] of this.overrides) { rec.count = 0; this.pending.add(sheet); } // new settings: rewrite in full
      this.flushSoon();
    }

    dispose() {
      this.disposed = true;
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
