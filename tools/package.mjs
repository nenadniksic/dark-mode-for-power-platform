#!/usr/bin/env node
/*
 * Packages the extension for the Chrome Web Store (or manual install) as
 * dist/canvas-studio-dark-mode-<version>.zip, containing only what the
 * manifest needs: manifest, src, theme-free generated code, icons, licence.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(here, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'manifest.json'), 'utf8'));
const out = path.join(rootDir, 'dist', `canvas-studio-dark-mode-${manifest.version}.zip`);
fs.mkdirSync(path.dirname(out), { recursive: true });
if (fs.existsSync(out)) fs.unlinkSync(out);

const include = ['manifest.json', 'LICENSE', 'src', 'icons'];
const missing = include.filter((p) => !fs.existsSync(path.join(rootDir, p)));
if (missing.length) throw new Error('missing: ' + missing.join(', '));
execFileSync('zip', ['-r', '-X', '-q', out, ...include, '-x', '*.DS_Store', '-x', '__MACOSX/*'], { cwd: rootDir, stdio: 'inherit' });
const size = fs.statSync(out).size;
console.log(`wrote ${path.relative(process.cwd(), out)} (${(size / 1024).toFixed(1)} KB)`);
const listing = execFileSync('unzip', ['-l', out], { encoding: 'utf8' });
console.log(listing.split('\n').filter((l) => /\.(js|html|css|json|png)$/.test(l)).length, 'files');
