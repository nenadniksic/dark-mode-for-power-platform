import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('../src/content/00-namespace.js');
require('../src/content/10-color.js');
const auditMod = require('../src/content/70-audit.js');
const { audit, parseComputed, over, composite, textThreshold } = auditMod;

/* ---- a mock DOM just big enough for the audit walk ---------------------- */
const SVG_NS = 'http://www.w3.org/2000/svg';
const HTML_NS = 'http://www.w3.org/1999/xhtml';
const DEFAULT_CS = { display: 'block', visibility: 'visible', opacity: '1', backgroundColor: 'rgba(0, 0, 0, 0)', backgroundImage: 'none', color: 'rgb(0, 0, 0)', fontSize: '14px', fontWeight: '400', fill: 'rgb(0, 0, 0)', fillOpacity: '1', stroke: 'none', strokeOpacity: '1' };

function el(tag, opts = {}) {
  const ns = opts.ns || HTML_NS;
  const cs = { ...DEFAULT_CS, ...(opts.cs || {}) };
  // Browsers resolve -webkit-text-fill-color: currentcolor to the element's colour.
  if (!cs.webkitTextFillColor) cs.webkitTextFillColor = cs.color;
  const node = {
    nodeType: 1, tagName: ns === SVG_NS ? tag : tag.toUpperCase(), namespaceURI: ns,
    parentElement: null, parentNode: null, childNodes: [], children: [], shadowRoot: null,
    attrs: opts.attrs || {}, cs, rect: opts.rect || { width: 100, height: 20, right: 100, bottom: 20 },
    style: { getPropertyValue: (p) => (opts.vars || {})[p] || '' },
    className: (opts.attrs && opts.attrs.class) || '', value: opts.value || '',
    get ownerSVGElement() { let p = this.parentElement; while (p) { if (p.namespaceURI === SVG_NS && p.tagName === 'svg') return p; p = p.parentElement; } return null; },
    getAttribute(n) { return Object.prototype.hasOwnProperty.call(this.attrs, n) ? this.attrs[n] : null; },
    hasAttribute(n) { return Object.prototype.hasOwnProperty.call(this.attrs, n); },
    getBoundingClientRect() { return this.rect; },
    closest(sel) { const want = sel.split(',').map((s) => s.trim()); let p = this; while (p) { if (p.attrs && want.some((w) => (w.startsWith('#') && p.attrs.id === w.slice(1)) || (w.startsWith('.') && (p.className || '').split(' ').includes(w.slice(1))) || (w.startsWith('[') && p.hasAttribute(w.slice(1, -1))))) return p; p = p.parentElement; } return null; },
    querySelectorAll(sel) { const tags = sel === '*' ? null : new Set(sel.split(',').map((s) => s.trim())); const out = []; (function rec(n) { for (const c of n.children) { if (!tags || tags.has(c.tagName.toLowerCase())) out.push(c); rec(c); } })(this); return out; },
  };
  if (opts.text) node.childNodes.push({ nodeType: 3, nodeValue: opts.text });
  for (const c of opts.children || []) { c.parentElement = node; c.parentNode = node; node.children.push(c); node.childNodes.push(c); }
  return node;
}

function makeDoc(bodyChildren, htmlBg = 'rgb(31, 31, 31)') {
  const body = el('body', { children: bodyChildren, cs: { backgroundColor: 'rgba(0, 0, 0, 0)' }, rect: { width: 1000, height: 800, right: 1000, bottom: 800 } });
  const html = el('html', { children: [body], cs: { backgroundColor: htmlBg }, rect: { width: 1000, height: 800, right: 1000, bottom: 800 } });
  const byId = (id) => { let hit = null; (function rec(n) { for (const c of n.children) { if (!hit && c.attrs.id === id) hit = c; rec(c); } })(html); return hit; };
  return { documentElement: html, body, defaultView: {}, querySelectorAll: (s) => html.querySelectorAll(s), getElementById: byId };
}
const run = (doc, extra = {}) => audit({ root: doc, getComputedStyle: (e) => e.cs, exclude: '#publishedCanvas', ...extra });

test('parseComputed reads rgb()/rgba() and rejects everything else', () => {
  assert.deepEqual(parseComputed('rgb(1, 2, 3)'), { r: 1, g: 2, b: 3, a: 1 });
  assert.deepEqual(parseComputed('rgba(1, 2, 3, 0.5)'), { r: 1, g: 2, b: 3, a: 0.5 });
  assert.equal(parseComputed('color(srgb 1 0 0)'), null);
  assert.equal(parseComputed('none'), null);
});

test('compositing and thresholds', () => {
  assert.deepEqual(over({ r: 255, g: 255, b: 255, a: 0.5 }, { r: 0, g: 0, b: 0, a: 1 }), { r: 127.5, g: 127.5, b: 127.5, a: 1 });
  const c = composite([{ r: 255, g: 0, b: 0, a: 0.5 }, { r: 0, g: 0, b: 255, a: 1 }], { r: 0, g: 255, b: 0, a: 1 });
  assert.deepEqual(c, { r: 127.5, g: 0, b: 127.5, a: 1 });
  assert.equal(textThreshold(14, '400'), 4.5);
  assert.equal(textThreshold(24, '400'), 3);
  assert.equal(textThreshold(19, 'bold'), 3);
  assert.equal(textThreshold(19, '400'), 4.5);
  assert.equal(textThreshold(14, '400', 'AAA'), 7);
});

test('a fill-less SVG icon painted black on a dark button is reported, a currentColor one is not', () => {
  const blackIcon = el('svg', { ns: SVG_NS, attrs: { 'aria-label': 'Align left' }, cs: { fill: 'rgb(0, 0, 0)' }, children: [el('path', { ns: SVG_NS, cs: { fill: 'rgb(0, 0, 0)' }, rect: { width: 12, height: 10, right: 14, bottom: 13 } })], rect: { width: 16, height: 16, right: 16, bottom: 16 } });
  const lightIcon = el('svg', { ns: SVG_NS, cs: { fill: 'rgb(197, 197, 197)' }, children: [el('path', { ns: SVG_NS, cs: { fill: 'rgb(197, 197, 197)' }, rect: { width: 12, height: 10, right: 14, bottom: 13 } })], rect: { width: 16, height: 16, right: 16, bottom: 16 } });
  const button = el('button', { attrs: { class: 'ms-Button root-1' }, cs: { backgroundColor: 'rgb(41, 41, 41)' }, children: [blackIcon, lightIcon] });
  const r = run(makeDoc([button]));
  assert.equal(r.issues.length, 1);
  assert.equal(r.issues[0].kind, 'icon');
  assert.equal(r.issues[0].hint, '[aria-label="Align left"]');
  assert.equal(r.issues[0].ink, '#000000');
  assert.equal(r.issues[0].surface, '#292929');
  assert.ok(r.issues[0].ratio < 3 && r.issues[0].min === 3);
  assert.equal(r.checked, 2);
});

test('a shape that covers most of the drawing is a plate: the shapes on it are judged against it', () => {
  const plate = el('rect', { ns: SVG_NS, cs: { fill: 'rgb(41, 41, 41)' }, rect: { width: 24, height: 24, right: 24, bottom: 24 } });
  const bar = el('rect', { ns: SVG_NS, cs: { fill: 'rgb(120, 120, 255)' }, rect: { width: 4, height: 12, right: 10, bottom: 20 } });
  const chart = el('svg', { ns: SVG_NS, children: [plate, bar], rect: { width: 24, height: 24, right: 24, bottom: 24 } });
  const r = run(makeDoc([el('div', { cs: { backgroundColor: 'rgb(41, 41, 41)' }, children: [chart] })]));
  assert.equal(r.issues.length, 0);
  assert.equal(r.checked, 1, 'only the bar is judged');
  // a dark glyph on a white disc is fine, though both are dark-on-dark against the page
  const disc = el('circle', { ns: SVG_NS, cs: { fill: 'rgb(255, 255, 255)' }, rect: { width: 20, height: 20, right: 20, bottom: 20 } });
  const glyph = el('path', { ns: SVG_NS, cs: { fill: 'rgb(41, 41, 41)' }, rect: { width: 10, height: 8, right: 15, bottom: 14 } });
  const social = el('svg', { ns: SVG_NS, children: [disc, glyph], rect: { width: 20, height: 20, right: 20, bottom: 20 } });
  const r2 = run(makeDoc([el('div', { cs: { backgroundColor: 'rgb(30, 30, 30)' }, children: [social] })]));
  assert.equal(r2.issues.length, 0);
});

test('a label beside a long bar is judged against the page, and hidden hover markers are skipped', () => {
  // the bar covers 73% of the drawing, so it counts as a plate; the label sits above it, not on it
  const bar = el('rect', { ns: SVG_NS, cs: { fill: 'rgb(65, 141, 237)' }, rect: { left: 0, top: 10, width: 300, height: 30, right: 300, bottom: 40 } });
  const label = el('text', { ns: SVG_NS, cs: { fill: 'rgb(201, 201, 201)' }, rect: { left: 0, top: 0, width: 180, height: 10, right: 180, bottom: 10 } });
  const marker = el('circle', { ns: SVG_NS, cs: { fill: 'rgb(41, 41, 41)', opacity: '0' }, rect: { left: 290, top: 20, width: 16, height: 16, right: 306, bottom: 36 } });
  const svg = el('svg', { ns: SVG_NS, children: [bar, label, marker], rect: { left: 0, top: 0, width: 310, height: 40, right: 310, bottom: 40 } });
  const r = run(makeDoc([el('div', { cs: { backgroundColor: 'rgb(41, 41, 41)' }, children: [svg] })]));
  assert.deepEqual(r.issues, []);
  assert.equal(r.checked, 1, 'the label only: the bar is a plate, the marker is hidden');
});

test('chart gridlines and tick marks are not judged, but a short stroke in a small icon is', () => {
  const grid = el('line', { ns: SVG_NS, cs: { fill: 'none', stroke: 'rgb(73, 73, 73)' }, rect: { left: 0, top: 50, width: 400, height: 1, right: 400, bottom: 51 } });
  const tick = el('line', { ns: SVG_NS, cs: { fill: 'none', stroke: 'rgb(202, 202, 202)', opacity: '0.2' }, rect: { left: 40, top: 190, width: 0, height: 6, right: 40, bottom: 196 } });
  const chart = el('svg', { ns: SVG_NS, children: [grid, tick], rect: { left: 0, top: 0, width: 400, height: 200, right: 400, bottom: 200 } });
  const minus = el('line', { ns: SVG_NS, cs: { fill: 'none', stroke: 'rgb(50, 50, 50)' }, rect: { left: 2, top: 8, width: 12, height: 1, right: 14, bottom: 9 } });
  const icon = el('svg', { ns: SVG_NS, attrs: { 'aria-label': 'Zoom out' }, children: [minus], rect: { left: 0, top: 0, width: 16, height: 16, right: 16, bottom: 16 } });
  const r = run(makeDoc([el('div', { cs: { backgroundColor: 'rgb(41, 41, 41)' }, children: [chart, icon] })]));
  assert.deepEqual(r.issues.map((i) => i.hint), ['[aria-label="Zoom out"]']);
});

test('a <use> icon is judged by the symbol it draws: black sprite shapes are caught, adapted ones pass', () => {
  const sprite = (marked) => el('svg', { ns: SVG_NS, cs: { display: 'none' }, rect: { width: 0, height: 0, right: 0, bottom: 0 }, children: [
    el('symbol', { ns: SVG_NS, attrs: { id: 'icon-justify' }, children: [
      el('rect', { ns: SVG_NS, attrs: marked ? { fill: 'black', 'data-capd-inline': 'fill' } : { fill: 'black' }, vars: { '--capd-i-fill': 'rgb(230, 230, 230)' } }),
    ] }),
  ] });
  const icon = () => el('svg', { ns: SVG_NS, cs: { fill: 'rgb(255, 255, 255)' }, rect: { left: 0, top: 0, width: 16, height: 16, right: 16, bottom: 16 }, children: [
    el('use', { ns: SVG_NS, attrs: { 'xlink:href': '#icon-justify' }, cs: { fill: 'rgb(255, 255, 255)' }, rect: { left: 0, top: 0, width: 16, height: 16, right: 16, bottom: 16 } }),
  ] });
  const button = () => el('button', { attrs: { 'aria-label': 'Start' }, cs: { backgroundColor: 'rgb(33, 33, 33)' }, children: [icon()] });
  const bad = run(makeDoc([sprite(false), button()]));
  assert.equal(bad.issues.length, 1, 'fill="black" in the symbol is drawn black whatever the <svg> inherits');
  assert.equal(bad.issues[0].ink, '#000000');
  const good = run(makeDoc([sprite(true), button()]));
  assert.deepEqual(good.issues, []);
});

test('a two-tone outline sprite (dark fill under a light outline after theming) is judged by its outline', () => {
  const sprite = el('svg', { ns: SVG_NS, cs: { display: 'none' }, rect: { width: 0, height: 0, right: 0, bottom: 0 }, children: [
    el('symbol', { ns: SVG_NS, attrs: { id: 'icon-container' }, children: [
      el('path', { ns: SVG_NS, attrs: { fill: 'white', stroke: '#444444', 'data-capd-inline': 'fill stroke' }, vars: { '--capd-i-fill': 'rgb(41, 41, 41)', '--capd-i-stroke': 'rgb(191, 191, 191)' } }),
    ] }),
  ] });
  const icon = el('svg', { ns: SVG_NS, cs: { fill: 'rgb(255, 255, 255)' }, rect: { left: 0, top: 0, width: 16, height: 16, right: 16, bottom: 16 }, children: [
    el('use', { ns: SVG_NS, attrs: { href: '#icon-container' }, rect: { left: 0, top: 0, width: 16, height: 16, right: 16, bottom: 16 } }),
  ] });
  const r = run(makeDoc([sprite, el('div', { cs: { backgroundColor: 'rgb(36, 36, 36)' }, children: [icon] })]));
  assert.deepEqual(r.issues, []);
});

test('shapes in defs, masks and clip paths, and zero-size shapes, are not judged', () => {
  const hidden = el('path', { ns: SVG_NS, cs: { fill: 'rgb(30, 30, 30)' }, rect: { width: 10, height: 10, right: 10, bottom: 10 } });
  const defs = el('defs', { ns: SVG_NS, attrs: {}, children: [hidden] });
  defs.closest = (sel) => (sel.split(',').includes('defs') ? defs : null);
  hidden.closest = (sel) => (sel.split(',').includes('defs') ? defs : null);
  const empty = el('path', { ns: SVG_NS, cs: { fill: 'rgb(30, 30, 30)' }, rect: { width: 0, height: 0, right: 0, bottom: 0 } });
  const svg = el('svg', { ns: SVG_NS, children: [defs, empty], rect: { width: 16, height: 16, right: 16, bottom: 16 } });
  const r = run(makeDoc([el('div', { cs: { backgroundColor: 'rgb(30, 30, 30)' }, children: [svg] })]));
  assert.equal(r.issues.length, 0);
  assert.equal(r.checked, 0);
});

test('text is judged against the first opaque ancestor background, with alpha and opacity applied', () => {
  const dim = el('span', { text: 'Disabled', cs: { color: 'rgb(255, 255, 255)', opacity: '0.2' } });
  const fine = el('span', { text: 'Label', cs: { color: 'rgb(230, 230, 230)' } });
  const tinted = el('span', { text: 'Tinted', cs: { color: 'rgba(255, 255, 255, 0.9)' } });
  const large = el('h1', { text: 'Heading', cs: { color: 'rgb(140, 140, 140)', fontSize: '28px' } });
  const card = el('div', { attrs: { id: 'card' }, cs: { backgroundColor: 'rgba(255, 255, 255, 0.04)' }, children: [dim, fine, tinted, large] });
  const r = run(makeDoc([card]));
  assert.deepEqual(r.issues.map((i) => i.text), ['Disabled']);
  assert.equal(r.issues[0].min, 4.5);
  assert.equal(r.issues[0].surface, '#282828');
  assert.equal(r.checked, 4);
});

test('the canvas, hidden elements, transparent text, images and our own styles are skipped; input values are checked', () => {
  const canvasText = el('span', { text: 'App text', cs: { color: 'rgb(0, 0, 0)' } });
  const canvas = el('div', { attrs: { id: 'publishedCanvas' }, cs: { backgroundColor: 'rgb(255, 255, 255)' }, children: [canvasText] });
  const hidden = el('span', { text: 'Hidden', cs: { color: 'rgb(0, 0, 0)', display: 'none' } });
  const tiny = el('span', { text: 'sr-only', cs: { color: 'rgb(0, 0, 0)' }, rect: { width: 1, height: 1, right: 1, bottom: 1 } });
  const clear = el('span', { text: 'ghost', cs: { color: 'rgba(0, 0, 0, 0)' } });
  const ours = el('style', { attrs: { 'data-capd-style': 'static' } });
  const img = el('img');
  const input = el('input', { attrs: { type: 'text' }, value: 'typed', cs: { color: 'rgb(40, 40, 40)', backgroundColor: 'rgb(31, 31, 31)' } });
  const r = run(makeDoc([canvas, hidden, tiny, clear, ours, img, input]));
  assert.deepEqual(r.issues.map((i) => [i.kind, i.text]), [['input', 'typed']]);
  assert.equal(r.unmeasured.images, 1);
});

test('icon-font glyphs are judged by the 3:1 graphics bar, not the text bar', () => {
  const close = el('i', { attrs: { 'data-icon-name': 'Cancel' }, text: '\uE711', cs: { color: 'rgb(93, 149, 234)' } });
  const word = el('span', { text: 'Close', cs: { color: 'rgb(93, 149, 234)' } });
  const r = run(makeDoc([el('div', { cs: { backgroundColor: 'rgb(51, 51, 51)' }, children: [close, word] })]));
  assert.deepEqual(r.issues.map((i) => [i.kind, i.text]), [['text', 'Close']], 'the glyph passes at 4.2:1, the word does not');
});

test('elements hidden with opacity until hover are not reported', () => {
  const ring = el('i', { attrs: { 'data-icon-name': 'CircleRing' }, text: '\ue001', cs: { color: 'rgb(177, 177, 177)' } });
  const check = el('div', { attrs: { class: 'ms-Check' }, cs: { opacity: '0' }, children: [ring] });
  const r = run(makeDoc([el('div', { cs: { backgroundColor: 'rgb(41, 41, 41)' }, children: [check] })]));
  assert.equal(r.issues.length, 0);
  assert.equal(r.checked, 0);
});

test('issues are grouped by element shape and colours, counted, and capped by limit', () => {
  const rows = [];
  for (let i = 0; i < 5; i++) rows.push(el('div', { attrs: { class: 'row' }, text: 'Row ' + i, cs: { color: 'rgb(60, 60, 60)' } }));
  rows.push(el('div', { attrs: { class: 'other' }, text: 'Other', cs: { color: 'rgb(70, 70, 70)' } }));
  const r = run(makeDoc(rows), { limit: 1 });
  assert.equal(r.issueGroups, 2);
  assert.equal(r.issues.length, 1);
  assert.equal(r.issues[0].count, 5);
  assert.equal(r.issues[0].hint, '.row');
});

test('a background image on the way up marks the surface as uncertain', () => {
  const t = el('span', { text: 'On art', cs: { color: 'rgb(50, 50, 50)' } });
  const hero = el('div', { cs: { backgroundImage: 'url("x.png")' }, children: [t] });
  const r = run(makeDoc([hero]));
  assert.equal(r.issues.length, 1);
  assert.equal(r.issues[0].uncertain, true);
  assert.equal(r.unmeasured.backgroundImages, 1);
});

test('a gradient background is measured on each of its stops, not treated as an unknown image', () => {
  const ok = el('span', { text: 'Connections', cs: { color: 'rgb(255, 255, 255)' } });
  const page = el('div', { cs: { backgroundImage: 'linear-gradient(rgb(41, 41, 41), rgb(0, 43, 106))' }, children: [ok] });
  const r = run(makeDoc([page]));
  assert.deepEqual(r.issues, []);
  assert.deepEqual(r.textOverImages, []);
  const dim = el('span', { text: 'Faint', cs: { color: 'rgb(90, 110, 160)' } });
  const page2 = el('div', { cs: { backgroundImage: 'linear-gradient(rgb(41, 41, 41), rgb(0, 43, 106))' }, children: [dim] });
  const r2 = run(makeDoc([page2]));
  assert.equal(r2.issues.length, 1);
  assert.equal(r2.issues[0].surface, '#002b6a', 'reported against the worst stop');
});

test('legible-looking text over a background image is listed for a person to check', () => {
  const t = el('h1', { text: 'Hello, Nenad', attrs: { class: 'greeting' }, cs: { color: 'rgb(230, 230, 230)' } });
  const hero = el('div', { cs: { backgroundImage: 'url("https://cdn.example/static/media/heroBannerExp.ec6d7f02.svg?v=2")' }, children: [t] });
  const r = run(makeDoc([hero]));
  assert.equal(r.issues.length, 0, 'measured against the page surface it passes');
  assert.deepEqual(r.textOverImages, [{ tag: 'h1', hint: '.greeting', text: 'Hello, Nenad', image: 'heroBannerExp.ec6d7f02.svg', count: 1 }]);
});
