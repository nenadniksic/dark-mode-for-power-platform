/*
 * Canvas Studio Dark Mode — static theme assembly.
 *
 * Builds the three static CSS blocks the style manager installs:
 *   static  – palette variables + Fluent UI v9 dark design tokens (first)
 *   tuned   – hand-written Studio / Monaco / Fluent v8 / maker-portal rules
 *             (after the generated overrides, so they win ties)
 *   inline  – rules that honour the --capd-i-* variables set by the inline
 *             processor
 * Everything is wrapped in a donut @scope so the designer canvas is never
 * touched.
 */
(function (root) {
  'use strict';
  const CAPD = (root.CAPD = root.CAPD || {});
  const color = CAPD.color;
  const rewriter = CAPD.rewriter;

  const GREY_OFFSET = { dim: 4, dark: 0, black: -6 };
  const BRAND = () => CAPD.FLUENT_BRAND || {};

  function greyHex(n) {
    const v = Math.max(0, Math.min(255, Math.round(Math.max(0, Math.min(100, n)) * 2.55)));
    return color.toHex({ r: v, g: v, b: v });
  }

  function adjustGrey(n, settings) {
    const off = GREY_OFFSET[settings.surface] || 0;
    const high = settings.contrast === 'high';
    if (n < 50) {            // surfaces and strokes follow the surface preference
      n += off;
      if (high && n >= 24) n += 6;   // stronger strokes
    } else if (high) {
      n = Math.min(100, n + 8);      // brighter text
    }
    return n;
  }

  /** Resolve one generated token spec to a CSS colour. */
  function resolveSpec(spec, settings) {
    let m;
    if ((m = /^g(\d+)$/.exec(spec))) return greyHex(adjustGrey(+m[1], settings));
    if ((m = /^ga(\d+):([\d.]+)$/.exec(spec))) { const v = Math.round(adjustGrey(+m[1], settings) * 2.55); return `rgba(${v}, ${v}, ${v}, ${m[2]})`; }
    if ((m = /^wa([\d.]+)$/.exec(spec))) return `rgba(255, 255, 255, ${m[1]})`;
    if ((m = /^ba([\d.]+)$/.exec(spec))) return `rgba(0, 0, 0, ${m[1]})`;
    if ((m = /^b(\d+)$/.exec(spec))) return BRAND()[m[1]] || spec;
    return spec;
  }

  const excludedVars = new Set(CAPD.FLUENT_TOKEN_NAMES || []);
  const surfaceLight = CAPD.FLUENT_SURFACE_LIGHT || {};
  /**
   * Fluent tokens are owned by the static layer, never by the dynamic
   * rewriter — except when a surface/stroke token is used as a *text*
   * colour: its dark value would be a dark grey on a dark surface, so the
   * rewriter retargets such usages to --capd-fg-<token>, defined below.
   */
  function isExcludedVar(name, kind) {
    if (!excludedVars.has(name)) return false;
    if (kind === 'fg' && Object.prototype.hasOwnProperty.call(surfaceLight, name.slice(2))) return false;
    return true;
  }

  /** Raise a colour's lightness until it meets `min` contrast against `surface`. */
  function ensureContrast(value, surface, min) {
    const c = color.parse(value);
    if (!c || c.a !== undefined && c.a < 1) return value;
    if (color.contrast(c, surface) >= min) return value;
    const hsl = color.toHsl(c);
    let l = hsl.l, s = hsl.s, guard = 0;
    let out = c;
    while (color.contrast(out, surface) < min && l < 0.97 && guard++ < 60) {
      l += 0.015; s = Math.max(0, s - 0.004);
      out = color.fromHsl(hsl.h, s, l);
    }
    return color.toHex(out);
  }

  const FG_TOKEN_RE = /Foreground(\d|Link|$)/;
  const FG_TOKEN_SKIP_RE = /Inverted|OnBrand|OnLight|Static|Disabled|Placeholder/;

  function tokenCSS(settings) {
    const spec = CAPD.FLUENT_DARK_SPEC || {};
    const opts = { surface: settings.surface, contrast: settings.contrast };
    const decls = [];
    const surface = color.parse(resolveSpec(spec.colorNeutralBackground1 || 'g16', settings));
    for (const name of Object.keys(spec)) {
      let value = resolveSpec(spec[name], settings);
      // Guarantee legibility of coloured text tokens (brand, status, palette)
      // on the base surface: WCAG AA for text, regardless of the brand ramp.
      if (FG_TOKEN_RE.test(name) && !FG_TOKEN_SKIP_RE.test(name)) value = ensureContrast(value, surface, 4.5);
      decls.push(`--${name}:${value} !important;`);
    }
    for (const [name, lightValue] of Object.entries(surfaceLight)) {
      const c = color.parse(lightValue);
      if (!c) continue;
      const dark = c.a === 0 ? null : color.modify('fg', c, opts);
      decls.push(`--capd-fg-${name}:${dark ? color.format(dark) : lightValue};`);
    }
    // Portal mount nodes (tooltips, menus, dialogs) carry only the numbered
    // theme class (fui-FluentProvider1), so match the class prefix too.
    // (:scope is the scoping root, i.e. <html>, inside the @scope wrapper.)
    return `.fui-FluentProvider,[class*="fui-FluentProvider"],:scope,:root{${decls.join('')}}`;
  }

  /** Palette variables shared by the hand-written theme files. */
  function paletteVars(settings) {
    const opts = { surface: settings.surface, contrast: settings.contrast };
    const map = (kind, hex) => color.format(color.modify(kind, color.parse(hex), opts));
    const off = GREY_OFFSET[settings.surface] || 0;
    const brand = BRAND();
    const lightBackdrop = settings.backdrop === 'light';
    const vars = {
      's0': map('bg', '#e0e0e0'),
      's1': map('bg', '#ffffff'),
      's2': map('bg', '#fafafa'),
      's3': map('bg', '#f3f2f1'),
      's4': map('bg', '#edebe9'),
      's5': map('bg', '#e1dfdd'),
      'raised': greyHex(adjustGrey(20, settings)),
      't1': map('fg', '#323130'),
      't2': map('fg', '#605e5c'),
      't3': map('fg', '#a19f9d'),
      'b1': map('bd', '#edebe9'),
      'b2': map('bd', '#c8c6c4'),
      'b3': map('bd', '#8a8886'),
      'accent': ensureContrast(brand[100] || '#bc5fbc', color.parse(map('bg', '#ffffff')), 4.5),
      'accent-hover': ensureContrast(brand[110] || '#cb79cb', color.parse(map('bg', '#ffffff')), 4.5),
      'accent-bg': brand[70] || '#852985',
      'accent-bg-hover': brand[80] || '#933493',
      'accent-soft': 'rgba(188, 95, 188, 0.18)',
      'accent-soft-strong': 'rgba(188, 95, 188, 0.30)',
      'focus': settings.contrast === 'high' ? '#ffffff' : '#f5f5f5',
      'backdrop': lightBackdrop ? '#fafafa' : greyHex(Math.max(4, 10 + off)),
      'dot': lightBackdrop ? '#dcdcdc' : greyHex(Math.max(14, 24 + off)),
      'shadow': '0 2px 8px rgba(0, 0, 0, 0.45), 0 0 2px rgba(0, 0, 0, 0.35)',
      'selection': 'rgba(188, 95, 188, 0.35)',
      'link': ensureContrast(brand[110] || '#cb79cb', color.parse(map('bg', '#ffffff')), 4.5),
      'danger': ensureContrast('#f1707b', color.parse(map('bg', '#ffffff')), 4.5),
      'success': ensureContrast('#6ccb5f', color.parse(map('bg', '#ffffff')), 4.5),
      'warning': ensureContrast('#f8c450', color.parse(map('bg', '#ffffff')), 4.5),
    };
    return `:root{${Object.entries(vars).map(([k, v]) => `--capd-${k}:${v};`).join('')}}`;
  }

  const LIMIT = () => CAPD.CANVAS_LIMIT_SELECTOR;

  function buildStatic(settings, scope) {
    const css = (CAPD.themeCSS && CAPD.themeCSS.fallback) || '';
    return paletteVars(settings) + rewriter.scoped(tokenCSS(settings), scope ? LIMIT() : null) + css;
  }

  function buildTuned(settings, role, scope) {
    const t = CAPD.themeCSS || {};
    let css = (t.studio || '') + (t.monaco || '') + (t.fluent8 || '');
    if (role === 'maker' || role === 'maker-frame' || role === 'studio-host') css += t.maker || '';
    return rewriter.scoped(css, scope ? LIMIT() : null);
  }

  function buildInline(scope) {
    return rewriter.scoped(CAPD.InlineProcessor.css, scope ? LIMIT() : null);
  }

  function htmlAttrs(settings) {
    return {
      [CAPD.ATTR]: 'dark',
      'data-capd-surface': settings.surface,
      'data-capd-contrast': settings.contrast,
      'data-capd-backdrop': settings.backdrop,
      'data-capd-icons': settings.iconAdapt ? 'adapt' : 'original',
    };
  }

  CAPD.staticTheme = { resolveSpec, ensureContrast, tokenCSS, paletteVars, buildStatic, buildTuned, buildInline, htmlAttrs, isExcludedVar, greyHex };
})(typeof globalThis !== 'undefined' ? globalThis : this);
