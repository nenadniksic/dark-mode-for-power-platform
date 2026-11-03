/*
 * Canvas Studio Dark Mode — DOM observer.
 *
 * One MutationObserver per managed tree wires the page's changes to the
 * style manager (new / changed stylesheets) and the inline processor (new
 * elements, style / fill / stroke attribute changes).  CSSOM mutations that
 * do not surface as DOM mutations are reported by the MAIN-world hook via a
 * data-capd-rev attribute on the owning <style>, which this observer sees.
 */
(function (root) {
  'use strict';
  const CAPD = (root.CAPD = root.CAPD || {});

  const STYLE_TAGS = new Set(['STYLE', 'LINK']);
  const isStyleNode = (n) => n && n.nodeType === 1 && STYLE_TAGS.has(n.tagName) && (n.tagName !== 'LINK' || /stylesheet/i.test(n.rel || ''));

  class DomObserver {
    constructor(target, handlers) {
      this.target = target;         // Document or ShadowRoot
      this.h = handlers;            // { styleManager, inline, onShadowRoot }
      this.observer = null;
      this.scanTimer = 0;
    }

    start() {
      if (this.observer) return;
      this.observer = new MutationObserver((muts) => this.onMutations(muts));
      this.observer.observe(this.target, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'fill', 'stroke', CAPD.REV_ATTR, 'href', 'media', 'disabled', 'rel'],
      });
    }

    stop() {
      if (this.observer) { this.observer.disconnect(); this.observer = null; }
      clearTimeout(this.scanTimer);
    }

    scheduleScan() {
      if (this.scanTimer) return;
      this.scanTimer = setTimeout(() => { this.scanTimer = 0; this.h.styleManager.scan(); }, 20);
    }

    onMutations(muts) {
      const sm = this.h.styleManager;
      const inline = this.h.inline;
      for (let i = 0; i < muts.length; i++) {
        const m = muts[i];
        const t = m.target;
        if (m.type === 'attributes') {
          if (t.nodeType !== 1) continue;
          if (m.attributeName === CAPD.REV_ATTR) { sm.touchNode(t); continue; }
          if (isStyleNode(t)) { this.scheduleScan(); continue; }
          if (t.hasAttribute && t.hasAttribute(CAPD.STYLE_ATTR)) continue;
          inline.processElement(t);
          continue;
        }
        // childList
        if (isStyleNode(t)) { sm.touchNode(t); continue; } // <style> text replaced
        let needScan = false;
        const added = m.addedNodes;
        for (let j = 0; j < added.length; j++) {
          const n = added[j];
          if (n.nodeType !== 1) continue;
          if (isStyleNode(n)) { needScan = true; continue; }
          if (n.hasAttribute && n.hasAttribute(CAPD.STYLE_ATTR)) continue;
          inline.processTree(n);
          if (n.querySelector && n.querySelector('style,link[rel~="stylesheet"]')) needScan = true;
          if (n.shadowRoot && this.h.onShadowRoot) this.h.onShadowRoot(n.shadowRoot);
        }
        const removed = m.removedNodes;
        for (let j = 0; j < removed.length; j++) if (isStyleNode(removed[j])) needScan = true;
        if (needScan) this.scheduleScan();
      }
    }
  }

  CAPD.DomObserver = DomObserver;
})(typeof globalThis !== 'undefined' ? globalThis : this);
