#!/usr/bin/env node
/*
 * Generates src/content/generated/fluent-tokens.js from the Fluent UI v9
 * light-theme tokens Studio ships (tools/data/fluent-light-tokens.json).
 *
 * Output: a compact spec per colour token that the content script resolves
 * at run time, so the neutral greys can shift with the user's "surface"
 * preference while brand and status colours stay fixed.
 *
 *   g<n>        grey ramp index (0-100, Fluent's grey[n])
 *   ga<n>:<a>   grey ramp index with alpha
 *   wa<a>       white with alpha        ba<a>  black with alpha
 *   b<n>        brand ramp index (10-160)
 *   #rrggbb / rgba(...) / white / black / transparent   literal
 *
 * The mapping follows @fluentui/tokens createDarkTheme().  Status and
 * persona palettes are derived from the light values by swapping tints
 * and shades, which reproduces Fluent's own dark palette closely.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const color = require('../src/content/10-color.js');
const here = path.dirname(fileURLToPath(import.meta.url));
const light = JSON.parse(fs.readFileSync(path.join(here, 'data', 'fluent-light-tokens.json'), 'utf8'));

/* ---- brand ramp (Power Apps purple) recovered from the light tokens ---- */
const brand = {
  10: '#3b063b', 20: '#4a094a',
  30: light['--colorBrandForeground2Pressed'],        // #580D58
  40: light['--colorBrandForegroundLinkPressed'],      // #641264
  50: light['--colorBrandForegroundOnLightPressed'],   // #6D186D
  60: light['--colorBrandBackgroundSelected'],         // #792079
  70: light['--colorBrandBackgroundHover'],            // #852985
  80: light['--colorBrandBackground'],                 // #933493
  90: '#a64aa6',
  100: light['--colorBrandForegroundInverted'],        // #BC5FBC
  110: light['--colorBrandForegroundInvertedHover'],   // #CB79CB
  120: light['--colorBrandStroke2Hover'],              // #D991D9
  130: light['--colorBrandBackground2Pressed'],        // #E4AAE4
  140: light['--colorBrandStroke2'],                   // #E9BEE9
  150: light['--colorBrandBackground2Hover'],          // #F1D4F1
  160: light['--colorBrandBackground2'],               // #F7E8F7
};
for (const [k, v] of Object.entries(brand)) if (!v) throw new Error('brand ramp gap at ' + k);

/* ---- neutral / brand mapping (Fluent dark theme) ---- */
const dark = {
  colorNeutralForeground1: 'white', colorNeutralForeground1Hover: 'white', colorNeutralForeground1Pressed: 'white', colorNeutralForeground1Selected: 'white',
  colorNeutralForeground2: 'g84', colorNeutralForeground2Hover: 'white', colorNeutralForeground2Pressed: 'white', colorNeutralForeground2Selected: 'white',
  colorNeutralForeground2BrandHover: 'b100', colorNeutralForeground2BrandPressed: 'b90', colorNeutralForeground2BrandSelected: 'b100',
  colorNeutralForeground3: 'g68', colorNeutralForeground3Hover: 'g84', colorNeutralForeground3Pressed: 'g84', colorNeutralForeground3Selected: 'g84',
  colorNeutralForeground3BrandHover: 'b100', colorNeutralForeground3BrandPressed: 'b90', colorNeutralForeground3BrandSelected: 'b100',
  colorNeutralForeground4: 'g60', colorNeutralForegroundDisabled: 'g36', colorNeutralForegroundInvertedDisabled: 'wa0.4',
  colorBrandForegroundLink: 'b100', colorBrandForegroundLinkHover: 'b110', colorBrandForegroundLinkPressed: 'b90', colorBrandForegroundLinkSelected: 'b100',
  colorNeutralForeground2Link: 'g84', colorNeutralForeground2LinkHover: 'white', colorNeutralForeground2LinkPressed: 'white', colorNeutralForeground2LinkSelected: 'white',
  colorCompoundBrandForeground1: 'b100', colorCompoundBrandForeground1Hover: 'b110', colorCompoundBrandForeground1Pressed: 'b90',
  colorBrandForeground1: 'b100', colorBrandForeground2: 'b110', colorBrandForeground2Hover: 'b130', colorBrandForeground2Pressed: 'b160',
  colorNeutralForeground1Static: 'g14', colorNeutralForegroundStaticInverted: 'white',
  colorNeutralForegroundInverted: 'g14', colorNeutralForegroundInvertedHover: 'g14', colorNeutralForegroundInvertedPressed: 'g14', colorNeutralForegroundInvertedSelected: 'g14',
  colorNeutralForegroundInverted2: 'g14', colorNeutralForegroundOnBrand: 'white',
  colorNeutralForegroundInvertedLink: 'white', colorNeutralForegroundInvertedLinkHover: 'white', colorNeutralForegroundInvertedLinkPressed: 'white', colorNeutralForegroundInvertedLinkSelected: 'white',
  colorBrandForegroundInverted: 'b80', colorBrandForegroundInvertedHover: 'b70', colorBrandForegroundInvertedPressed: 'b60',
  colorBrandForegroundOnLight: 'b80', colorBrandForegroundOnLightHover: 'b70', colorBrandForegroundOnLightPressed: 'b50', colorBrandForegroundOnLightSelected: 'b60',
  colorNeutralBackground1: 'g16', colorNeutralBackground1Hover: 'g20', colorNeutralBackground1Pressed: 'g12', colorNeutralBackground1Selected: 'g18',
  colorNeutralBackground2: 'g14', colorNeutralBackground2Hover: 'g18', colorNeutralBackground2Pressed: 'g10', colorNeutralBackground2Selected: 'g16',
  colorNeutralBackground3: 'g12', colorNeutralBackground3Hover: 'g16', colorNeutralBackground3Pressed: 'g8', colorNeutralBackground3Selected: 'g14',
  colorNeutralBackground4: 'g8', colorNeutralBackground4Hover: 'g16', colorNeutralBackground4Pressed: 'g4', colorNeutralBackground4Selected: 'g14',
  colorNeutralBackground5: 'g4', colorNeutralBackground5Hover: 'g12', colorNeutralBackground5Pressed: 'black', colorNeutralBackground5Selected: 'g10',
  colorNeutralBackground6: 'g20', colorNeutralBackgroundInverted: 'white', colorNeutralBackgroundStatic: 'g24',
  colorNeutralBackgroundAlpha: 'ga10:0.5', colorNeutralBackgroundAlpha2: 'ga12:0.7',
  colorSubtleBackground: 'transparent', colorSubtleBackgroundHover: 'g22', colorSubtleBackgroundPressed: 'g18', colorSubtleBackgroundSelected: 'g20',
  colorSubtleBackgroundLightAlphaHover: 'ga14:0.8', colorSubtleBackgroundLightAlphaPressed: 'ga14:0.5', colorSubtleBackgroundLightAlphaSelected: 'transparent',
  colorSubtleBackgroundInverted: 'transparent', colorSubtleBackgroundInvertedHover: 'ba0.1', colorSubtleBackgroundInvertedPressed: 'ba0.3', colorSubtleBackgroundInvertedSelected: 'ba0.2',
  colorTransparentBackground: 'transparent', colorTransparentBackgroundHover: 'transparent', colorTransparentBackgroundPressed: 'transparent', colorTransparentBackgroundSelected: 'transparent',
  colorNeutralBackgroundDisabled: 'g8', colorNeutralBackgroundInvertedDisabled: 'wa0.1',
  colorNeutralStencil1: 'g34', colorNeutralStencil2: 'g20', colorNeutralStencil1Alpha: 'wa0.1', colorNeutralStencil2Alpha: 'wa0.05',
  colorBackgroundOverlay: 'ba0.5', colorScrollbarOverlay: 'wa0.6',
  colorBrandBackground: 'b70', colorBrandBackgroundHover: 'b80', colorBrandBackgroundPressed: 'b40', colorBrandBackgroundSelected: 'b60',
  colorCompoundBrandBackground: 'b100', colorCompoundBrandBackgroundHover: 'b110', colorCompoundBrandBackgroundPressed: 'b90',
  colorBrandBackgroundStatic: 'b80', colorBrandBackground2: 'b20', colorBrandBackground2Hover: 'b40', colorBrandBackground2Pressed: 'b10',
  colorBrandBackground3Static: 'b60', colorBrandBackground4Static: 'b40',
  // Fluent keeps the inverted brand surfaces light (b160/b140/b150) in its
  // dark theme too, for dark "inverted" text.  Power Automate paints its
  // filter pills with colorBrandBackgroundInvertedSelected and writes on them
  // with colorNeutralForeground1, which is white here, so the pill came out
  // white on pink (1.4:1).  Mid-brand surfaces keep white text legible on
  // them, and nothing in Studio or Power Automate pairs them with the dark
  // inverted foregrounds (checked with CAPD.audit()).
  colorBrandBackgroundInverted: 'white', colorBrandBackgroundInvertedHover: 'b70', colorBrandBackgroundInvertedPressed: 'b50', colorBrandBackgroundInvertedSelected: 'b60',
  colorNeutralCardBackground: 'g20', colorNeutralCardBackgroundHover: 'g24', colorNeutralCardBackgroundPressed: 'g18', colorNeutralCardBackgroundSelected: 'g22', colorNeutralCardBackgroundDisabled: 'g8',
  colorNeutralStrokeAccessible: 'g68', colorNeutralStrokeAccessibleHover: 'g74', colorNeutralStrokeAccessiblePressed: 'g70', colorNeutralStrokeAccessibleSelected: 'b100',
  colorNeutralStroke1: 'g40', colorNeutralStroke1Hover: 'g46', colorNeutralStroke1Pressed: 'g42', colorNeutralStroke1Selected: 'g44',
  colorNeutralStroke2: 'g32', colorNeutralStroke3: 'g24', colorNeutralStrokeSubtle: 'g4',
  colorNeutralStrokeOnBrand: 'g16', colorNeutralStrokeOnBrand2: 'white', colorNeutralStrokeOnBrand2Hover: 'white', colorNeutralStrokeOnBrand2Pressed: 'white', colorNeutralStrokeOnBrand2Selected: 'white',
  colorBrandStroke1: 'b100', colorBrandStroke2: 'b50', colorBrandStroke2Hover: 'b50', colorBrandStroke2Pressed: 'b30', colorBrandStroke2Contrast: 'b50',
  colorCompoundBrandStroke: 'b100', colorCompoundBrandStrokeHover: 'b110', colorCompoundBrandStrokePressed: 'b90',
  colorNeutralStrokeDisabled: 'g26', colorNeutralStrokeInvertedDisabled: 'wa0.4',
  colorTransparentStroke: 'transparent', colorTransparentStrokeInteractive: 'transparent', colorTransparentStrokeDisabled: 'transparent',
  colorNeutralStrokeAlpha: 'wa0.1', colorNeutralStrokeAlpha2: 'wa0.2',
  colorStrokeFocus1: 'black', colorStrokeFocus2: 'white',
  colorNeutralShadowAmbient: 'rgba(0,0,0,0.24)', colorNeutralShadowKey: 'rgba(0,0,0,0.28)',
  colorNeutralShadowAmbientLighter: 'rgba(0,0,0,0.12)', colorNeutralShadowKeyLighter: 'rgba(0,0,0,0.14)',
  colorNeutralShadowAmbientDarker: 'rgba(0,0,0,0.40)', colorNeutralShadowKeyDarker: 'rgba(0,0,0,0.48)',
  colorBrandShadowAmbient: 'rgba(0,0,0,0.30)', colorBrandShadowKey: 'rgba(0,0,0,0.25)',
};

/* ---- palette & status colours: derived from the light values ---- */
const hsl = (hex) => color.toHsl(color.parse(hex));
const hex = (h, s, l) => color.toHex(color.fromHsl(h, s, l));
const mixL = (a, b) => { const A = hsl(a), B = hsl(b); return hex(A.h, (A.s + B.s) / 2, (A.l + B.l) / 2); };
const darken = (c, factor) => { const H = hsl(c); return hex(H.h, H.s, H.l * factor); };
const lighten = (c, target) => { const H = hsl(c); return hex(H.h, H.s, Math.max(H.l, target)); };

function paletteGroup(prefix) {
  const get = (role) => light[`--${prefix}${role}`];
  const out = {};
  const primary = get('Background3') || get('BorderActive') || get('Foreground3');
  const tint40 = get('Background2') || get('Border1');
  const shade30 = get('Foreground2');
  const tint20 = get('ForegroundInverted');
  const shade10 = get('Foreground1');
  if (!primary || !tint40 || !shade30) return null;
  const tint30 = mixL(primary, tint40);
  const shade40 = darken(shade30, 0.55);
  const assign = (role, value) => { if (light[`--${prefix}${role}`] !== undefined && value) out[`${prefix}${role}`] = value; };
  assign('Background1', shade40);
  assign('Background2', shade30);
  assign('Background3', primary);
  assign('Foreground1', tint30);
  assign('Foreground2', tint40);
  assign('Foreground3', tint20 || lighten(primary, 0.62));
  assign('BorderActive', tint30);
  assign('Border1', shade30);
  assign('Border2', tint20 || lighten(primary, 0.62));
  assign('ForegroundInverted', shade10 || primary);
  assign('BackgroundInverted', tint40);
  return out;
}

const groups = new Set();
for (const name of Object.keys(light)) {
  const m = name.match(/^--(colorPalette[A-Z][a-zA-Z]+?|colorStatus(?:Danger|Success|Warning))(Background|Foreground|Border)/);
  if (m) groups.add(m[1]);
}
const derived = {};
for (const g of groups) Object.assign(derived, paletteGroup(g) || {});

/* ---- assemble ---- */
const spec = {};
const fallbackUsed = [];
for (const name of Object.keys(light)) {
  if (!name.startsWith('--color')) continue;
  const short = name.slice(2);
  if (dark[short]) spec[short] = dark[short];
  else if (derived[short]) spec[short] = derived[short];
  else {
    // Unknown token: fall back to the generic colour mapping by role guessed from the name.
    const kind = /Background/.test(short) ? 'bg' : /Stroke|Border/.test(short) ? 'bd' : /Shadow/.test(short) ? 'sh' : 'fg';
    const v = color.modifyColorString(kind, light[name]) || light[name];
    spec[short] = v;
    fallbackUsed.push(short);
  }
}
if (fallbackUsed.length) console.warn('generic fallback used for', fallbackUsed.length, 'tokens:', fallbackUsed.join(', '));

const names = Object.keys(light).filter((n) => n.startsWith('--color'));
// Light values of surface/stroke tokens: used at run time to derive a legible
// text colour when Studio uses such a token as a *foreground* (it does).
const surfaceLight = {};
for (const n of names) if (/Background|Stroke|Border|Stencil/.test(n) && !/Foreground/.test(n)) surfaceLight[n.slice(2)] = light[n];
const out = `/* Generated by tools/gen-tokens.mjs — do not edit by hand. */
(function (root) {
  'use strict';
  const CAPD = (root.CAPD = root.CAPD || {});
  CAPD.FLUENT_BRAND = ${JSON.stringify(brand)};
  CAPD.FLUENT_TOKEN_NAMES = ${JSON.stringify(names)};
  CAPD.FLUENT_DARK_SPEC = ${JSON.stringify(spec)};
  CAPD.FLUENT_SURFACE_LIGHT = ${JSON.stringify(surfaceLight)};
})(typeof globalThis !== 'undefined' ? globalThis : this);
`;
const outPath = path.join(here, '..', 'src', 'content', 'generated', 'fluent-tokens.js');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, out);
console.log(`wrote ${path.relative(process.cwd(), outPath)}: ${names.length} colour tokens, ${Object.keys(derived).length} derived palette values`);
