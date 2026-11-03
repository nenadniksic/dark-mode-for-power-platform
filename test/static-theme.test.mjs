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
  assert.ok(st.startsWith(':root{--capd-s0:'), 'palette variables are declared outside the scope');
  // maker rules only for maker roles
  assert.ok(!CAPD.staticTheme.buildTuned(settings, 'studio', true).includes('O365_NavHeader'));
  assert.ok(CAPD.staticTheme.buildTuned(settings, 'studio-host', true).includes('O365_NavHeader'));
});

test('shadow roots get unscoped CSS', () => {
  assert.ok(!CAPD.staticTheme.buildTuned(settings, 'studio', false).includes('@scope'));
});

test('html attributes reflect the settings', () => {
  assert.deepEqual(CAPD.staticTheme.htmlAttrs({ ...settings, surface: 'black', iconAdapt: false, backdrop: 'light', contrast: 'high' }), {
    'data-capd': 'dark', 'data-capd-surface': 'black', 'data-capd-contrast': 'high', 'data-capd-backdrop': 'light', 'data-capd-icons': 'original',
  });
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
  for (const sel of ['#publishedCanvas', '[class*="pickerFill_"]', '[class*="pickerBackground_"]', '.ms-ColorPicker-colorRect', '.ms-ColorPicker-slider']) assert.ok(limit.includes(sel), sel);
  assert.ok(CAPD.staticTheme.buildTuned(settings, 'studio', true).startsWith(`@scope (:root) to (${limit}){`));
});
