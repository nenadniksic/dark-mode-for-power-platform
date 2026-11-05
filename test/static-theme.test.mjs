import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('../src/content/00-namespace.js');
require('../src/content/10-color.js');
require('../src/content/generated/fluent-tokens.js');
require('../src/content/generated/theme-css.js');
require('../src/content/20-css-rewriter.js');
const CAPD = globalThis.CAPD;
CAPD.InlineProcessor = { css: '[data-capd-inline~="bg"]{background-color:var(--capd-i-bg) !important;}' };
require('../src/content/60-static-theme.js');
const settings = { enabled: true, mode: 'dark', surface: 'dark', contrast: 'standard', backdrop: 'dark', makerPortal: true, iconAdapt: true };

test('token layer covers every Fluent colour token and the portal mount nodes', () => {
  const css = CAPD.staticTheme.tokenCSS(settings);
  for (const name of CAPD.FLUENT_TOKEN_NAMES) assert.ok(css.includes(`${name}:`), name);
  assert.ok(css.startsWith('.fui-FluentProvider,[class*="fui-FluentProvider"],:scope,:root{'));
  assert.ok(css.includes('--colorNeutralBackground1:#292929 !important;'));
  assert.ok(css.includes('--capd-fg-colorNeutralBackgroundStatic:'));
});

test('surface and contrast settings shift the greys', () => {
  const black = CAPD.staticTheme.tokenCSS({ ...settings, surface: 'black' });
  const dim = CAPD.staticTheme.tokenCSS({ ...settings, surface: 'dim' });
  const high = CAPD.staticTheme.tokenCSS({ ...settings, contrast: 'high' });
  assert.ok(black.includes('--colorNeutralBackground1:#1a1a1a !important;'));
  assert.ok(dim.includes('--colorNeutralBackground1:#333333 !important;'));
  assert.ok(high.includes('--colorNeutralForeground2:#ebebeb !important;'));
});

test('static and tuned layers are scoped away from the canvas, tuned rules use :scope, inline rules are not scoped', () => {
  const st = CAPD.staticTheme.buildStatic(settings, true);
  const tuned = CAPD.staticTheme.buildTuned(settings, 'studio', true);
  const inline = CAPD.staticTheme.buildInline(true);
  const wrapper = `@scope (:root) to (${CAPD.CANVAS_LIMIT_SELECTOR}){`;
  assert.ok(st.includes(wrapper));
  assert.ok(tuned.startsWith(wrapper));
  assert.ok(!inline.includes('@scope'), 'inline rules must reach <use> shadow copies, which sit outside any @scope');
  assert.equal(inline, CAPD.InlineProcessor.css);
  assert.ok(!tuned.includes('html[data-capd'), 'a leading html selector never matches inside @scope (:root)');
  assert.ok(tuned.includes(':scope[data-capd="dark"]'));
  assert.ok(st.indexOf(':root{--capd-s0:') > -1 && st.indexOf(':root{--capd-s0:') < st.indexOf('@scope'), 'palette variables are declared outside the scope');
  // maker rules only for maker roles
  assert.ok(!CAPD.staticTheme.buildTuned(settings, 'studio', true).includes('o365sx-waffle'));
  assert.ok(CAPD.staticTheme.buildTuned(settings, 'studio-host', true).includes('o365sx-waffle'));
  // SharePoint gets its own rules, and none of the maker portal's
  const sp = CAPD.staticTheme.buildTuned(settings, 'sharepoint', true);
  assert.ok(sp.includes(CAPD.themeCSS.sharepoint.slice(0, 40)));
  // the library command bar keeps no band behind its buttons; the selected-items bar keeps its surface
  assert.ok(CAPD.themeCSS.sharepoint.includes('[class*="commandBarRoot_"]:not([class*="contextual_"]){background:none !important;}'));
  assert.ok(!sp.includes('o365sx-waffle'));
});

test('shadow roots get unscoped CSS', () => {
  assert.ok(!CAPD.staticTheme.buildTuned(settings, 'studio', false).includes('@scope'));
});

test('html attributes reflect the settings', () => {
  assert.deepEqual(CAPD.staticTheme.htmlAttrs({ ...settings, surface: 'black', iconAdapt: false, backdrop: 'light', contrast: 'high' }), {
    'data-capd': 'dark', 'data-capd-surface': 'black', 'data-capd-contrast': 'high', 'data-capd-backdrop': 'light', 'data-capd-icons': 'original', 'data-capd-look': 'classic',
  });
  assert.equal(CAPD.staticTheme.htmlAttrs({ ...settings, look: 'neon' })['data-capd-look'], 'neon');
});

test('a text token painted as a background gets a surface-mapped variant', () => {
  const css = CAPD.staticTheme.tokenCSS(settings);
  assert.equal(CAPD.staticTheme.isExcludedVar('--colorNeutralForegroundInverted', 'bg'), false);
  assert.equal(CAPD.staticTheme.isExcludedVar('--colorNeutralForegroundInverted', 'fg'), true);
  // white in the light theme -> the base surface, the same grey the command bar sits on
  assert.ok(css.includes('--capd-bg-colorNeutralForegroundInverted:rgb(41, 41, 41);'), css.match(/--capd-bg-colorNeutralForegroundInverted:[^;]*/)?.[0]);
});

test('role-aware exclusion keeps Fluent tokens static except surface tokens used as text', () => {
  const x = CAPD.staticTheme.isExcludedVar;
  assert.equal(x('--colorNeutralBackground1', 'bg'), true);
  assert.equal(x('--colorNeutralBackground1', 'fg'), false);
  assert.equal(x('--colorNeutralForeground1', 'fg'), true);
  assert.equal(x('--colorNeutralStroke1', 'fg'), false);
  assert.equal(x('--vscode-editor-background', 'bg'), false);
});

test('brand ramp: the Power Apps seed returns the shipped ramp, other seeds get a ramp of their own hue', () => {
  const shipped = CAPD.FLUENT_BRAND;
  assert.equal(CAPD.staticTheme.rampFromSeed(shipped[80]), shipped);
  assert.equal(CAPD.staticTheme.rampFromSeed('#933493'), shipped, 'case-insensitive match');
  const blue = CAPD.staticTheme.rampFromSeed('#0066ff');
  assert.equal(blue[80], '#0066ff');
  const color = CAPD.color;
  let prev = -1;
  for (const step of Object.keys(shipped).map(Number).sort((a, b) => a - b)) {
    const hsl = color.toHsl(color.parse(blue[step]));
    assert.ok(Math.abs(hsl.h - 216) < 4, `step ${step} keeps the hue (${blue[step]})`);
    assert.ok(hsl.l > prev, `step ${step} is lighter than the step before`);
    prev = hsl.l;
  }
  assert.equal(CAPD.staticTheme.rampFromSeed('not a colour'), null);
  // a darker seed (the Power Apps portal's #742774) keeps the light half at least as light as the template
  const portal = CAPD.staticTheme.rampFromSeed('#742774');
  for (const step of [90, 100, 110, 120, 130, 140, 150, 160]) {
    assert.ok(color.toHsl(color.parse(portal[step])).l >= color.toHsl(color.parse(shipped[step])).l - 0.005, `step ${step}`);
  }
});

test('a page brand seed recolours brand tokens and accent variables, not neutrals', () => {
  try {
    CAPD.brandSeed = '#0066ff';
    const css = CAPD.staticTheme.tokenCSS(settings);
    const pal = CAPD.staticTheme.paletteVars(settings);
    assert.ok(css.includes('--colorBrandBackgroundHover:#0066ff !important;'), 'b80 is the seed');
    assert.ok(!/#933493|#852985/i.test(css), 'no Power Apps purple left in the tokens');
    assert.ok(css.includes('--colorNeutralBackground1:#292929 !important;'), 'neutrals unchanged');
    assert.ok(!pal.includes('188, 95, 188'), 'accent variables follow the brand');
    assert.ok(pal.includes('--capd-accent-bg-hover:#0066ff;'));
  } finally {
    CAPD.brandSeed = null;
  }
  assert.ok(CAPD.staticTheme.tokenCSS(settings).includes('--colorBrandBackgroundHover:#933493 !important;'), 'back to the shipped ramp');
});

test('high contrast strengthens strokes but leaves Dim surfaces where the surface setting puts them', () => {
  const dimHigh = CAPD.staticTheme.tokenCSS({ ...settings, surface: 'dim', contrast: 'high' });
  const get = (css, name) => (css.match(new RegExp(`--${name}:([^ ;]+)`)) || [])[1];
  assert.equal(get(dimHigh, 'colorNeutralCardBackground'), '#3d3d3d', 'g20 + Dim offset 4, no stroke bump');
  assert.equal(get(dimHigh, 'colorNeutralStroke3'), '#575757', 'g24 + Dim 4 + 6: strokes are stronger');
  const pal = CAPD.staticTheme.paletteVars({ ...settings, surface: 'dim', contrast: 'high' });
  assert.ok(pal.includes('--capd-raised:#3d3d3d;'));
});

test('colour previews are excluded like the canvas, so swatches and pickers show true colours', () => {
  const limit = CAPD.CANVAS_LIMIT_SELECTOR;
  for (const sel of ['#publishedCanvas', '[id^="insertAffordance"]', '[class*="pickerFill_"]', '[class*="pickerBackground_"]', '.ms-ColorPicker-colorRect', '.ms-ColorPicker-slider']) assert.ok(limit.includes(sel), sel);
  assert.ok(CAPD.staticTheme.buildTuned(settings, 'studio', true).startsWith(`@scope (:root) to (${limit}){`));
});

test('Neon style: violet-black surfaces, hot-pink brand with white-readable buttons, cyan focus', () => {
  const color = CAPD.color;
  const neon = { ...settings, look: 'neon' };
  const css = CAPD.staticTheme.tokenCSS(neon);
  const get = (name) => (css.match(new RegExp(`--${name}:([^ ;]+)`)) || [])[1];
  const bg = color.toHsl(color.parse(get('colorNeutralBackground1')));
  assert.ok(Math.abs(bg.h - 268) < 3 && bg.s > 0.25, `surface is violet: ${get('colorNeutralBackground1')}`);
  assert.ok(Math.abs(bg.l - 0.16) < 0.01, 'same lightness as the classic Dark surface');
  const button = color.parse(get('colorBrandBackground'));
  assert.ok(Math.abs(color.toHsl(button).h - 332) < 6, `brand is hot pink: ${get('colorBrandBackground')}`);
  assert.ok(color.contrast(button, color.parse('#ffffff')) >= 4.5, 'white text reads on the brand button');
  assert.equal(get('colorStrokeFocus2'), '#00e5ff');
  assert.ok(!/#933493|#0066ff/i.test(css), 'no product brand left');
  const pal = CAPD.staticTheme.paletteVars(neon);
  assert.ok(pal.includes('--capd-focus:#00e5ff;'));
  assert.ok(pal.includes('--capd-glow:rgba(255, 42, 138, 0.55);'));
  // the generic mapping tints neutrals and leaves coloured values' hue alone
  const white = color.toHsl(color.modify('bg', color.parse('#ffffff'), { look: 'neon' }));
  assert.ok(Math.abs(white.h - 268) < 3 && white.s > 0.25);
  const blue = color.toHsl(color.modify('fg', color.parse('#0078d4'), { look: 'neon' }));
  assert.ok(Math.abs(blue.h - color.toHsl(color.parse('#0078d4')).h) < 2, 'syntax and status colours keep their hue');
  // Classic is untouched
  assert.ok(CAPD.staticTheme.tokenCSS(settings).includes('--colorNeutralBackground1:#292929 !important;'));
});

test('Neon glow rules are all gated on the neon look and scoped away from the canvas', () => {
  const tuned = CAPD.staticTheme.buildTuned(settings, 'studio', true);
  const neon = CAPD.themeCSS.neon;
  assert.ok(neon.includes('.fui-Input') && neon.includes('input[class*="inputStyles_"]'), 'controls are listed');
  // every selector in neon.css starts with the neon gate
  for (const rule of neon.split('}').filter((r) => r.includes('{'))) {
    for (const s of rule.slice(0, rule.indexOf('{')).split(/,(?![^(]*\))/)) assert.ok(s.trim().startsWith(':scope[data-capd="dark"][data-capd-look="neon"]'), s.trim().slice(0, 80));
  }
  assert.ok(tuned.includes(neon) && tuned.startsWith('@scope'), 'inside the canvas scope');
});

test('Neon: the borderless marks are registered as non-inheriting, and only default buttons read them', () => {
  const css = CAPD.staticTheme.buildStatic(settings, true);
  assert.ok(css.startsWith("@property --capd-edge{syntax:'*';inherits:false}@property --capd-halo{syntax:'*';inherits:false}"));
  const neon = CAPD.themeCSS.neon;
  for (const rule of neon.split('}').filter((r) => r.includes('var(--capd-halo') || r.includes('var(--capd-edge'))) assert.ok(rule.slice(0, rule.indexOf('{')).split(/,(?![^(]*\))/).every((s) => s.includes('.ms-Button--default')), rule.slice(0, 120));
});

test('Neon: the disabled colour is a near-grey, not the magenta of its stroke step, and still reads at 3:1', () => {
  const color = CAPD.color;
  for (const surface of ['dim', 'dark', 'black']) {
    const s = { ...settings, look: 'neon', surface };
    const pv = CAPD.staticTheme.paletteVars(s);
    const disabled = color.parse(/--capd-disabled:([^;]+)/.exec(pv)[1]);
    const raised = color.parse(/--capd-raised:([^;]+)/.exec(pv)[1]);
    assert.ok(Math.max(disabled.r, disabled.g, disabled.b) - Math.min(disabled.r, disabled.g, disabled.b) <= 24, `${surface}: ${color.format(disabled)}`);
    assert.ok(color.contrast(disabled, raised) >= 2.95, `${surface}: ${color.contrast(disabled, raised)}`);
    const token = /--colorNeutralForegroundDisabled:([^ ;]+)/.exec(CAPD.staticTheme.tokenCSS(s))[1];
    assert.equal(color.format(color.parse(token)), color.format(disabled), 'token and palette variable agree');
  }
  // Classic keeps its grey
  assert.match(CAPD.staticTheme.paletteVars({ ...settings, look: 'classic' }), /--capd-disabled:#7e7e7e;/);
});
