/*
 * Dark Mode for Power Platform — shared namespace and constants for the content
 * scripts.  Every content-script file attaches itself to globalThis.CAPD.
 */
(function (root) {
  'use strict';
  const CAPD = (root.CAPD = root.CAPD || {});

  CAPD.VERSION = '1.2.1';
  CAPD.ATTR = 'data-capd';                 // on <html>: "dark" while active
  CAPD.INLINE_ATTR = 'data-capd-inline';   // on elements whose inline colours were adapted
  CAPD.REV_ATTR = 'data-capd-rev';         // set by the MAIN-world CSSOM hook on <style>/<link>
  CAPD.STYLE_ATTR = 'data-capd-style';     // on every <style> the extension owns

  /**
   * Colour previews show a value the maker is choosing, so they must show it
   * as it is: Studio's palette swatches and property swatches, Fluent v8's
   * ColorPicker area and sliders, Fluent v9's colour components.  Recolouring
   * them made the picker lie (Fluent blue shown lightened, the white-to-hue
   * gradient shown dark, the hue slider dimmed).
   */
  CAPD.TRUE_COLOR_SELECTOR = [
    '[class*="pickerFill_"]', '[class*="pickerBackground_"]',          // Studio (Aphrodite) swatches
    '.ms-ColorPicker-colorRect', '.ms-ColorPicker-slider',              // Fluent v8 ColorPicker
    '.fui-ColorArea', '.fui-ColorSlider', '.fui-AlphaSlider', '.fui-ColorSwatch', // Fluent v9
  ].join(', ');

  /**
   * Studio affordances drawn over the app canvas keep their light look, so
   * they read against the (light) app: the "+" insert button on an empty
   * container was a dark disc with a dark purple plus.
   */
  CAPD.CANVAS_OVERLAY_SELECTOR = '[id^="insertAffordance"]';

  /**
   * Multicolour illustrations that read as pictures, not as UI: SharePoint's
   * file-type folder icons are inline SVG, and darkening their white
   * highlight drew a dark crease across every folder.  (The other file-type
   * icons are images, which the theme never touches.)
   */
  CAPD.ILLUSTRATION_SELECTOR = '[class*="coloredFolderIcon_"]';

  /**
   * Subtrees the theme must never recolour: the app being designed, Studio's
   * overlays on it, colour previews and illustrations.  Used as the `to (...)` limit of
   * every @scope block and by the inline processor.
   */
  CAPD.CANVAS_LIMIT_SELECTOR = '#publishedCanvas, .app-canvas, [data-capd-keep], ' + CAPD.CANVAS_OVERLAY_SELECTOR + ', ' + CAPD.TRUE_COLOR_SELECTOR + ', ' + CAPD.ILLUSTRATION_SELECTOR;

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

  /**
   * Creation order of a Fluent v9 FluentProvider, from the id of its style
   * element: Power Apps numbers them (fui-FluentProvider1, 2, ...), while
   * SharePoint's come from React's useId (fui-FluentProviderr0, r1 ... r9, ra,
   * a base-32 counter).  The lowest was created first: the root provider.
   */
  CAPD.providerOrder = (id) => {
    const tail = String(id || '').replace(/^fui-FluentProvider/, '').replace(/[^0-9a-z]/gi, '');
    if (/^\d+$/.test(tail)) return parseInt(tail, 10);
    if (/^r[0-9a-v]+$/i.test(tail)) return parseInt(tail.slice(1), 32);
    return Number.MAX_SAFE_INTEGER;
  };

  /* Minimal logger; only chatty when CAPD.debug is set from the console. */
  CAPD.debug = false;
  CAPD.log = function () { if (CAPD.debug) console.debug('[capd]', ...arguments); };
  CAPD.warn = function () { console.warn('[capd]', ...arguments); };
})(typeof globalThis !== 'undefined' ? globalThis : this);
