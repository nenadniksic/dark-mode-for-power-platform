/*
 * Canvas Studio Dark Mode — shared namespace and constants for the content
 * scripts.  Every content-script file attaches itself to globalThis.CAPD.
 */
(function (root) {
  'use strict';
  const CAPD = (root.CAPD = root.CAPD || {});

  CAPD.VERSION = '1.0.0';
  CAPD.ATTR = 'data-capd';                 // on <html>: "dark" while active
  CAPD.INLINE_ATTR = 'data-capd-inline';   // on elements whose inline colours were adapted
  CAPD.REV_ATTR = 'data-capd-rev';         // set by the MAIN-world CSSOM hook on <style>/<link>
  CAPD.STYLE_ATTR = 'data-capd-style';     // on every <style> the extension owns

  /**
   * Subtrees the theme must never recolour: the app being designed.  Used as
   * the `to (...)` limit of every @scope block and by the inline processor.
   */
  CAPD.CANVAS_LIMIT_SELECTOR = '#publishedCanvas, .app-canvas, [data-capd-keep]';

  /** Properties whose values are colours, grouped by the role of the colour. */
  CAPD.PROP_KIND = {
    'color': 'fg', 'caret-color': 'fg', 'text-decoration-color': 'fg', 'text-emphasis-color': 'fg',
    '-webkit-text-fill-color': 'fg', '-webkit-text-stroke-color': 'fg', 'fill': 'fg', 'stroke': 'fg',
    'lighting-color': 'fg', 'flood-color': 'fg', 'stop-color': 'fg', 'accent-color': 'fg',
    'background-color': 'bg', 'background': 'bg', 'background-image': 'bg',
    'border-color': 'bd', 'border-top-color': 'bd', 'border-right-color': 'bd', 'border-bottom-color': 'bd', 'border-left-color': 'bd',
    'border-block-start-color': 'bd', 'border-block-end-color': 'bd', 'border-inline-start-color': 'bd', 'border-inline-end-color': 'bd',
    'border': 'bd', 'border-top': 'bd', 'border-right': 'bd', 'border-bottom': 'bd', 'border-left': 'bd',
    'outline-color': 'bd', 'outline': 'bd', 'column-rule-color': 'bd', 'column-rule': 'bd',
    'border-image': 'bd', 'border-image-source': 'bd',
    'box-shadow': 'sh', 'text-shadow': 'sh', 'filter': 'sh',
    'scrollbar-color': 'bg',
  };

  CAPD.isColorProp = (prop) => Object.prototype.hasOwnProperty.call(CAPD.PROP_KIND, prop);

  /* Minimal logger; only chatty when CAPD.debug is set from the console. */
  CAPD.debug = false;
  CAPD.log = function () { if (CAPD.debug) console.debug('[capd]', ...arguments); };
  CAPD.warn = function () { console.warn('[capd]', ...arguments); };
})(typeof globalThis !== 'undefined' ? globalThis : this);
