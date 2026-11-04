import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/* ---- just enough DOM for StyleManager.ensureOrder ----------------------- */
globalThis.Document = class Document {};
class FakeEl {
  constructor(tag) { this.nodeType = 1; this.tagName = tag; this.attrs = {}; this.textContent = ''; this.parent = null; }
  appendChild(text) { this.textContent += text.data; return text; } // text nodes only
  setAttribute(n, v) { this.attrs[n] = String(v); }
  getAttribute(n) { return Object.prototype.hasOwnProperty.call(this.attrs, n) ? this.attrs[n] : null; }
  remove() { if (this.parent) this.parent.removeChild(this); }
}
class FakeRoot {
  constructor() { this.childNodes = []; this.styleSheets = []; this.adoptedStyleSheets = []; this.appends = 0; this.ownerDocument = this; }
  createElement(tag) { return new FakeEl(tag.toUpperCase()); }
  createTextNode(data) { return { nodeType: 3, data }; }
  appendChild(el) { this.removeChild(el); this.childNodes.push(el); el.parent = this; this.appends++; return el; }
  removeChild(el) { const i = this.childNodes.indexOf(el); if (i !== -1) this.childNodes.splice(i, 1); }
}

require('../src/content/00-namespace.js');
require('../src/content/10-color.js');
require('../src/content/20-css-rewriter.js');
require('../src/content/30-style-manager.js');
const CAPD = globalThis.CAPD;

const options = { opts: {}, isExcludedVar: () => false, limitSelector: null };

test('our style elements are moved back to the end when a page node follows them', () => {
  const root = new FakeRoot();
  const sm = new CAPD.StyleManager(root, options);
  sm.setStaticCSS('.a{}');
  sm.setTunedCSS('.b{}');
  root.appendChild(new FakeEl('DIV'));          // the page adds something after us
  sm.ensureOrder();
  const tags = root.childNodes.map((n) => n.getAttribute(CAPD.STYLE_ATTR) || n.tagName);
  assert.deepEqual(tags, ['DIV', 'static', 'tuned']);
});

test('two engines on one page settle instead of re-appending forever', () => {
  const root = new FakeRoot();
  const a = new CAPD.StyleManager(root, options);
  const b = new CAPD.StyleManager(root, options);
  a.setStaticCSS('.a{}'); a.setTunedCSS('.a2{}');
  b.setStaticCSS('.b{}'); b.setTunedCSS('.b2{}');
  // Each engine reacts to the other's appends; give them a few rounds.
  for (let round = 0; round < 3; round++) { a.ensureOrder(); b.ensureOrder(); }
  const before = root.appends;
  for (let round = 0; round < 5; round++) { a.ensureOrder(); b.ensureOrder(); }
  assert.equal(root.appends, before, 'no further appends once both are in the tail');
  assert.ok(a.inOrder([a.staticEl, a.tunedEl]) && b.inOrder([b.staticEl, b.tunedEl]));
});

test('our own elements out of order are still repaired', () => {
  const root = new FakeRoot();
  const sm = new CAPD.StyleManager(root, options);
  sm.setStaticCSS('.a{}');
  sm.setTunedCSS('.b{}');
  root.appendChild(sm.staticEl);                 // static moved after tuned
  sm.ensureOrder();
  assert.deepEqual(root.childNodes.map((n) => n.getAttribute(CAPD.STYLE_ATTR)), ['static', 'tuned']);
});

test('the root FluentProvider sheet reports its light brand colour', () => {
  const root = new FakeRoot();
  const seen = [];
  const sm = new CAPD.StyleManager(root, { ...options, onBrand: (v, id) => seen.push([v, id]) });
  const rule = { type: 1, selectorText: '.fui-FluentProvider1', style: { length: 0, getPropertyValue: (p) => (p === '--colorBrandBackground' ? ' #0066ff' : '') } };
  const sheet = { ownerNode: new FakeEl('STYLE'), cssRules: [rule], href: null, disabled: false };
  sheet.ownerNode.id = 'fui-FluentProvider1';
  sm.process(sheet);
  assert.deepEqual(seen, [['#0066ff', 'fui-FluentProvider1']]);
  const other = { ownerNode: new FakeEl('STYLE'), cssRules: [rule], href: null, disabled: false };
  sm.process(other);
  assert.equal(seen.length, 1, 'only FluentProvider sheets are read');
});

/* A style rule whose cssText follows its declarations, like the browser's. */
function rule(selector, decls) {
  const keys = Object.keys(decls);
  return {
    type: 1, selectorText: selector, cssRules: null,
    cssText: `${selector} { ${keys.map((k) => `${k}: ${decls[k]};`).join(' ')} }`,
    style: { length: keys.length, ...Object.fromEntries(keys.map((k, i) => [i, k])), getPropertyValue: (p) => decls[p] || '', getPropertyPriority: () => '' },
  };
}
const pageSheet = (rules) => ({ ownerNode: new FakeEl('STYLE'), cssRules: rules, href: null, disabled: false, media: { mediaText: '' } });

test('a new page sheet is rewritten at once, not after a timer, so it never paints light', () => {
  const root = new FakeRoot();
  const sm = new CAPD.StyleManager(root, options);
  const sheet = pageSheet([rule('.a', { color: 'rgb(50, 49, 48)' })]);
  root.styleSheets.push(sheet);
  sm.scan();
  const el = sm.overrides.get(sheet).el;
  assert.match(el.textContent, /^\.a\{color:rgb\(/, 'rewritten synchronously');
  sm.dispose();
});

test('a sheet that grows at its end gets only its new rules rewritten and appended', () => {
  const root = new FakeRoot();
  const sm = new CAPD.StyleManager(root, options);
  const rules = [rule('.a', { color: 'rgb(50, 49, 48)' }), rule('.b', { 'background-color': 'rgb(255, 255, 255)' })];
  const sheet = pageSheet(rules);
  sm.process(sheet);
  const el = sm.overrides.get(sheet).el;
  const before = el.textContent;
  rules.push(rule('.c', { color: 'rgb(0, 0, 0)' }));
  sm.process(sheet);
  assert.equal(sm.stats.appends, 1);
  assert.ok(el.textContent.startsWith(before) && /\.c\{color:/.test(el.textContent.slice(before.length)), 'old text kept, new rule appended');
  assert.equal((el.textContent.match(/\.a\{/g) || []).length, 1, 'old rules not repeated');

  // a change anywhere but the end (here: a rule inserted before the last one) is a full rewrite
  rules.splice(1, 0, rule('.x', { color: 'rgb(10, 10, 10)' }));
  rules.push(rule('.d', { color: 'rgb(20, 20, 20)' }));
  sm.process(sheet);
  assert.equal(sm.stats.appends, 1, 'not taken as growth');
  assert.equal(el.textContent, CAPD.rewriter.rewriteRules(rules, sm.ctx(), 0), 'whole sheet rewritten once');

  // new settings rewrite everything at once, never append to output made for the old ones
  sm.rebuild({ opts: { surface: 'black' } });
  assert.equal(sm.stats.appends, 1);
  assert.equal(el.textContent, CAPD.rewriter.rewriteRules(rules, sm.ctx(), 0));
  sm.dispose();
});
