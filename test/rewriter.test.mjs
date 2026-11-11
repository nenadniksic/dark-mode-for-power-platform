import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('../src/content/10-color.js');
const rewriter = require('../src/content/20-css-rewriter.js');
require('../src/content/generated/theme-css.js');
const { themeCSS } = globalThis.CAPD;

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
  // typed variant, then the page's own variable, then the (recoloured) fallback
  assert.ok(/\.mtk1\{color:var\(--capd-fg-vscode-editor-foreground, var\(--vscode-editor-foreground, rgb\(\d+, \d+, \d+\)\)\) !important;\}/.test(css), css);
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
    + 'background:var(--capd-bg-xy-controls-button-background-color, var(--xy-controls-button-background-color, var(--capd-bg-xy-controls-button-background-color-default, var(--xy-controls-button-background-color-default)))) !important;'
    + 'border-bottom-color:var(--capd-bd-xy-controls-button-border-color-default, var(--xy-controls-button-border-color-default)) !important;}');
});

test('a border shorthand is recoloured through its colour longhand, never re-asserting width or style', () => {
  // SharePoint's command-bar buttons: a Fluent reset style with a var() width,
  // then atomic classes that zero the widths.  Re-emitting `border:` drew a box.
  const reset = { type: 1, selectorText: '.r1f29ykk', style: pendingDecl(
    { border: 'var(--strokeWidthThin) solid var(--sp-button-border)' },
    ['border-top-width', 'border-top-style', 'border-top-color']) };
  assert.equal(rewriter.rewriteRules([reset], ctx()), '.r1f29ykk{border-color:var(--capd-bd-sp-button-border, var(--sp-button-border)) !important;}');
  const tokenOnly = { type: 1, selectorText: '.r2', style: pendingDecl({ border: 'var(--strokeWidthThin) solid var(--colorNeutralStroke1)' }, ['border-top-width', 'border-top-color']) };
  assert.equal(rewriter.rewriteRules([tokenOnly], ctx({ isExcludedVar: (n) => n === '--colorNeutralStroke1' })), '', 'a width variable is not a colour');
  assert.equal(rewriter.colorToken('var(--strokeWidthThin) solid var(--colorNeutralStroke1)'), 'var(--colorNeutralStroke1)');
  assert.equal(rewriter.colorToken('1px dashed rgb(1, 2, 3)'), 'rgb(1, 2, 3)');
  assert.equal(rewriter.colorToken('underline currentColor'), 'currentColor');
  assert.equal(rewriter.colorToken('var(--borderWidth) solid'), null);
  assert.equal(rewriter.colorToken('var(--a) var(--b)'), undefined, 'two candidates: ambiguous');
  assert.equal(rewriter.colorToken('var(--sp-grid-outer-shell-border,1px solid var(--colorNeutralStroke3))'), undefined, 'one var() alone may hold the whole border');
  const shell = { type: 1, selectorText: '.shell', style: pendingDecl({ border: 'var(--sp-shell,1px solid var(--colorNeutralStroke3))' }, ['border-top-width', 'border-top-color']) };
  assert.equal(rewriter.rewriteRules([shell], ctx()), '.shell{border:var(--capd-bd-sp-shell, var(--sp-shell, 1px solid var(--colorNeutralStroke3))) !important;}', 'kept as a shorthand');
});

test('a border-image shorthand with var() colours is rewritten (SharePoint list row dividers)', () => {
  const row = { type: 1, selectorText: '.odspSpartanList .row', style: pendingDecl(
    { 'border-image': 'linear-gradient(0deg,var(--bottom-row-color) 2px,transparent 2px 10px) 1' },
    ['border-image-source', 'border-image-slice', 'border-image-width']) };
  assert.equal(rewriter.rewriteRules([row], ctx()), '.odspSpartanList .row{border-image:linear-gradient(0deg,var(--capd-bd-bottom-row-color, var(--bottom-row-color)) 2px,transparent 2px 10px) 1 !important;}');
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
  // a pseudo-class after the pseudo-element stays after it (a :not() there is invalid and drops the rule)
  assert.equal(rewriter.boostSelector(':scope::-webkit-scrollbar-thumb:hover'), ':scope:not(#capd-i):not(#capd-i):not(#capd-i)::-webkit-scrollbar-thumb:hover');
  // a pseudo-element with no compound of its own keeps its combinator
  assert.equal(rewriter.boostSelector('.a ::before,.b>::after'), '.a *:not(#capd-i):not(#capd-i):not(#capd-i)::before,.b>*:not(#capd-i):not(#capd-i):not(#capd-i)::after');
});

test('theme rules: !important declarations get the boost, normal ones keep their selector', () => {
  const B = ':not(#capd-i):not(#capd-i):not(#capd-i)';
  assert.equal(rewriter.boostImportantRules(':scope #a{background-color:var(--x) !important;}.b,.c::before{width:2px;color:red !important}'),
    `:scope #a${B}{background-color:var(--x) !important;}.b,.c::before{width:2px;}.b${B},.c${B}::before{color:red !important;}`);
  // semicolons inside values and strings do not split a declaration
  assert.equal(rewriter.boostImportantRules('.d{background-image:url("a;b") !important;content:";"}'),
    `.d{content:";";}.d${B}{background-image:url("a;b") !important;}`);
  assert.throws(() => rewriter.boostImportantRules('@media print{.a{color:red !important}}'), /not flat CSS/);
});

test("Studio's canvas backdrop: the theme rule outranks the page's boosted !important", () => {
  // The page: .animatedCanvasScrollableContainer_8vu0x0 { background-color: var(--colorNeutralBackground2) !important }
  const page = rewriter.boostSelector('.animatedCanvasScrollableContainer_8vu0x0');
  const tuned = /([^{}]*#animatedCanvasScrollableContainer[^{}]*)\{[^}]*--capd-backdrop/.exec(themeCSS.studio);
  assert.ok(tuned, 'the backdrop rule is in the studio theme');
  const spec = (sel) => [(sel.match(/#[\w-]+/g) || []).length, (sel.match(/\.[\w-]+|\[[^\]]+\]|:(?!not\()[\w-]+/g) || []).length];
  const [ti, tc] = spec(tuned[1]), [pi, pc] = spec(page);
  assert.ok(ti > pi || (ti === pi && tc >= pc), `theme ${tuned[1]} (${ti},${tc}) vs page ${page} (${pi},${pc})`);
});

test('a text token used as a background is retargeted to its background variant', () => {
  const isExcludedVar = (n, kind) => n.startsWith('--color') && !(kind === 'bg' && /Foreground/.test(n));
  const css = rewriter.rewriteRules([styleRule('.root-251', { 'background-color': 'var(--colorNeutralForegroundInverted)', color: 'var(--colorNeutralForeground1)' })], ctx({ isExcludedVar }));
  assert.equal(css, '.root-251{background-color:var(--capd-bg-colorNeutralForegroundInverted, var(--colorNeutralForegroundInverted)) !important;}');
});

test('splitSelectorList respects parentheses, brackets and strings', () => {
  assert.deepEqual(rewriter.splitSelectorList('a, b:not(.c, .d), [data-x="p,q"] e'), ['a', ' b:not(.c, .d)', ' [data-x="p,q"] e']);
});

test('Neon: a rule that makes all four borders transparent marks the element as borderless', () => {
  const sides = { 'border-top-color': 'transparent', 'border-right-color': 'transparent', 'border-bottom-color': 'rgba(0, 0, 0, 0)', 'border-left-color': 'transparent' };
  const neon = rewriter.rewriteRules([styleRule('.root-885', sides)], ctx({ opts: { look: 'neon' } }));
  assert.equal(neon, '.root-885{--capd-edge:transparent;--capd-halo:none;}');
  // the classic style has no glow to switch off
  assert.equal(rewriter.rewriteRules([styleRule('.root-885', sides)], ctx({ opts: { look: 'classic' } })), '');
  // one visible side means the element has a border
  assert.equal(rewriter.rewriteRules([styleRule('.root-1', { ...sides, 'border-bottom-color': 'rgb(138, 136, 134)' })], ctx({ opts: { look: 'neon' } })).includes('--capd-edge'), false);
});

/* ---- @keyframes ---------------------------------------------------------- */
const keyframes = (name, frames) => ({ type: 7, name, cssRules: frames.map(([keyText, cssText]) => ({ keyText, style: { cssText } })) });

test('an animation that ends on a colour gets a recoloured copy of its keyframes', () => {
  // SharePoint's selected-items command bar: fill-mode both, ends white.
  const rule = keyframes('commandBarBoxShadowAnimation_edf7aa1c', [
    ['0%', 'background-color: transparent; box-shadow: none;'],
    ['100%', 'background-color: var(--ms-semanticColors-listBackground); box-shadow: var(--sp-cmd-contextualBar-shadow,var(--ms-effects-elevation8)); transform: translateY(0px);'],
  ]);
  const c = ctx({ keyframes: [] });
  assert.equal(rewriter.rewriteRules([rule], c), '', 'keyframes are handed out, not inlined, when collected');
  assert.equal(c.keyframes.length, 1);
  const kf = c.keyframes[0];
  assert.ok(kf.startsWith('@keyframes commandBarBoxShadowAnimation_edf7aa1c{0%{background-color:transparent;box-shadow:none}100%{'), kf);
  assert.ok(kf.includes('background-color:var(--capd-bg-ms-semanticColors-listBackground, var(--ms-semanticColors-listBackground))'), kf);
  assert.ok(kf.includes('transform:translateY(0px)'), 'non-colour declarations are kept: the copy replaces the whole rule');
  assert.ok(!kf.includes('!important'), 'keyframes ignore !important');
});

test('keyframes without colours are left alone, and are inlined when nothing collects them', () => {
  const c = ctx({ keyframes: [] });
  rewriter.rewriteRules([keyframes('fade', [['from', 'opacity: 0;'], ['to', 'opacity: 1;']])], c);
  assert.deepEqual(c.keyframes, []);
  const inline = rewriter.rewriteRules([keyframes('flash', [['to', 'background: #ffffff;']])], ctx());
  assert.match(inline, /^@keyframes flash\{to\{background:rgb\(\d+, \d+, \d+\)\}\}$/);
});

test('keyframes inside @media keep their condition, outside the canvas scope', () => {
  const c = ctx({ keyframes: [], scoped: true });
  const css = rewriter.rewriteRules([mediaRule('(min-width: 1px)', [keyframes('glow', [['to', 'color: #000000;']])])], c);
  assert.equal(css, '');
  assert.match(c.keyframes[0], /^@media \(min-width: 1px\)\{@keyframes glow\{to\{color:rgb\(\d+, \d+, \d+\)\}\}\}$/);
  assert.equal(rewriter.scoped('.a{color:red !important;}', '#publishedCanvas', c.keyframes),
    `@scope (:root) to (#publishedCanvas){.a{color:red !important;}}${c.keyframes[0]}`);
  assert.equal(rewriter.scoped('', '#publishedCanvas', c.keyframes), c.keyframes[0]);
});

test('splitDeclarations keeps semicolons inside parentheses and strings', () => {
  assert.deepEqual(rewriter.splitDeclarations('background: url("a;b.png") no-repeat; color: var(--x, rgb(0, 0, 0));'),
    [['background', 'url("a;b.png") no-repeat'], ['color', 'var(--x, rgb(0, 0, 0))']]);
});

test("a variable the page set to a non-colour (none) wins over the rule's fallback", () => {
  // SharePoint: --sp-cmd-barWrapper-border-bottom: none switches the command bar's bottom border off
  const css = rewriter.rewriteRules([
    styleRule('.isNGSP', { '--sp-cmd-barWrapper-border-bottom': 'none' }),
    styleRule('.commandbarWrapper', { 'border-bottom': 'var(--sp-cmd-barWrapper-border-bottom,1px solid var(--ms-palette-neutralQuaternaryAlt))' }),
  ], ctx());
  assert.ok(!css.includes('--capd-bd-sp-cmd-barWrapper-border-bottom:'), 'no typed variant for a non-colour value');
  assert.ok(css.includes('var(--capd-bd-sp-cmd-barWrapper-border-bottom, var(--sp-cmd-barWrapper-border-bottom, 1px solid var(--capd-bd-ms-palette-neutralQuaternaryAlt, var(--ms-palette-neutralQuaternaryAlt))))'), css);
});
