#!/usr/bin/env node
/*
 * Accessibility gate: verifies that every text/surface pairing the theme
 * produces meets WCAG 2.1 AA (4.5:1 for text, 3:1 for UI strokes), for every
 * surface and contrast setting.  Run by `npm test` via test/contrast.test.mjs
 * and directly with `npm run contrast` for a readable report.
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

require('../src/content/00-namespace.js');
const color = require('../src/content/10-color.js');
require('../src/content/generated/fluent-tokens.js');
require('../src/content/20-css-rewriter.js');
const CAPD = globalThis.CAPD;
CAPD.InlineProcessor = { css: '' };
require('../src/content/60-static-theme.js');

const SURFACES = ['dim', 'dark', 'black'];
const CONTRASTS = ['standard', 'high'];
// Brand seeds the theme meets in practice: Power Apps Studio (the shipped
// ramp), the Power Apps portal, Power Automate, and Fluent UI's default brand.
const BRANDS = [null, '#742774', '#0066ff', '#0f6cbd'];
const hex = (c) => color.toHex(c);

export function runChecks() {
  const failures = [];
  const report = [];
  for (const brand of BRANDS) for (const surface of SURFACES) for (const contrast of CONTRASTS) {
    CAPD.brandSeed = brand;
    const label = brand ? `${surface}/${contrast}/${brand}` : `${surface}/${contrast}`;
    const settings = { surface, contrast, backdrop: 'dark', iconAdapt: true };
    const opts = { surface, contrast };
    const minText = contrast === 'high' ? 7 : 4.5;
    const tokens = Object.fromEntries(CAPD.staticTheme.tokenCSS(settings).match(/--[^:]+:[^;]+/g).map((d) => { const i = d.indexOf(':'); return [d.slice(0, i), d.slice(i + 1).replace('!important', '').trim()]; }));
    const t = (n) => color.parse(tokens['--' + n]);
    const pairs = [
      ['colorNeutralForeground1', 'colorNeutralBackground1', minText],
      ['colorNeutralForeground2', 'colorNeutralBackground1', minText],
      ['colorNeutralForeground3', 'colorNeutralBackground1', minText],
      ['colorNeutralForeground1', 'colorNeutralBackground2', minText],
      ['colorNeutralForeground2', 'colorNeutralBackground3', minText],
      ['colorNeutralForeground1', 'colorNeutralBackground1Hover', minText],
      ['colorNeutralForeground1', 'colorSubtleBackgroundHover', minText],
      ['colorNeutralForegroundOnBrand', 'colorBrandBackground', 4.5],
      ['colorNeutralForegroundOnBrand', 'colorBrandBackgroundHover', 4.5],
      ['colorNeutralForeground1', 'colorBrandBackgroundInvertedSelected', 4.5], // Power Automate filter pills
      ['colorNeutralForeground1', 'colorBrandBackgroundInvertedHover', 4.5],
      ['colorBrandForeground1', 'colorNeutralBackground1', 4.5],
      ['colorBrandForegroundLink', 'colorNeutralBackground1', 4.5],
      ['colorBrandForegroundLink', 'colorNeutralBackground3', 4.5],
      ['colorBrandForegroundLink', 'colorNeutralCardBackground', 4.5],
      ['colorBrandForeground1', 'colorNeutralCardBackground', 4.5],
      ['colorNeutralForeground3', 'colorNeutralCardBackground', minText],
      ['colorStatusDangerForeground1', 'colorNeutralCardBackground', 4.5],
      ['colorNeutralForegroundOnBrand', 'colorBrandBackgroundSelected', 4.5],
      ['colorCompoundBrandForeground1', 'colorNeutralBackground1', 4.5],
      ['colorCompoundBrandStroke', 'colorNeutralBackground1', 3],
      ['colorCompoundBrandStroke', 'colorNeutralCardBackground', 3],
      ['colorBrandStroke1', 'colorNeutralBackground1', 3],
      ['colorBrandStroke1', 'colorNeutralCardBackground', 3],
      ['colorPaletteRedForeground1', 'colorNeutralBackground1', 4.5],
      ['colorPaletteGreenForeground1', 'colorNeutralBackground1', 4.5],
      ['colorStatusDangerForeground1', 'colorNeutralBackground1', 4.5],
      ['colorStatusWarningForeground1', 'colorNeutralBackground1', 4.5],
      ['colorNeutralStrokeAccessible', 'colorNeutralBackground1', 3],
      ['colorStrokeFocus2', 'colorNeutralBackground1', 3],
      ['colorNeutralForegroundDisabled', 'colorNeutralBackground1', 1.5],
    ];
    for (const [fg, bg, min] of pairs) {
      const a = t(fg), b = t(bg);
      if (!a || !b) { failures.push(`${label}: missing ${fg} or ${bg}`); continue; }
      const ratio = color.contrast(a, b);
      report.push(`${label.padEnd(24)} ${fg.padEnd(34)} on ${bg.padEnd(30)} ${ratio.toFixed(2).padStart(6)}  (min ${min})`);
      if (ratio < min) failures.push(`${label}: ${fg} ${hex(a)} on ${bg} ${hex(b)} = ${ratio.toFixed(2)} < ${min}`);
    }
    // generic mapping: common Studio text colours on the mapped white surface and the backdrop
    // (independent of the brand, so checked once per surface/contrast)
    if (brand === null) {
    const surfaceC = color.modify('bg', color.parse('#ffffff'), opts);
    const paper = color.modify('bg', color.parse('#fafafa'), opts);
    // menus, callouts and dialogs sit on the raised surface (--capd-raised)
    const raised = color.parse(CAPD.staticTheme.paletteVars(settings).match(/--capd-raised:([^;]+)/)[1]);
    for (const txt of ['#000000', '#242424', '#323130', '#3d3d3d', '#424242', '#605e5c', '#616161', '#707070', '#742774', '#933493', '#0078d4', '#a4262c', '#107c10', '#8a8886']) {
      const fg = color.modify('fg', color.parse(txt), opts);
      for (const [name, s] of [['surface', surfaceC], ['paper', paper], ['raised', raised]]) {
        const ratio = color.contrast(fg, s);
        report.push(`${surface.padEnd(5)} ${contrast.padEnd(8)} text ${txt} -> ${hex(fg)} on ${name.padEnd(7)} ${hex(s)} ${ratio.toFixed(2).padStart(6)}  (min ${minText})`);
        if (ratio < minText) failures.push(`${surface}/${contrast}: mapped text ${txt} -> ${hex(fg)} on ${name} ${hex(s)} = ${ratio.toFixed(2)} < ${minText}`);
      }
    }
    }
    // palette variables used by the hand-written CSS
    const vars = Object.fromEntries(CAPD.staticTheme.paletteVars(settings).match(/--capd-[^:]+:[^;]+/g).map((d) => { const i = d.indexOf(':'); return [d.slice(7, i), d.slice(i + 1)]; }));
    for (const [fgName, bgName, min] of [['t1', 's1', minText], ['t2', 's1', minText], ['t1', 's2', minText], ['t1', 'raised', minText], ['t2', 'raised', minText], ['accent', 's1', 4.5], ['accent', 'raised', 4.5], ['link', 's1', 4.5], ['link', 'raised', 4.5], ['t1', 'backdrop', minText], ['b3', 's1', 3]]) {
      const ratio = color.contrast(color.parse(vars[fgName]), color.parse(vars[bgName]));
      report.push(`${label.padEnd(24)} --capd-${fgName} on --capd-${bgName} ${ratio.toFixed(2).padStart(6)}  (min ${min})`);
      if (ratio < min) failures.push(`${label}: --capd-${fgName} ${vars[fgName]} on --capd-${bgName} ${vars[bgName]} = ${ratio.toFixed(2)} < ${min}`);
    }
  }
  CAPD.brandSeed = null;
  return { failures, report };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { failures, report } = runChecks();
  console.log(report.join('\n'));
  console.log(`\n${report.length} checks, ${failures.length} failures`);
  if (failures.length) { console.log(failures.join('\n')); process.exitCode = 1; }
}
