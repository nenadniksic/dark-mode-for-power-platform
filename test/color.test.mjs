import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const color = require('../src/content/10-color.js');

test('parses hex, rgb, hsl, hwb and named colours', () => {
  assert.deepEqual(color.parse('#fff'), { r: 255, g: 255, b: 255, a: 1 });
  assert.deepEqual(color.parse('#80808080'), { r: 128, g: 128, b: 128, a: 128 / 255 });
  assert.deepEqual(color.parse('rgb(116, 39, 116)'), { r: 116, g: 39, b: 116, a: 1 });
  assert.deepEqual(color.parse('rgba(0, 0, 0, 0.4)'), { r: 0, g: 0, b: 0, a: 0.4 });
  assert.deepEqual(color.parse('rgb(10% 20% 30% / 50%)'), { r: 26, g: 51, b: 77, a: 0.5 });
  assert.deepEqual(color.parse('hsl(0, 100%, 50%)'), { r: 255, g: 0, b: 0, a: 1 });
  assert.deepEqual(color.parse('hsl(120deg 100% 25% / 0.5)'), { r: 0, g: 128, b: 0, a: 0.5 });
  assert.deepEqual(color.parse('hwb(0 0% 0%)'), { r: 255, g: 0, b: 0, a: 1 });
  assert.deepEqual(color.parse('RebeccaPurple'), { r: 102, g: 51, b: 153, a: 1 });
  assert.equal(color.parse('transparent'), null);
  assert.equal(color.parse('currentColor'), null);
  assert.equal(color.parse('inherit'), null);
  assert.equal(color.parse('solid'), null);
  assert.equal(color.parse('#12345'), null);
  assert.equal(color.parse('rgb(1,2)'), null);
});

test('hsl round trip is stable', () => {
  for (const hex of ['#742774', '#933493', '#323130', '#edebe9', '#0078d4', '#ffb900']) {
    const c = color.parse(hex);
    const h = color.toHsl(c);
    const back = color.fromHsl(h.h, h.s, h.l);
    assert.ok(Math.abs(back.r - c.r) <= 1 && Math.abs(back.g - c.g) <= 1 && Math.abs(back.b - c.b) <= 1, hex);
  }
});

test('contrast ratio matches WCAG reference values', () => {
  const white = color.parse('#fff'), black = color.parse('#000');
  assert.equal(Math.round(color.contrast(white, black)), 21);
  assert.ok(Math.abs(color.contrast(color.parse('#777777'), white) - 4.48) < 0.02);
});

test('backgrounds: light surfaces become dark, order preserved, dark surfaces kept', () => {
  const bg = (s) => color.toHsl(color.modify('bg', color.parse(s)));
  const white = bg('#ffffff'), paper = bg('#fafafa'), grey = bg('#e0e0e0'), mid = bg('#808080');
  assert.ok(white.l > 0.14 && white.l < 0.18, 'white maps to the base surface');
  assert.ok(paper.l < white.l, 'off-white is darker than white');
  assert.ok(grey.l < paper.l, 'light grey is darker still');
  assert.ok(mid.l > 0.3 && mid.l < 0.5, 'mid grey stays mid');
  const brand = color.modify('bg', color.parse('#742774'));
  assert.deepEqual(brand, color.parse('#742774'), 'dark brand surface untouched');
  const overlay = color.modify('bg', color.parse('rgba(0,0,0,0.4)'));
  assert.equal(overlay.a, 0.4);
  const invisible = color.parse('rgba(0,0,0,0)');
  assert.equal(color.modify('bg', invisible), invisible);
});

test('text: dark text becomes light and meets AA on the base surface', () => {
  const surface = color.modify('bg', color.parse('#ffffff'));
  for (const hex of ['#000000', '#242424', '#323130', '#424242', '#605e5c', '#616161', '#742774', '#0000ff', '#a4262c']) {
    const fg = color.modify('fg', color.parse(hex));
    const ratio = color.contrast(fg, surface);
    assert.ok(ratio >= 4.5, `${hex} -> ${color.toHex(fg)} contrast ${ratio.toFixed(2)}`);
  }
  // disabled-looking light greys stay dimmer than primary text
  const primary = color.toHsl(color.modify('fg', color.parse('#323130'))).l;
  const disabled = color.toHsl(color.modify('fg', color.parse('#a19f9d'))).l;
  assert.ok(disabled < primary - 0.1);
  // white text on brand stays white
  assert.deepEqual(color.modify('fg', color.parse('#ffffff')), color.parse('#ffffff'));
});

test('borders: light borders become subtle dark borders, dark borders become light', () => {
  const light = color.toHsl(color.modify('bd', color.parse('#edebe9')));
  const dark = color.toHsl(color.modify('bd', color.parse('#323130')));
  assert.ok(light.l > 0.18 && light.l < 0.32);
  assert.ok(dark.l > 0.45 && dark.l < 0.65);
});

test('high contrast and surface settings move the ramps', () => {
  const std = color.toHsl(color.modify('fg', color.parse('#323130'))).l;
  const high = color.toHsl(color.modify('fg', color.parse('#323130'), { contrast: 'high' })).l;
  assert.ok(high > std);
  const black = color.toHsl(color.modify('bg', color.parse('#fff'), { surface: 'black' })).l;
  const dim = color.toHsl(color.modify('bg', color.parse('#fff'), { surface: 'dim' })).l;
  assert.ok(black < dim);
});

test('rewriteValue handles gradients, shadows, keywords, strings and urls', () => {
  const g = color.rewriteValue('bg', 'linear-gradient(to right, #ffffff 0%, rgb(243, 242, 241) 100%)');
  assert.ok(g && !g.includes('#ffffff') && g.startsWith('linear-gradient(to right, rgb('));
  assert.equal(color.rewriteValue('bg', 'url(white.png) no-repeat'), null);
  assert.equal(color.rewriteValue('fg', 'currentColor'), null);
  assert.equal(color.rewriteValue('bg', 'transparent'), null);
  assert.equal(color.rewriteValue('bg', 'var(--x)'), null);
  const sh = color.rewriteValue('sh', '0 0 2px rgba(0,0,0,0.2), 0 0 0 1px #dddddd');
  assert.ok(sh && sh.includes('rgba(0,0,0,0.2)') && !sh.includes('#dddddd'), sh);
  const named = color.rewriteValue('bd', '1px solid white');
  assert.ok(named && named.startsWith('1px solid rgb('));
  assert.equal(color.rewriteValue('bg', '"white"'), null);
  // words that are not colours survive untouched
  assert.equal(color.rewriteValue('bg', 'inset solid to right'), null);
});

test('var() fallbacks are passed to the var rewriter', () => {
  const out = color.rewriteValue('fg', 'var(--a, #000)', undefined, (expr) => expr.replace('--a', '--capd-fg-a'));
  assert.equal(out, 'var(--capd-fg-a, #000)');
});

test('Neon tint changes hue and saturation of neutrals only, never their lightness', () => {
  for (const hex of ['#ffffff', '#f3f2f1', '#323130', '#605e5c', '#c8c6c4']) {
    for (const kind of ['bg', 'fg', 'bd']) {
      const classic = color.toHsl(color.modify(kind, color.parse(hex)));
      const neon = color.toHsl(color.modify(kind, color.parse(hex), { look: 'neon' }));
      assert.ok(Math.abs(classic.l - neon.l) < 0.03, `${kind} ${hex}: ${classic.l} vs ${neon.l}`);
    }
  }
  const surface = color.modify('bg', color.parse('#ffffff'), { look: 'neon' });
  for (const hex of ['#000000', '#323130', '#605e5c']) {
    const fg = color.modify('fg', color.parse(hex), { look: 'neon' });
    assert.ok(color.contrast(fg, surface) >= 4.5, `${hex} text on the neon surface`);
  }
});

test('Neon: dim greys (disabled, placeholder) stay nearly grey, so they never look like the accent', () => {
  const chroma = (c) => Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
  const neon = (hex) => color.modify('fg', color.parse(hex), { look: 'neon' });
  // Fluent v8 paints a disabled command-bar icon in these greys (Studio's Save)
  for (const hex of ['#a19f9d', '#c8c6c4']) assert.ok(chroma(neon(hex)) <= 20, `${hex} -> ${color.format(neon(hex))}`);
  // ordinary text keeps the pink-lavender tint
  for (const hex of ['#323130', '#605e5c']) assert.ok(chroma(neon(hex)) >= 30, `${hex} -> ${color.format(neon(hex))}`);
  // Classic is untouched: still a pure grey
  assert.equal(chroma(color.modify('fg', color.parse('#a19f9d'))), 0);
});
