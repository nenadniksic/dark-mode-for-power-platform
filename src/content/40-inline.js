/*
 * Canvas Studio Dark Mode — inline colour processor.
 *
 * Elements that carry colours in their style attribute (or in SVG fill /
 * stroke presentation attributes) cannot be reached by stylesheet
 * overrides without !important rules that know the value.  For each such
 * element we compute the dark counterparts, store them in --capd-i-* custom
 * properties on the element and flag it with data-capd-inline="bg fg …".
 * Static rules then apply the variables with !important.  The element's own
 * declarations are never removed, so disabling the theme is lossless.
 */
(function (root) {
  'use strict';
  const CAPD = (root.CAPD = root.CAPD || {});
  const color = CAPD.color;
  const rewriter = CAPD.rewriter;

  const INLINE_ATTR = CAPD.INLINE_ATTR;
  const SLOTS = {
    // token -> [custom property, source longhand(s), kind]
    bg: ['--capd-i-bg', ['background-color'], 'bg'],
    bgi: ['--capd-i-bgi', ['background-image'], 'bg'],
    fg: ['--capd-i-fg', ['color'], 'fg'],
    bdt: ['--capd-i-bdt', ['border-top-color'], 'bd'],
    bdr: ['--capd-i-bdr', ['border-right-color'], 'bd'],
    bdb: ['--capd-i-bdb', ['border-bottom-color'], 'bd'],
    bdl: ['--capd-i-bdl', ['border-left-color'], 'bd'],
    ol: ['--capd-i-ol', ['outline-color'], 'bd'],
    sh: ['--capd-i-sh', ['box-shadow'], 'sh'],
    fill: ['--capd-i-fill', ['fill'], 'fg'],
    stroke: ['--capd-i-stroke', ['stroke'], 'fg'],
    caret: ['--capd-i-caret', ['caret-color'], 'fg'],
    tdc: ['--capd-i-tdc', ['text-decoration-color'], 'fg'],
  };

  /** CSS applied once per document to honour the --capd-i-* variables. */
  const INLINE_CSS = Object.entries(SLOTS).map(([token, [prop, longhands]]) =>
    `[${INLINE_ATTR}~="${token}"]{${longhands.map((lh) => `${lh}:var(${prop}) !important;`).join('')}}`).join('');

  const SVG_ATTRS = ['fill', 'stroke'];
  const state = new WeakMap(); // element -> last signature we processed

  function signatureOf(el) {
    const st = el.style;
    const parts = [];
    for (let i = 0; i < st.length; i++) {
      const p = st[i];
      if (p.startsWith('--capd-')) continue;
      if (p.startsWith('--') || CAPD.isColorProp(p)) parts.push(p + ':' + st.getPropertyValue(p));
    }
    for (const a of SVG_ATTRS) { const v = el.getAttribute(a); if (v) parts.push(a + '=' + v); }
    return parts.join(';');
  }

  function isExcluded(el, limitSelector) {
    if (!limitSelector) return false;
    try { return !!el.closest(limitSelector); } catch (e) { return false; }
  }

  class InlineProcessor {
    constructor(options) {
      this.options = options; // { opts, isExcludedVar, limitSelector }
      this.disposed = false;
    }

    static get css() { return INLINE_CSS; }

    /** Process one element (and nothing else). */
    processElement(el) {
      if (this.disposed || !(el instanceof Element)) return;
      if (el.namespaceURI === 'http://www.w3.org/1999/xhtml' && (el.tagName === 'STYLE' || el.tagName === 'SCRIPT' || el.tagName === 'LINK')) return;
      if (el.hasAttribute(CAPD.STYLE_ATTR)) return;
      const sig = signatureOf(el);
      if (state.get(el) === sig) return;
      state.set(el, sig);
      if (isExcluded(el, this.options.limitSelector)) { this.clear(el); return; }
      if (!sig) { this.clear(el); return; }
      const tokens = [];
      const st = el.style;
      const ctx = { opts: this.options.opts, isExcludedVar: this.options.isExcludedVar };
      const iconMode = el.namespaceURI === 'http://www.w3.org/2000/svg';
      if (iconMode && this.options.opts && this.options.opts.iconAdapt === false) { this.clear(el); return; }

      // 1. colour-valued custom properties defined inline -> typed variants
      for (let i = 0; i < st.length; i++) {
        const p = st[i];
        if (!p.startsWith('--') || p.startsWith('--capd-')) continue;
        if (ctx.isExcludedVar && ctx.isExcludedVar(p)) continue;
        const v = st.getPropertyValue(p).trim();
        if (!color.containsColor(v) && !v.includes('var(')) continue;
        if (!color.containsColor(v) && !/colou?r|background|foreground|border|fill|stroke|shadow|brand|theme/i.test(p)) continue;
        for (const kind of rewriter.KINDS) {
          const rw = color.rewriteValue(kind, v, ctx.opts, (expr, k) => rewriter.rewriteVar(expr, k, ctx)) || v;
          this.setVar(el, rewriter.typedName(kind, p), rw);
        }
      }

      // 2. inline colour declarations
      for (const [token, [prop, longhands, kind]] of Object.entries(SLOTS)) {
        const lh = longhands[0];
        let value = st.getPropertyValue(lh);
        let fromAttr = false;
        if (!value && (lh === 'fill' || lh === 'stroke')) { value = el.getAttribute(lh) || ''; fromAttr = true; }
        if (!value) { this.removeVar(el, prop); continue; }
        if (fromAttr && !color.isColorLiteral(value)) { this.removeVar(el, prop); continue; }
        if (!fromAttr && this.isInlineImportant(st, lh)) { this.removeVar(el, prop); continue; }
        const effKind = iconMode && kind === 'fg' ? 'icon' : kind;
        const rw = color.rewriteValue(effKind, value, ctx.opts, (expr, k) => rewriter.rewriteVar(expr, k, ctx));
        if (!rw) { this.removeVar(el, prop); continue; }
        this.setVar(el, prop, rw);
        tokens.push(token);
      }
      const joined = tokens.join(' ');
      if (joined) { if (el.getAttribute(INLINE_ATTR) !== joined) el.setAttribute(INLINE_ATTR, joined); }
      else if (el.hasAttribute(INLINE_ATTR)) el.removeAttribute(INLINE_ATTR);
      // the writes above changed the style attribute; record the new signature
      state.set(el, signatureOf(el));
    }

    isInlineImportant(st, prop) {
      return st.getPropertyPriority(prop) === 'important';
    }

    setVar(el, name, value) {
      if (el.style.getPropertyValue(name) !== value) el.style.setProperty(name, value);
    }

    removeVar(el, name) {
      if (el.style.getPropertyValue(name)) el.style.removeProperty(name);
    }

    clear(el) {
      if (el.hasAttribute(INLINE_ATTR)) el.removeAttribute(INLINE_ATTR);
      const st = el.style;
      const toRemove = [];
      for (let i = 0; i < st.length; i++) if (st[i].startsWith('--capd-')) toRemove.push(st[i]);
      for (const p of toRemove) st.removeProperty(p);
    }

    /** Process an element and every descendant that carries inline colours. */
    processTree(rootEl) {
      if (this.disposed || !(rootEl instanceof Element)) return;
      this.processElement(rootEl);
      const list = rootEl.querySelectorAll('[style],[fill],[stroke]');
      for (let i = 0; i < list.length; i++) this.processElement(list[i]);
    }

    /** Re-run on everything (settings changed). */
    reprocess(rootEl) {
      this.options = { ...this.options };
      const list = rootEl.querySelectorAll('[style],[fill],[stroke],[' + INLINE_ATTR + ']');
      for (let i = 0; i < list.length; i++) { state.delete(list[i]); this.processElement(list[i]); }
    }

    /** Remove all traces from a tree. */
    dispose(rootEl) {
      this.disposed = true;
      if (!rootEl) return;
      const list = rootEl.querySelectorAll('[' + INLINE_ATTR + '],[style*="--capd-"]');
      for (let i = 0; i < list.length; i++) { this.clear(list[i]); state.delete(list[i]); }
    }
  }

  CAPD.InlineProcessor = InlineProcessor;
  CAPD.inlineSignature = signatureOf;
})(typeof globalThis !== 'undefined' ? globalThis : this);
