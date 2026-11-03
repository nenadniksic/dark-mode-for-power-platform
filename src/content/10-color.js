/*
 * Canvas Studio Dark Mode — colour engine.
 *
 * Pure functions: parse CSS colours, convert between RGB/HSL, measure WCAG
 * contrast, and map a light-theme colour to its dark-theme counterpart by
 * role (background, text, border, shadow).  Written as a UMD-style module so
 * the same file runs as a content script (globalThis.CAPD.color) and under
 * node:test (module.exports).
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  const ns = (root.CAPD = root.CAPD || {});
  ns.color = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Named colours (CSS Color Level 4).  Keys are lower-case.            */
  /* ------------------------------------------------------------------ */
  const NAMED = {
    aliceblue: 0xf0f8ff, antiquewhite: 0xfaebd7, aqua: 0x00ffff, aquamarine: 0x7fffd4, azure: 0xf0ffff,
    beige: 0xf5f5dc, bisque: 0xffe4c4, black: 0x000000, blanchedalmond: 0xffebcd, blue: 0x0000ff,
    blueviolet: 0x8a2be2, brown: 0xa52a2a, burlywood: 0xdeb887, cadetblue: 0x5f9ea0, chartreuse: 0x7fff00,
    chocolate: 0xd2691e, coral: 0xff7f50, cornflowerblue: 0x6495ed, cornsilk: 0xfff8dc, crimson: 0xdc143c,
    cyan: 0x00ffff, darkblue: 0x00008b, darkcyan: 0x008b8b, darkgoldenrod: 0xb8860b, darkgray: 0xa9a9a9,
    darkgreen: 0x006400, darkgrey: 0xa9a9a9, darkkhaki: 0xbdb76b, darkmagenta: 0x8b008b, darkolivegreen: 0x556b2f,
    darkorange: 0xff8c00, darkorchid: 0x9932cc, darkred: 0x8b0000, darksalmon: 0xe9967a, darkseagreen: 0x8fbc8f,
    darkslateblue: 0x483d8b, darkslategray: 0x2f4f4f, darkslategrey: 0x2f4f4f, darkturquoise: 0x00ced1,
    darkviolet: 0x9400d3, deeppink: 0xff1493, deepskyblue: 0x00bfff, dimgray: 0x696969, dimgrey: 0x696969,
    dodgerblue: 0x1e90ff, firebrick: 0xb22222, floralwhite: 0xfffaf0, forestgreen: 0x228b22, fuchsia: 0xff00ff,
    gainsboro: 0xdcdcdc, ghostwhite: 0xf8f8ff, gold: 0xffd700, goldenrod: 0xdaa520, gray: 0x808080,
    green: 0x008000, greenyellow: 0xadff2f, grey: 0x808080, honeydew: 0xf0fff0, hotpink: 0xff69b4,
    indianred: 0xcd5c5c, indigo: 0x4b0082, ivory: 0xfffff0, khaki: 0xf0e68c, lavender: 0xe6e6fa,
    lavenderblush: 0xfff0f5, lawngreen: 0x7cfc00, lemonchiffon: 0xfffacd, lightblue: 0xadd8e6, lightcoral: 0xf08080,
    lightcyan: 0xe0ffff, lightgoldenrodyellow: 0xfafad2, lightgray: 0xd3d3d3, lightgreen: 0x90ee90, lightgrey: 0xd3d3d3,
    lightpink: 0xffb6c1, lightsalmon: 0xffa07a, lightseagreen: 0x20b2aa, lightskyblue: 0x87cefa, lightslategray: 0x778899,
    lightslategrey: 0x778899, lightsteelblue: 0xb0c4de, lightyellow: 0xffffe0, lime: 0x00ff00, limegreen: 0x32cd32,
    linen: 0xfaf0e6, magenta: 0xff00ff, maroon: 0x800000, mediumaquamarine: 0x66cdaa, mediumblue: 0x0000cd,
    mediumorchid: 0xba55d3, mediumpurple: 0x9370db, mediumseagreen: 0x3cb371, mediumslateblue: 0x7b68ee,
    mediumspringgreen: 0x00fa9a, mediumturquoise: 0x48d1cc, mediumvioletred: 0xc71585, midnightblue: 0x191970,
    mintcream: 0xf5fffa, mistyrose: 0xffe4e1, moccasin: 0xffe4b5, navajowhite: 0xffdead, navy: 0x000080,
    oldlace: 0xfdf5e6, olive: 0x808000, olivedrab: 0x6b8e23, orange: 0xffa500, orangered: 0xff4500,
    orchid: 0xda70d6, palegoldenrod: 0xeee8aa, palegreen: 0x98fb98, paleturquoise: 0xafeeee, palevioletred: 0xdb7093,
    papayawhip: 0xffefd5, peachpuff: 0xffdab9, peru: 0xcd853f, pink: 0xffc0cb, plum: 0xdda0dd,
    powderblue: 0xb0e0e6, purple: 0x800080, rebeccapurple: 0x663399, red: 0xff0000, rosybrown: 0xbc8f8f,
    royalblue: 0x4169e1, saddlebrown: 0x8b4513, salmon: 0xfa8072, sandybrown: 0xf4a460, seagreen: 0x2e8b57,
    seashell: 0xfff5ee, sienna: 0xa0522d, silver: 0xc0c0c0, skyblue: 0x87ceeb, slateblue: 0x6a5acd,
    slategray: 0x708090, slategrey: 0x708090, snow: 0xfffafa, springgreen: 0x00ff7f, steelblue: 0x4682b4,
    tan: 0xd2b48c, teal: 0x008080, thistle: 0xd8bfd8, tomato: 0xff6347, turquoise: 0x40e0d0,
    violet: 0xee82ee, wheat: 0xf5deb3, white: 0xffffff, whitesmoke: 0xf5f5f5, yellow: 0xffff00, yellowgreen: 0x9acd32,
  };

  /* Keywords that are colour-valued but must never be rewritten. */
  const KEYWORDS = new Set(['transparent', 'currentcolor', 'inherit', 'initial', 'unset', 'revert', 'revert-layer', 'none', 'auto']);

  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const lerp = (a, b, t) => a + (b - a) * clamp01(t);

  /* ------------------------------------------------------------------ */
  /* Parsing                                                             */
  /* ------------------------------------------------------------------ */
  function parseNumberOrPercent(token, scale) {
    const t = token.trim();
    if (t === 'none') return 0;
    if (t.endsWith('%')) return (parseFloat(t) / 100) * scale;
    return parseFloat(t);
  }

  function parseAlpha(token) {
    if (token === undefined) return 1;
    const t = token.trim();
    if (t === 'none') return 0;
    if (t.endsWith('%')) return clamp01(parseFloat(t) / 100);
    return clamp01(parseFloat(t));
  }

  function splitArgs(inner) {
    // Supports "a, b, c, d", "a b c / d" and "a b c".
    let alpha;
    let body = inner.trim();
    const slash = body.indexOf('/');
    if (slash !== -1) { alpha = body.slice(slash + 1); body = body.slice(0, slash); }
    const parts = body.split(/[\s,]+/).filter(Boolean);
    if (alpha === undefined && parts.length === 4) alpha = parts.pop();
    return { parts, alpha };
  }

  function hueToRgb(p, q, t) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }

  function fromHsl(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    s = clamp01(s); l = clamp01(l);
    let r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hueToRgb(p, q, h + 1 / 3); g = hueToRgb(p, q, h); b = hueToRgb(p, q, h - 1 / 3);
    }
    return { r: clamp255(r * 255), g: clamp255(g * 255), b: clamp255(b * 255) };
  }

  function toHsl(c) {
    const r = c.r / 255, g = c.g / 255, b = c.b / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return { h: h * 60, s, l };
  }

  function parseHueToken(token) {
    const t = token.trim();
    if (t === 'none') return 0;
    const v = parseFloat(t);
    if (t.endsWith('rad')) return (v * 180) / Math.PI;
    if (t.endsWith('grad')) return v * 0.9;
    if (t.endsWith('turn')) return v * 360;
    return v; // deg or unitless
  }

  /**
   * Parse a CSS colour string. Returns {r,g,b,a} or null when the string is
   * not a colour (or is a keyword such as currentColor / transparent).
   */
  function parse(input) {
    if (typeof input !== 'string') return null;
    const s = input.trim();
    if (!s) return null;
    const lower = s.toLowerCase();
    if (KEYWORDS.has(lower)) return null;

    if (lower[0] === '#') {
      const hex = lower.slice(1);
      if (!/^[0-9a-f]{3,8}$/.test(hex) || hex.length === 5 || hex.length === 7) return null;
      if (hex.length <= 4) {
        const r = parseInt(hex[0] + hex[0], 16), g = parseInt(hex[1] + hex[1], 16), b = parseInt(hex[2] + hex[2], 16);
        const a = hex.length === 4 ? parseInt(hex[3] + hex[3], 16) / 255 : 1;
        return { r, g, b, a };
      }
      const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
      const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
      return { r, g, b, a };
    }

    const fn = /^(rgba?|hsla?|hwb)\((.*)\)$/i.exec(s);
    if (fn) {
      const name = fn[1].toLowerCase();
      const { parts, alpha } = splitArgs(fn[2]);
      if (parts.length !== 3) return null;
      const a = parseAlpha(alpha);
      if (name === 'rgb' || name === 'rgba') {
        const r = parseNumberOrPercent(parts[0], 255), g = parseNumberOrPercent(parts[1], 255), b = parseNumberOrPercent(parts[2], 255);
        if ([r, g, b].some((v) => Number.isNaN(v))) return null;
        return { r: clamp255(r), g: clamp255(g), b: clamp255(b), a };
      }
      if (name === 'hsl' || name === 'hsla') {
        const h = parseHueToken(parts[0]);
        const sv = parseNumberOrPercent(parts[1], 1), lv = parseNumberOrPercent(parts[2], 1);
        if ([h, sv, lv].some((v) => Number.isNaN(v))) return null;
        const rgb = fromHsl(h, sv > 1 ? sv / 100 : sv, lv > 1 ? lv / 100 : lv);
        return { ...rgb, a };
      }
      if (name === 'hwb') {
        const h = parseHueToken(parts[0]);
        let w = parseNumberOrPercent(parts[1], 1), bl = parseNumberOrPercent(parts[2], 1);
        if ([h, w, bl].some((v) => Number.isNaN(v))) return null;
        if (w + bl > 1) { const sum = w + bl; w /= sum; bl /= sum; }
        const base = fromHsl(h, 1, 0.5);
        const f = (v) => clamp255((v / 255) * (1 - w - bl) * 255 + w * 255);
        return { r: f(base.r), g: f(base.g), b: f(base.b), a };
      }
    }

    if (Object.prototype.hasOwnProperty.call(NAMED, lower)) {
      const v = NAMED[lower];
      return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255, a: 1 };
    }
    return null;
  }

  function format(c) {
    const a = c.a === undefined ? 1 : c.a;
    if (a >= 1) return `rgb(${c.r}, ${c.g}, ${c.b})`;
    return `rgba(${c.r}, ${c.g}, ${c.b}, ${Math.round(a * 1000) / 1000})`;
  }

  function toHex(c) {
    const h = (v) => v.toString(16).padStart(2, '0');
    return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
  }

  /* ------------------------------------------------------------------ */
  /* WCAG                                                                */
  /* ------------------------------------------------------------------ */
  function luminance(c) {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }

  function contrast(a, b) {
    const la = luminance(a), lb = luminance(b);
    const [hi, lo] = la > lb ? [la, lb] : [lb, la];
    return (hi + 0.05) / (lo + 0.05);
  }

  /* ------------------------------------------------------------------ */
  /* Dark-theme mapping                                                  */
  /* ------------------------------------------------------------------ */
  const SURFACE_LIGHTNESS = { dim: 0.20, dark: 0.16, black: 0.11 };

  function params(opts) {
    const o = opts || {};
    const surface = SURFACE_LIGHTNESS[o.surface] !== undefined ? SURFACE_LIGHTNESS[o.surface] : SURFACE_LIGHTNESS.dark;
    const high = o.contrast === 'high';
    return {
      bgWhite: surface,            // lightness a pure-white background maps to
      bgLow: Math.max(0.06, surface - 0.075), // lightness for L=0.85 backgrounds (the darkest point)
      bgMid: 0.40,                 // lightness for mid-grey backgrounds
      fgMax: high ? 0.98 : 0.90,   // lightness black text maps to
      fgMid: high ? 0.82 : 0.62,
      fgDim: high ? 0.66 : 0.52,   // darkest point for light-grey (disabled) text
      bdLight: high ? 0.56 : 0.51, // mid-grey borders stay >= 3:1 against the surface
      bdDark: high ? 0.32 : 0.24,
      bdStrong: high ? 0.78 : 0.66,
      satCap: 0.78,
    };
  }

  function mapBgLightness(l, p) {
    if (l >= 0.85) return lerp(p.bgLow, p.bgWhite, (l - 0.85) / 0.15);
    if (l >= 0.5) return lerp(p.bgMid, p.bgLow, (l - 0.5) / 0.35);
    return l; // already dark: keep (brand surfaces, overlays)
  }

  function mapFgLightness(l, p) {
    if (l <= 0.5) return lerp(p.fgMax, p.fgMid, l / 0.5);
    if (l <= 0.75) return lerp(p.fgMid, p.fgDim, (l - 0.5) / 0.25);
    if (l <= 0.9) return lerp(p.fgDim, p.fgMax, (l - 0.75) / 0.15);
    return l; // near-white text sits on brand/dark surfaces: keep
  }

  function mapBdLightness(l, p) {
    if (l >= 0.5) return lerp(p.bdLight, p.bdDark, (l - 0.5) / 0.5);
    return lerp(p.bdStrong, p.bdLight, l / 0.5);
  }

  /**
   * Map one colour to its dark-theme counterpart.
   * kind: 'bg' | 'fg' | 'bd' | 'sh'
   */
  function modify(kind, c, opts) {
    const p = params(opts);
    const a = c.a === undefined ? 1 : c.a;
    if (a === 0) return c;
    const hsl = toHsl(c);
    let l = hsl.l, s = hsl.s;
    // HSL saturation is meaningless for near-white / near-black colours
    // (#fffffe has s = 1); judge neutrality by chroma instead.
    const chroma = (Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b)) / 255;
    if (chroma < 0.1) s = 0;
    switch (kind) {
      case 'bg':
        l = mapBgLightness(hsl.l, p);
        if (hsl.l >= 0.5) s = Math.min(s, 0.6);
        break;
      case 'fg':
        l = mapFgLightness(hsl.l, p);
        if (hsl.l <= 0.5) s = Math.min(s, p.satCap);
        if (hsl.l <= 0.9) {
          // Guarantee legibility: raise lightness until the mapped text meets
          // the contrast target against the base surface (WCAG AA, AAA in
          // high-contrast mode).  Saturated hues such as pure blue need this.
          const surface = fromHsl(0, 0, p.bgWhite);
          const target = p.fgMax > 0.95 ? 7 : 4.5;
          let guard = 0;
          while (contrast(fromHsl(hsl.h, s, l), surface) < target && l < 0.97 && guard++ < 40) {
            l += 0.02; s = Math.max(0, s - 0.01);
          }
        }
        break;
      case 'bd':
        l = mapBdLightness(hsl.l, p);
        s = Math.min(s, 0.5);
        break;
      case 'sh':
        if (hsl.l > 0.5) { l = 0.02; s = 0; }
        break;
      case 'icon':
        // Two-tone icon fills: lighten dark neutral strokes, darken light
        // neutral "paper", leave coloured accents exactly as designed.
        if (chroma < 0.12 && hsl.l < 0.5) return modify('fg', c, opts);
        if (chroma < 0.12 && hsl.l > 0.85) return modify('bg', c, opts);
        return c;
      default:
        return c;
    }
    if (Math.abs(l - hsl.l) < 0.002 && Math.abs(s - hsl.s) < 0.002) return c;
    return { ...fromHsl(hsl.h, s, l), a };
  }

  /**
   * Modify a single colour string. Returns the new string, or null when the
   * input is not a colour or needs no change.
   */
  function modifyColorString(kind, str, opts) {
    const c = parse(str);
    if (!c) return null;
    const m = modify(kind, c, opts);
    if (m === c) return null;
    return format(m);
  }

  /* ------------------------------------------------------------------ */
  /* Value rewriting (gradients, shadows, borders, lists)                */
  /* ------------------------------------------------------------------ */
  const TOKEN_RE = /var\((?:[^()]|\([^()]*\))*\)|url\((?:[^()\\]|\\.)*\)|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z_-])|(?:rgba?|hsla?|hwb)\((?:[^()]|\([^()]*\))*\)|(?<![\w-])[a-zA-Z]+(?![\w-])/g;

  /**
   * Rewrite every colour inside an arbitrary CSS value (e.g. a gradient or a
   * box-shadow list).  `varRewriter(varExpr)` may replace var() references.
   * Returns the rewritten value, or null when nothing changed.
   */
  function rewriteValue(kind, value, opts, varRewriter) {
    if (typeof value !== 'string' || !value) return null;
    let changed = false;
    const out = value.replace(TOKEN_RE, (tok) => {
      const first = tok[0];
      if (first === '"' || first === "'") return tok;
      if (tok.startsWith('url(')) return tok;
      if (tok.startsWith('var(')) {
        if (!varRewriter) return tok;
        const r = varRewriter(tok, kind);
        if (r && r !== tok) { changed = true; return r; }
        return tok;
      }
      if (first === '#' || /^(rgba?|hsla?|hwb)\(/i.test(tok)) {
        const r = modifyColorString(kind, tok, opts);
        if (r) { changed = true; return r; }
        return tok;
      }
      // bare word: named colour?
      const lower = tok.toLowerCase();
      if (Object.prototype.hasOwnProperty.call(NAMED, lower)) {
        const r = modifyColorString(kind, lower, opts);
        if (r) { changed = true; return r; }
      }
      return tok;
    });
    return changed ? out : null;
  }

  /** True when the string is a single colour literal (not a keyword). */
  function isColorLiteral(value) {
    return parse(value) !== null;
  }

  /** True when the value contains at least one colour literal. */
  function containsColor(value) {
    if (typeof value !== 'string') return false;
    TOKEN_RE.lastIndex = 0;
    let m;
    const re = new RegExp(TOKEN_RE.source, 'g');
    while ((m = re.exec(value))) {
      const tok = m[0];
      if (tok[0] === '"' || tok[0] === "'" || tok.startsWith('url(') || tok.startsWith('var(')) continue;
      if (tok[0] === '#' || /^(rgba?|hsla?|hwb)\(/i.test(tok)) return true;
      if (Object.prototype.hasOwnProperty.call(NAMED, tok.toLowerCase())) return true;
    }
    return false;
  }

  return {
    NAMED, KEYWORDS, SURFACE_LIGHTNESS,
    parse, format, toHex, toHsl, fromHsl, luminance, contrast,
    params, modify, modifyColorString, rewriteValue, isColorLiteral, containsColor,
  };
});
