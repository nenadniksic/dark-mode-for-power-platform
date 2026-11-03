/*
 * Dark Mode for Power Platform — MAIN-world CSSOM hooks.
 *
 * Runs in the page's own JavaScript world before any page script.  Studio's
 * CSS-in-JS libraries (Griffel, merge-styles, Aphrodite, Monaco) add rules
 * with CSSStyleSheet.insertRule(), which never produces a DOM mutation.  We
 * wrap those APIs and stamp a data-capd-rev attribute on the owning <style>
 * (or dispatch an event for constructed sheets) so the content script's
 * MutationObserver can re-process the sheet.  Nothing here reads page data
 * or changes behaviour: every wrapper calls through unchanged.
 */
(function () {
  'use strict';
  if (window.__capdHooks) return;
  window.__capdHooks = true;

  const REV = 'data-capd-rev';
  let revision = 0;
  let lastNode = null, lastNodeAt = 0;

  function mark(sheet) {
    try {
      const node = sheet && sheet.ownerNode;
      if (node && node.setAttribute) {
        // Coalesce bursts: at most one stamp per animation frame per node.
        const now = performance.now();
        if (node === lastNode && now - lastNodeAt < 16) return;
        lastNode = node; lastNodeAt = now;
        node.setAttribute(REV, String(++revision));
      } else {
        document.dispatchEvent(new Event('capd:adopted'));
      }
    } catch (e) { /* never break the page */ }
  }

  const proto = CSSStyleSheet.prototype;
  for (const method of ['insertRule', 'deleteRule', 'replaceSync', 'addRule', 'removeRule']) {
    const orig = proto[method];
    if (typeof orig !== 'function') continue;
    Object.defineProperty(proto, method, {
      configurable: true, writable: true, enumerable: false,
      value: function () {
        const result = orig.apply(this, arguments);
        mark(this);
        return result;
      },
    });
  }
  if (typeof proto.replace === 'function') {
    const origReplace = proto.replace;
    Object.defineProperty(proto, 'replace', {
      configurable: true, writable: true, enumerable: false,
      value: function () {
        const p = origReplace.apply(this, arguments);
        if (p && typeof p.then === 'function') p.then(() => mark(this), () => {});
        return p;
      },
    });
  }

  for (const P of [Document.prototype, typeof ShadowRoot !== 'undefined' ? ShadowRoot.prototype : null]) {
    if (!P) continue;
    const d = Object.getOwnPropertyDescriptor(P, 'adoptedStyleSheets');
    if (!d || !d.set) continue;
    Object.defineProperty(P, 'adoptedStyleSheets', {
      configurable: true, enumerable: d.enumerable,
      get: d.get,
      set: function (v) {
        d.set.call(this, v);
        try {
          const node = this.host || this;
          node.dispatchEvent(new Event('capd:adopted', { bubbles: true, composed: true }));
        } catch (e) { /* ignore */ }
      },
    });
  }

  const attachShadow = Element.prototype.attachShadow;
  if (typeof attachShadow === 'function') {
    Element.prototype.attachShadow = function (init) {
      const rootNode = attachShadow.call(this, init);
      try { this.dispatchEvent(new Event('capd:shadow', { bubbles: true, composed: true })); } catch (e) { /* ignore */ }
      return rootNode;
    };
  }
})();
