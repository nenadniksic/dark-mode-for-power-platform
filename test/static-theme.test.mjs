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

test('static, tuned and inline layers are scoped away from the canvas, and tuned rules use :scope', () => {
  const st = CAPD.staticTheme.buildStatic(settings, true);
  const tuned = CAPD.staticTheme.buildTuned(settings, 'studio', true);
  const inline = CAPD.staticTheme.buildInline(true);
  const wrapper = `@scope (:root) to (${CAPD.CANVAS_LIMIT_SELECTOR}){`;
  assert.ok(st.includes(wrapper));
  assert.ok(tuned.startsWith(wrapper));
  assert.ok(inline.startsWith(wrapper));
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
