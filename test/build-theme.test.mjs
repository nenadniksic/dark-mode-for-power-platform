import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { minifyThemeCSS, buildThemeParts } from '../tools/build.mjs';

const require = createRequire(import.meta.url);
require('../src/content/generated/theme-css.js');
const { themeCSS } = globalThis.CAPD;

test('a space before ":" that is a descendant combinator survives minification', () => {
  assert.equal(minifyThemeCSS('a :hover { color: red; }'), 'a :hover{color:red;}');
  assert.equal(minifyThemeCSS('html[data-capd="dark"] ::-webkit-scrollbar { width: 12px; }'),
    ':scope[data-capd="dark"] ::-webkit-scrollbar{width:12px;}');
  assert.equal(minifyThemeCSS('.a .b:is(.c, .d) :focus-visible { outline: 0 }'), '.a .b:is(.c,.d) :focus-visible{outline:0}');
  assert.equal(minifyThemeCSS('.a:not(.b :hover) { x: y }'), '.a:not(.b :hover){x:y}');
});

test('spaces that carry no meaning around ":" still go', () => {
  assert.equal(minifyThemeCSS('a { color : red ; background : url(data:image/png;base64,AA) }'),
    'a{color:red;background:url(data:image/png;base64,AA)}');
  assert.equal(minifyThemeCSS('a, :hover { x: y }'), 'a,:hover{x:y}');
  assert.equal(minifyThemeCSS('a > :first-child { x: y }'), 'a>:first-child{x:y}');
  assert.equal(minifyThemeCSS(':not( :hover) { x: y }'), ':not(:hover){x:y}');
  assert.equal(minifyThemeCSS('a { x: y } :root { x: y }'), 'a{x:y}:root{x:y}');
  assert.equal(minifyThemeCSS('/* c */ a { color: red !important; }\n'), 'a{color:red !important;}');
});

test('string literals are copied as written', () => {
  assert.equal(minifyThemeCSS('[aria-label="Close : dialog, now"] { content: "a ; b" }'),
    '[aria-label="Close : dialog, now"]{content:"a ; b"}');
});

test('the generated studio part keeps the scrollbar rules on every element, not just the root', () => {
  for (const css of [buildThemeParts().studio, themeCSS.studio]) {
    assert.ok(css.includes(':scope[data-capd="dark"] ::-webkit-scrollbar{'), 'unboosted ::-webkit-scrollbar rule');
    assert.ok(css.includes(':scope[data-capd="dark"] *:not(#capd-i):not(#capd-i):not(#capd-i)::-webkit-scrollbar-thumb{'),
      'boosted ::-webkit-scrollbar-thumb rule');
    assert.ok(!css.includes(':scope[data-capd="dark"]::-webkit-scrollbar'), 'no rule collapsed onto the root');
  }
});

test('the generated theme bundle is up to date with theme/*.css', () => {
  assert.deepEqual(themeCSS, buildThemeParts());
});
