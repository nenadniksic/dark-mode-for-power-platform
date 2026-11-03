import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('../src/content/10-color.js');
const rewriter = require('../src/content/20-css-rewriter.js');

/* ---- tiny mock CSSOM ---------------------------------------------------- */
function decl(obj, important = []) {
  const keys = Object.keys(obj);
  return {
    length: keys.length,
    ...Object.fromEntries(keys.map((k, i) => [i, k])),
    getPropertyValue: (p) => obj[p] || '',
    getPropertyPriority: (p) => (important.includes(p) ? 'important' : ''),
  };
}
const styleRule = (selectorText, obj, important) => ({ type: 1, selectorText, style: decl(obj, important) });
const mediaRule = (conditionText, cssRules) => ({ type: 4, conditionText, media: { mediaText: conditionText }, cssRules });
const ctx = (extra = {}) => ({ opts: {}, isExcludedVar: (n) => n.startsWith('--color'), ...extra });

test('rewrites colour declarations with !important and leaves layout alone', () => {
  const css = rewriter.rewriteRules([
    styleRule('.root-123', { 'background-color': 'rgb(255, 255, 255)', color: 'rgb(50, 49, 48)', width: '100px', 'border-top-color': 'rgb(237, 235, 233)' }),
  ], ctx());
  assert.match(css, /^\.root-123\{background-color:rgb\(\d+, \d+, \d+\) !important;color:rgb\(\d+, \d+, \d+\) !important;border-top-color:rgb\(\d+, \d+, \d+\) !important;\}$/);
  assert.ok(!css.includes('width'));
});

test('skips rules that contain no colours', () => {
  assert.equal(rewriter.rewriteRules([styleRule('.a', { display: 'flex', color: 'inherit' })], ctx()), '');
});

test('keeps dark brand backgrounds and white text untouched', () => {
  const css = rewriter.rewriteRules([styleRule('.ms-Button--primary', { 'background-color': 'rgb(116, 39, 116)', color: 'rgb(255, 255, 255)' })], ctx());
  assert.equal(css, '');
});

test('custom properties get typed variants and var() usages are retargeted', () => {
  const css = rewriter.rewriteRules([
    styleRule('.monaco-editor', { '--vscode-editor-background': '#fffffe', '--vscode-editor-foreground': '#000000', '--vscode-badge-size': '12px' }),
    styleRule('.monaco-editor .margin', { 'background-color': 'var(--vscode-editor-background)' }),
    styleRule('.monaco-editor .mtk1', { color: 'var(--vscode-editor-foreground, #000)' }),
  ], ctx());
  assert.ok(css.includes('--capd-bg-vscode-editor-background:rgb('));
  assert.ok(css.includes('--capd-fg-vscode-editor-foreground:rgb('));
  assert.ok(!css.includes('--capd-bg-vscode-badge-size'));
  assert.ok(css.includes('.monaco-editor .margin{background-color:var(--capd-bg-vscode-editor-background, var(--vscode-editor-background)) !important;}'));
  assert.ok(/\.mtk1\{color:var\(--capd-fg-vscode-editor-foreground, rgb\(\d+, \d+, \d+\)\) !important;\}/.test(css));
});

test('Fluent design tokens are excluded from dynamic handling', () => {
  const css = rewriter.rewriteRules([
    styleRule('.fui-FluentProvider1', { '--colorNeutralBackground1': '#ffffff' }),
    styleRule('.fxyz', { 'background-color': 'var(--colorNeutralBackground1)' }),
  ], ctx());
  assert.equal(css, '');
});

test('a surface token used as text colour is retargeted to its text variant', () => {
  const isExcludedVar = (n, kind) => n.startsWith('--color') && !(kind === 'fg' && /Background|Stroke/.test(n));
  const css = rewriter.rewriteRules([
    styleRule('.fs9fzeb', { color: 'var(--colorNeutralBackgroundStatic)' }),
    styleRule('.fabc', { 'background-color': 'var(--colorNeutralBackgroundStatic)' }),
  ], ctx({ isExcludedVar }));
  assert.equal(css, '.fs9fzeb{color:var(--capd-fg-colorNeutralBackgroundStatic, var(--colorNeutralBackgroundStatic)) !important;}');
});

test('media queries are preserved around rewritten rules', () => {
  const css = rewriter.rewriteRules([
    mediaRule('(max-width: 600px)', [styleRule('.a', { color: '#000' }), styleRule('.b', { display: 'none' })]),
  ], ctx());
  assert.match(css, /^@media \(max-width: 600px\)\{\.a\{color:rgb\(\d+, \d+, \d+\) !important;\}\}$/);
});

test('@import sheets are followed and foreign ones reported', () => {
  const foreign = [];
  const css = rewriter.rewriteRules([
    { type: 3, href: 'https://cdn/x.css', media: { mediaText: '' }, styleSheet: { get cssRules() { throw new Error('SecurityError'); } } },
    { type: 3, href: 'local.css', media: { mediaText: 'print' }, styleSheet: { cssRules: [styleRule('.p', { color: '#000' })] } },
  ], ctx({ onForeign: (u) => foreign.push(u) }));
  assert.deepEqual(foreign, ['https://cdn/x.css']);
  assert.match(css, /^@media print\{\.p\{color:rgb/);
});

test('scoped() wraps output in a donut scope', () => {
  assert.equal(rewriter.scoped('.a{color:red !important;}', '#publishedCanvas'), '@scope (:root) to (#publishedCanvas){.a{color:red !important;}}');
  assert.equal(rewriter.scoped('', '#publishedCanvas'), '');
});

test('shadow colours: light shadows darken, black ones stay', () => {
  const css = rewriter.rewriteRules([styleRule('.x', { 'box-shadow': 'rgb(221, 221, 221) 0px 6px 6px -6px inset' })], ctx());
  assert.ok(css.includes('box-shadow:rgb('));
  assert.equal(rewriter.rewriteRules([styleRule('.y', { 'box-shadow': 'rgba(0, 0, 0, 0.2) 0 1px 2px' })], ctx()), '');
});

test('selectors starting with html or :root are retargeted to :scope when output is scoped', () => {
  assert.equal(rewriter.scopeSelector('html.web #html-splash-screen'), ':scope.web #html-splash-screen');
  assert.equal(rewriter.scopeSelector(':root'), ':scope');
  assert.equal(rewriter.scopeSelector(':root[dir="rtl"] .x, html > body, .html, htmlx .y'), ':scope[dir="rtl"] .x, :scope > body, .html, htmlx .y');
  assert.equal(rewriter.scopeSelector('.a:is(html, body)'), '.a:is(html, body)');
  const css = rewriter.rewriteRules([styleRule('html.web #splash', { 'background-color': '#f3f2f1' })], ctx({ scoped: true }));
  assert.ok(css.startsWith(':scope.web #splash{background-color:rgb('));
  const unscoped = rewriter.rewriteRules([styleRule('html.web #splash', { 'background-color': '#f3f2f1' })], ctx({ scoped: false }));
  assert.ok(unscoped.startsWith('html.web #splash{'));
  const inMedia = rewriter.rewriteRules([mediaRule('(min-width: 1px)', [styleRule(':root', { '--brand': '#742774' })])], ctx({ scoped: true }));
  assert.ok(inMedia.includes('{:scope{--capd-bg-brand:'));
});

/* A browser declaration block for a shorthand that contains var(): the
   longhands are listed but read as '' (pending substitution), and only the
   shorthand, read by name, returns the declared text. */
function pendingDecl(shorthands, longhands) {
  const keys = longhands;
  return {
    length: keys.length,
    ...Object.fromEntries(keys.map((k, i) => [i, k])),
    getPropertyValue: (p) => shorthands[p] || '',
    getPropertyPriority: () => '',
  };
}

test('shorthands declared with var() are rewritten even though their longhands read as empty', () => {
  const bg = { type: 1, selectorText: '.react-flow__controls-button', style: pendingDecl(
    { background: 'var(--xy-controls-button-background-color,var(--xy-controls-button-background-color-default))', 'border-bottom': '1px solid var(--xy-controls-button-border-color-default)' },
    ['background-image', 'background-position-x', 'background-color', 'border-bottom-width', 'border-bottom-style', 'border-bottom-color']) };
  const css = rewriter.rewriteRules([bg], ctx());
  assert.equal(css, '.react-flow__controls-button{'
    + 'background:var(--capd-bg-xy-controls-button-background-color, var(--capd-bg-xy-controls-button-background-color-default, var(--xy-controls-button-background-color-default))) !important;'
    + 'border-bottom:1px solid var(--capd-bd-xy-controls-button-border-color-default, var(--xy-controls-button-border-color-default)) !important;}');
});

test('shorthands are left alone when their colour longhand has a real value or no var() is involved', () => {
  const plain = { type: 1, selectorText: '.a', style: pendingDecl({ background: 'rgb(255, 255, 255)', 'background-color': 'rgb(255, 255, 255)' }, ['background-color']) };
  const css = rewriter.rewriteRules([plain], ctx());
  assert.match(css, /^\.a\{background-color:rgb\(\d+, \d+, \d+\) !important;\}$/, 'longhand rewritten once, shorthand not repeated');
  const fluent = { type: 1, selectorText: '.b', style: pendingDecl({ border: '1px solid var(--colorNeutralStroke1)' }, ['border-top-color', 'border-top-width']) };
  assert.equal(rewriter.rewriteRules([fluent], ctx()), '', 'Fluent tokens stay with the static layer');
});

test("the page's own !important keeps beating its normal declarations inside the override layer", () => {
  const base = styleRule('.root-345', { color: 'rgb(50, 49, 48)', 'background-color': 'rgb(255, 255, 255)' });
  const cancel = styleRule('.propertyTitle_1kl7awd', { 'background-color': 'transparent' }, ['background-color']);
  const css = rewriter.rewriteRules([base, cancel], ctx());
  assert.match(css, /^\.root-345\{color:rgb\([^)]*\) !important;background-color:rgb\([^)]*\) !important;\}/);
  assert.ok(css.endsWith('.propertyTitle_1kl7awd:not(#capd-i):not(#capd-i):not(#capd-i){background-color:transparent !important;}'),
    're-asserted with a boost even though transparent needs no rewriting');
  // a rewritten !important colour goes into the boosted rule too
  const imp = rewriter.rewriteRules([styleRule('.x', { color: 'rgb(50, 49, 48)', 'border-top-color': 'rgb(200, 200, 200)' }, ['color'])], ctx());
  assert.match(imp, /^\.x\{border-top-color:[^}]*\}\.x:not\(#capd-i\):not\(#capd-i\):not\(#capd-i\)\{color:rgb\([^)]*\) !important;\}$/);
});

test('the boost goes before pseudo-elements and onto every selector in a list', () => {
  assert.equal(rewriter.boostSelector('.a::before, .b:hover .c, .d:after'),
    '.a:not(#capd-i):not(#capd-i):not(#capd-i)::before, .b:hover .c:not(#capd-i):not(#capd-i):not(#capd-i), .d:not(#capd-i):not(#capd-i):not(#capd-i):after');
  assert.equal(rewriter.boostSelector('input::-webkit-input-placeholder'), 'input:not(#capd-i):not(#capd-i):not(#capd-i)::-webkit-input-placeholder');
});

test('a text token used as a background is retargeted to its background variant', () => {
  const isExcludedVar = (n, kind) => n.startsWith('--color') && !(kind === 'bg' && /Foreground/.test(n));
  const css = rewriter.rewriteRules([styleRule('.root-251', { 'background-color': 'var(--colorNeutralForegroundInverted)', color: 'var(--colorNeutralForeground1)' })], ctx({ isExcludedVar }));
  assert.equal(css, '.root-251{background-color:var(--capd-bg-colorNeutralForegroundInverted, var(--colorNeutralForegroundInverted)) !important;}');
});

test('splitSelectorList respects parentheses, brackets and strings', () => {
  assert.deepEqual(rewriter.splitSelectorList('a, b:not(.c, .d), [data-x="p,q"] e'), ['a', ' b:not(.c, .d)', ' [data-x="p,q"] e']);
});
