/*
 * Dark Mode for Power Platform — static theme assembly.
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

  /*
   * Brand ramp.  The generated tokens refer to brand steps (b70, b100...),
   * resolved here.  The shipped ramp is Power Apps purple, recovered from
   * Studio's light tokens; Power Automate brands its UI blue (#0066ff).  The
   * engine reads the root FluentProvider's light --colorBrandBackground (the
   * ramp's step 80) and sets CAPD.brandSeed, so each product keeps its own
   * accent colour in the dark theme instead of every page turning purple.
   */
  const SHIPPED_BRAND = () => CAPD.FLUENT_BRAND || {};
  const rampCache = new Map();

  /** Brand ramp (steps 10..160) with `seed` at step 80, shaped like `template` (default: the shipped ramp). */
  function rampFromSeed(seedStr, template) {
    const base = template || SHIPPED_BRAND();
    const seed = color.parse(seedStr || '');
    const b80 = color.parse(base[80] || '');
    if (!seed || !b80) return null;
    if (seed.r === b80.r && seed.g === b80.g && seed.b === b80.b) return base; // Power Apps: the exact ramp
    const S = color.toHsl(seed), T = color.toHsl(b80);
    const out = {};
    for (const key of Object.keys(base)) {
      const step = +key;
      if (step === 80) { out[key] = color.toHex(seed); continue; }
      const t = color.toHsl(color.parse(base[key]));
      // Scale the template's lightness curve so step 80 lands on the seed,
      // keeping both ends of the ramp where the template has them.  The
      // light half is what the dark theme writes and draws with (links,
      // selected tabs, checkbox borders), so it never gets darker than the
      // validated template, whatever the seed: a dark seed such as the
      // portal's #742774 would otherwise give strokes below 3:1.
      let l = step < 80 ? t.l * (S.l / T.l) : Math.max(t.l, S.l + (t.l - T.l) * ((1 - S.l) / (1 - T.l)));
      l = Math.max(0.04, Math.min(0.97, l));
      const s = Math.max(0, Math.min(1, T.s ? S.s * (t.s / T.s) : S.s));
      out[key] = color.toHex(color.fromHsl(S.h, s, l));
    }
    return out;
  }

  /* The Neon style replaces every product's brand with hot pink, and the
     focus ring with cyan. */
  const NEON_PINK = '#ff2a8a';
  const NEON_CYAN = '#00e5ff';

  function BRAND(settings) {
    const seed = settings && settings.look === 'neon' ? NEON_PINK : CAPD.brandSeed;
    if (!seed) return SHIPPED_BRAND();
    if (!rampCache.has(seed)) rampCache.set(seed, rampFromSeed(seed) || SHIPPED_BRAND());
    return rampCache.get(seed);
  }

  function withAlpha(hex, a) {
    const c = color.parse(hex);
    return c ? `rgba(${c.r}, ${c.g}, ${c.b}, ${a})` : `rgba(188, 95, 188, ${a})`;
  }

  function greyHex(n) {
    const v = Math.max(0, Math.min(255, Math.round(Math.max(0, Math.min(100, n)) * 2.55)));
    return color.toHex({ r: v, g: v, b: v });
  }

  /** Grey of ramp step `n` (already adjusted) for a role, tinted in the Neon style. */
  function shade(n, role, settings) {
    const t = color.tintGrey(role, Math.max(0, Math.min(100, n)) / 100, settings.look);
    return t ? color.toHex(t) : greyHex(n);
  }

  /** Fluent grey ramp step `n` as this theme draws it: surface offset, contrast and style applied. */
  function greyFor(n, settings) {
    return shade(adjustGrey(n, settings), n >= 50 ? 'fg' : n >= 24 ? 'bd' : 'bg', settings);
  }

  function adjustGrey(n, settings) {
    const off = GREY_OFFSET[settings.surface] || 0;
    const high = settings.contrast === 'high';
    if (n < 50) {            // surfaces and strokes follow the surface preference
      // Strokes are the ramp's 24 and up; judge that before the surface
      // offset, or Dim's lighter surfaces (20 + 4) would be bumped as strokes.
      const stroke = n >= 24;
      n += off;
      if (high && stroke) n += 6;    // stronger strokes
    } else if (high) {
      n = Math.min(100, n + 8);      // brighter text
    }
    return n;
  }

  /** Resolve one generated token spec to a CSS colour. */
  function resolveSpec(spec, settings) {
    let m;
    if ((m = /^g(\d+)$/.exec(spec))) return greyFor(+m[1], settings);
    if ((m = /^ga(\d+):([\d.]+)$/.exec(spec))) { const c = color.parse(greyFor(+m[1], settings)); return `rgba(${c.r}, ${c.g}, ${c.b}, ${m[2]})`; }
    if ((m = /^wa([\d.]+)$/.exec(spec))) return `rgba(255, 255, 255, ${m[1]})`;
    if ((m = /^ba([\d.]+)$/.exec(spec))) return `rgba(0, 0, 0, ${m[1]})`;
    if ((m = /^b(\d+)$/.exec(spec))) return BRAND(settings)[m[1]] || spec;
    return spec;
  }

  const excludedVars = new Set(CAPD.FLUENT_TOKEN_NAMES || []);
  const surfaceLight = CAPD.FLUENT_SURFACE_LIGHT || {};
  const foregroundLight = CAPD.FLUENT_FOREGROUND_LIGHT || {};
  /**
   * Fluent tokens are owned by the static layer, never by the dynamic
   * rewriter — except when a surface/stroke token is used as a *text*
   * colour: its dark value would be a dark grey on a dark surface, so the
   * rewriter retargets such usages to --capd-fg-<token>, defined below.
   */
  function isExcludedVar(name, kind) {
    if (!excludedVars.has(name)) return false;
    if (kind === 'fg' && Object.prototype.hasOwnProperty.call(surfaceLight, name.slice(2))) return false;
    // and the reverse: a text token painted as a background (Studio's
    // command-bar buttons use colorNeutralForegroundInverted, white in the
    // light theme) maps like a surface: --capd-bg-<token>, defined below
    if (kind === 'bg' && Object.prototype.hasOwnProperty.call(foregroundLight, name.slice(2))) return false;
    return true;
  }

  /** Lower a colour's lightness until `against` (white text) meets `min` contrast on it. */
  function darkenUnder(value, against, min) {
    const c = color.parse(value);
    if (!c || c.a !== undefined && c.a < 1) return value;
    if (color.contrast(c, against) >= min) return value;
    const hsl = color.toHsl(c);
    let l = hsl.l, guard = 0, out = c;
    while (color.contrast(out, against) < min && l > 0.05 && guard++ < 60) { l -= 0.015; out = color.fromHsl(hsl.h, hsl.s, l); }
    return color.toHex(out);
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
  /* Brand strokes that mark state on the surface (selected outlines, checked
     boxes and radios) are UI graphics: WCAG 1.4.11 wants 3:1. */
  const BRAND_STROKE_RE = /^colorBrandStroke1$|^colorCompoundBrandStroke/;
  /* Brand surfaces carry white text (buttons: colorNeutralForegroundOnBrand;
     Power Automate's filter pills: colorNeutralForeground1 on the inverted
     hover/selected surfaces): a light brand such as neon pink has to be
     deepened until white reads on it. */
  const BRAND_BG_RE = /^colorBrandBackground(Hover|Pressed|Selected)?$|^colorBrandBackgroundInverted(Hover|Pressed|Selected)$/;
  const WHITE = { r: 255, g: 255, b: 255, a: 1 };
  /* Disabled text is exempt from WCAG, but Studio explains its disabled
     settings in it (whole paragraphs in Settings > Updates), and at the
     ramp's own dark value (g36, about 2.3:1 on a dialog) it is a smudge.
     3:1 reads, and stays well below any enabled text. */
  const DISABLED_MIN = 3;

  function tokenCSS(settings) {
    const spec = CAPD.FLUENT_DARK_SPEC || {};
    const opts = { surface: settings.surface, contrast: settings.contrast, look: settings.look };
    const decls = [];
    // Text tokens must read on the lightest surface text commonly sits on:
    // cards and raised panels (g20), not just the base surface (g16).
    const surface = color.parse(resolveSpec(spec.colorNeutralCardBackground || 'g20', settings));
    for (const name of Object.keys(spec)) {
      let value = resolveSpec(spec[name], settings);
      // Guarantee legibility of coloured text tokens (brand, status, palette):
      // WCAG AA for text, regardless of the brand ramp.
      // Neutral text targets AAA in high-contrast mode, as the setting promises.
      if (FG_TOKEN_RE.test(name) && !FG_TOKEN_SKIP_RE.test(name)) value = ensureContrast(value, surface, settings.contrast === 'high' && /^colorNeutralForeground/.test(name) ? 7 : 4.5);
      else if (BRAND_STROKE_RE.test(name)) value = ensureContrast(value, surface, 3);
      else if (BRAND_BG_RE.test(name)) value = darkenUnder(value, WHITE, 4.5);
      else if (name === 'colorNeutralForegroundDisabled') value = ensureContrast(value, surface, DISABLED_MIN);
      if (name === 'colorStrokeFocus2' && settings.look === 'neon') value = NEON_CYAN;
      decls.push(`--${name}:${value} !important;`);
    }
    for (const [name, lightValue] of Object.entries(surfaceLight)) {
      const c = color.parse(lightValue);
      if (!c) continue;
      const dark = c.a === 0 ? null : color.modify('fg', c, opts);
      decls.push(`--capd-fg-${name}:${dark ? color.format(dark) : lightValue};`);
    }
    for (const [name, lightValue] of Object.entries(foregroundLight)) {
      const c = color.parse(lightValue);
      if (!c) continue;
      const dark = c.a === 0 ? null : color.modify('bg', c, opts);
      decls.push(`--capd-bg-${name}:${dark ? color.format(dark) : lightValue};`);
    }
    // Portal mount nodes (tooltips, menus, dialogs) carry only the numbered
    // theme class (fui-FluentProvider1), so match the class prefix too.
    // (:scope is the scoping root, i.e. <html>, inside the @scope wrapper.)
    return `.fui-FluentProvider,[class*="fui-FluentProvider"],:scope,:root{${decls.join('')}}`;
  }

  /** Palette variables shared by the hand-written theme files. */
  function paletteVars(settings) {
    const opts = { surface: settings.surface, contrast: settings.contrast, look: settings.look };
    const map = (kind, hex) => color.format(color.modify(kind, color.parse(hex), opts));
    const off = GREY_OFFSET[settings.surface] || 0;
    const brand = BRAND(settings);
    const neon = settings.look === 'neon';
    const lightBackdrop = settings.backdrop === 'light';
    // Coloured text has to read on raised surfaces (menus, callouts, dialogs),
    // the lightest ones text sits on; that implies the base surface too.
    const raised = greyFor(20, settings);
    const onRaised = (value) => ensureContrast(value, color.parse(raised), 4.5);
    const spec = CAPD.FLUENT_DARK_SPEC || {};
    const vars = {
      's0': map('bg', '#e0e0e0'),
      's1': map('bg', '#ffffff'),
      's2': map('bg', '#fafafa'),
      's3': map('bg', '#f3f2f1'),
      's4': map('bg', '#edebe9'),
      's5': map('bg', '#e1dfdd'),
      'raised': raised,
      't1': map('fg', '#323130'),
      't2': map('fg', '#605e5c'),
      't3': map('fg', '#a19f9d'),
      'b1': map('bd', '#edebe9'),
      'b2': map('bd', '#c8c6c4'),
      'b3': map('bd', '#8a8886'),
      // disabled text and the marks of disabled controls: the same colour
      // as the Fluent token colorNeutralForegroundDisabled
      'disabled': ensureContrast(resolveSpec(spec.colorNeutralForegroundDisabled || 'g36', settings), color.parse(raised), DISABLED_MIN),
      'accent': onRaised(brand[100] || '#bc5fbc'),
      'accent-hover': onRaised(brand[110] || '#cb79cb'),
      'accent-bg': brand[70] || '#852985',
      'accent-bg-hover': brand[80] || '#933493',
      'accent-bg-pressed': brand[40] || '#641264',
      'accent-soft': withAlpha(brand[100] || '#bc5fbc', 0.18),
      'accent-soft-strong': withAlpha(brand[100] || '#bc5fbc', 0.30),
      'accent-match': withAlpha(brand[100] || '#bc5fbc', 0.25),
      'accent-match-border': withAlpha(brand[100] || '#bc5fbc', 0.6),
      'focus': neon ? NEON_CYAN : settings.contrast === 'high' ? '#ffffff' : '#f5f5f5',
      'backdrop': lightBackdrop ? '#fafafa' : shade(Math.max(4, 10 + off), 'bg', settings),
      'dot': lightBackdrop ? '#dcdcdc' : neon ? withAlpha(NEON_PINK, 0.38) : greyHex(Math.max(14, 24 + off)),
      'scroll': neon ? withAlpha(NEON_PINK, 0.35) : 'rgba(255, 255, 255, 0.18)',
      'scroll-hover': neon ? withAlpha(NEON_PINK, 0.6) : 'rgba(255, 255, 255, 0.30)',
      'glow': neon ? withAlpha(NEON_PINK, 0.55) : 'transparent',
      'neon-cyan': NEON_CYAN,
      'shadow': '0 2px 8px rgba(0, 0, 0, 0.45), 0 0 2px rgba(0, 0, 0, 0.35)',
      'selection': withAlpha(brand[100] || '#bc5fbc', 0.35),
      'link': onRaised(brand[110] || '#cb79cb'),
      'danger': onRaised('#f1707b'),
      'success': onRaised('#6ccb5f'),
      'warning': onRaised('#f8c450'),
    };
    return `:root{${Object.entries(vars).map(([k, v]) => `--capd-${k}:${v};`).join('')}}`;
  }

  const LIMIT = () => CAPD.CANVAS_LIMIT_SELECTOR;

  /* The rewriter marks borderless elements with these for the Neon glow;
     they must not inherit, or a borderless container would switch off the
     glow of every control inside it. */
  const EDGE_MARKS = "@property --capd-edge{syntax:'*';inherits:false}@property --capd-halo{syntax:'*';inherits:false}";

  function buildStatic(settings, scope) {
    const css = (CAPD.themeCSS && CAPD.themeCSS.fallback) || '';
    return EDGE_MARKS + paletteVars(settings) + rewriter.scoped(tokenCSS(settings), scope ? LIMIT() : null) + css;
  }

  function buildTuned(settings, role, scope) {
    const t = CAPD.themeCSS || {};
    let css = (t.studio || '') + (t.monaco || '') + (t.fluent8 || '');
    if (role === 'maker' || role === 'maker-frame' || role === 'studio-host' || role === 'automate' || role === 'automate-frame') css += t.maker || '';
    if (role === 'automate' || role === 'automate-frame') css += t.automate || '';
    css += t.neon || ''; // every rule there is gated on data-capd-look="neon"
    return rewriter.scoped(css, scope ? LIMIT() : null);
  }

  /*
   * The inline rules are deliberately NOT wrapped in the canvas @scope.
   * Studio draws many icons as <svg><use href="#symbol"> into a hidden
   * sprite, and the browser renders each <use> as a copy of the symbol in a
   * shadow tree, outside any @scope rooted at <html>: scoped rules never
   * reach the copies, so a sprite's fill="black" stayed black on dark
   * buttons (the Justify / Align buttons in the properties pane).  The rules
   * only act on elements carrying data-capd-inline, which the inline
   * processor never sets inside the designer canvas, so the canvas stays
   * untouched without the scope.
   */
  function buildInline() {
    return CAPD.InlineProcessor.css;
  }

  function htmlAttrs(settings) {
    return {
      [CAPD.ATTR]: 'dark',
      'data-capd-surface': settings.surface,
      'data-capd-contrast': settings.contrast,
      'data-capd-backdrop': settings.backdrop,
      'data-capd-icons': settings.iconAdapt ? 'adapt' : 'original',
      'data-capd-look': settings.look === 'neon' ? 'neon' : 'classic',
    };
  }

  CAPD.staticTheme = { resolveSpec, ensureContrast, tokenCSS, paletteVars, buildStatic, buildTuned, buildInline, htmlAttrs, isExcludedVar, greyHex, greyFor, rampFromSeed, brand: BRAND, NEON_PINK, NEON_CYAN };
})(typeof globalThis !== 'undefined' ? globalThis : this);
