#!/usr/bin/env node
/*
 * Generates src/shared/timezones.js: the approximate coordinates of each IANA
 * time zone's principal city, from the tz database's zone.tab (public domain).
 * "Sunset to sunrise" uses them when the user has not entered a location, so
 * the schedule works without asking for location access or going online.
 *
 *   node tools/gen-timezones.mjs [path/to/zone.tab]
 *
 * Defaults to the system copy (/usr/share/zoneinfo/zone.tab on macOS and most
 * Linux distributions).  Coordinates are rounded to one decimal place (about
 * 11 km), far finer than the city stands for the whole zone, and well inside
 * a minute of sunrise or sunset.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(here, '..');
const source = process.argv[2] || '/usr/share/zoneinfo/zone.tab';
const out = path.join(rootDir, 'src', 'shared', 'timezones.js');

/*
 * Names a browser can report that zone.tab does not list: the older names
 * that Chrome's ICU still uses as canonical ("Asia/Calcutta"), zones merged
 * into another, and the backward-compatible links.  Each maps to a zone.tab
 * entry; the build fails if a target is missing, so the list cannot rot.
 */
const ALIASES = {
  'Africa/Asmera': 'Africa/Asmara', 'Africa/Timbuktu': 'Africa/Bamako',
  'America/Argentina/ComodRivadavia': 'America/Argentina/Catamarca', 'America/Atka': 'America/Adak',
  'America/Buenos_Aires': 'America/Argentina/Buenos_Aires', 'America/Catamarca': 'America/Argentina/Catamarca',
  'America/Cordoba': 'America/Argentina/Cordoba', 'America/Jujuy': 'America/Argentina/Jujuy',
  'America/Mendoza': 'America/Argentina/Mendoza', 'America/Rosario': 'America/Argentina/Cordoba',
  'America/Coral_Harbour': 'America/Atikokan', 'America/Ensenada': 'America/Tijuana', 'America/Santa_Isabel': 'America/Tijuana',
  'America/Fort_Wayne': 'America/Indiana/Indianapolis', 'America/Indianapolis': 'America/Indiana/Indianapolis',
  'America/Knox_IN': 'America/Indiana/Knox', 'America/Louisville': 'America/Kentucky/Louisville',
  'America/Godthab': 'America/Nuuk', 'America/Montreal': 'America/Toronto', 'America/Nipigon': 'America/Toronto',
  'America/Thunder_Bay': 'America/Toronto', 'America/Rainy_River': 'America/Winnipeg', 'America/Yellowknife': 'America/Edmonton',
  'America/Pangnirtung': 'America/Iqaluit', 'America/Porto_Acre': 'America/Rio_Branco', 'America/Shiprock': 'America/Denver',
  'America/Virgin': 'America/St_Thomas',
  'Asia/Ashkhabad': 'Asia/Ashgabat', 'Asia/Calcutta': 'Asia/Kolkata', 'Asia/Choibalsan': 'Asia/Ulaanbaatar',
  'Asia/Chongqing': 'Asia/Shanghai', 'Asia/Chungking': 'Asia/Shanghai', 'Asia/Harbin': 'Asia/Shanghai',
  'Asia/Dacca': 'Asia/Dhaka', 'Asia/Istanbul': 'Europe/Istanbul', 'Asia/Katmandu': 'Asia/Kathmandu', 'Asia/Macao': 'Asia/Macau',
  'Asia/Rangoon': 'Asia/Yangon', 'Asia/Saigon': 'Asia/Ho_Chi_Minh', 'Asia/Tel_Aviv': 'Asia/Jerusalem', 'Asia/Thimbu': 'Asia/Thimphu',
  'Asia/Ujung_Pandang': 'Asia/Makassar', 'Asia/Ulan_Bator': 'Asia/Ulaanbaatar',
  'Atlantic/Faeroe': 'Atlantic/Faroe', 'Atlantic/Jan_Mayen': 'Arctic/Longyearbyen',
  'Australia/ACT': 'Australia/Sydney', 'Australia/Canberra': 'Australia/Sydney', 'Australia/Currie': 'Australia/Hobart',
  'Australia/NSW': 'Australia/Sydney', 'Australia/North': 'Australia/Darwin', 'Australia/Queensland': 'Australia/Brisbane',
  'Australia/South': 'Australia/Adelaide', 'Australia/Tasmania': 'Australia/Hobart', 'Australia/Victoria': 'Australia/Melbourne',
  'Australia/West': 'Australia/Perth',
  'Brazil/East': 'America/Sao_Paulo', 'Canada/Atlantic': 'America/Halifax', 'Canada/Central': 'America/Winnipeg',
  'Canada/Eastern': 'America/Toronto', 'Canada/Mountain': 'America/Edmonton', 'Canada/Newfoundland': 'America/St_Johns',
  'Canada/Pacific': 'America/Vancouver', 'Chile/Continental': 'America/Santiago',
  'Europe/Belfast': 'Europe/London', 'Europe/Kiev': 'Europe/Kyiv', 'Europe/Nicosia': 'Asia/Nicosia',
  'Europe/Tiraspol': 'Europe/Chisinau', 'Europe/Uzhgorod': 'Europe/Kyiv', 'Europe/Zaporozhye': 'Europe/Kyiv',
  'Mexico/General': 'America/Mexico_City',
  'Pacific/Enderbury': 'Pacific/Kanton', 'Pacific/Johnston': 'Pacific/Honolulu', 'Pacific/Ponape': 'Pacific/Pohnpei',
  'Pacific/Samoa': 'Pacific/Pago_Pago', 'Pacific/Truk': 'Pacific/Chuuk', 'Pacific/Yap': 'Pacific/Chuuk',
  'US/Alaska': 'America/Anchorage', 'US/Arizona': 'America/Phoenix', 'US/Central': 'America/Chicago',
  'US/Eastern': 'America/New_York', 'US/Hawaii': 'Pacific/Honolulu', 'US/Mountain': 'America/Denver',
  'US/Pacific': 'America/Los_Angeles',
  Cuba: 'America/Havana', Egypt: 'Africa/Cairo', Eire: 'Europe/Dublin', GB: 'Europe/London', Hongkong: 'Asia/Hong_Kong',
  Iceland: 'Atlantic/Reykjavik', Iran: 'Asia/Tehran', Israel: 'Asia/Jerusalem', Jamaica: 'America/Jamaica', Japan: 'Asia/Tokyo',
  Libya: 'Africa/Tripoli', Navajo: 'America/Denver', NZ: 'Pacific/Auckland', Poland: 'Europe/Warsaw', Portugal: 'Europe/Lisbon',
  PRC: 'Asia/Shanghai', ROC: 'Asia/Taipei', ROK: 'Asia/Seoul', Singapore: 'Asia/Singapore', Turkey: 'Europe/Istanbul',
};

/** ISO 6709 ±DDMM[SS] / ±DDDMM[SS] to decimal degrees. */
function degrees(s, degDigits) {
  const sign = s[0] === '-' ? -1 : 1;
  const d = +s.slice(1, 1 + degDigits);
  const m = +s.slice(1 + degDigits, 3 + degDigits);
  const sec = s.length > 3 + degDigits ? +s.slice(3 + degDigits) : 0;
  return sign * (d + m / 60 + sec / 3600);
}
const round1 = (x) => Math.round(x * 10) / 10;

const text = fs.readFileSync(source, 'utf8');
const zones = new Map();
for (const line of text.split('\n')) {
  if (!line || line.startsWith('#')) continue;
  const [, coords, zone] = line.split('\t');
  const m = /^([+-]\d{4,6})([+-]\d{5,7})$/.exec(coords || '');
  if (!m || !zone) throw new Error(`unreadable zone.tab line: ${line}`);
  zones.set(zone, [round1(degrees(m[1], 2)), round1(degrees(m[2], 3))]);
}
if (zones.size < 300) throw new Error(`only ${zones.size} zones read from ${source}`);
for (const [alias, target] of Object.entries(ALIASES)) {
  if (!zones.has(target)) throw new Error(`alias ${alias} -> ${target}: target not in zone.tab`);
  if (zones.has(alias)) throw new Error(`alias ${alias} is itself in zone.tab; drop it from ALIASES`);
}

// Grouped by region ("Europe": { "Belgrade": [44.8, 20.5] }) to keep the file small.
const grouped = {};
for (const zone of [...zones.keys()].sort()) {
  const i = zone.indexOf('/');
  (grouped[zone.slice(0, i)] = grouped[zone.slice(0, i)] || {})[zone.slice(i + 1)] = zones.get(zone);
}
const aliases = Object.fromEntries(Object.entries(ALIASES).sort(([a], [b]) => a.localeCompare(b)));
const versionFile = path.join(path.dirname(source), '+VERSION');
const version = fs.existsSync(versionFile) ? fs.readFileSync(versionFile, 'utf8').trim() : 'unknown';

const body = `/* Generated by tools/gen-timezones.mjs from the tz database's zone.tab (${version}, public domain) — do not edit by hand. */
(function (root) {
  'use strict';
  const CAPD = (root.CAPD = root.CAPD || {});
  /** Region -> place -> [latitude, longitude] of the zone's principal city, one decimal place. */
  CAPD.timeZones = ${JSON.stringify(grouped)};
  /** Older and linked zone names -> the zone.tab name. */
  CAPD.timeZoneAliases = ${JSON.stringify(aliases)};
})(typeof globalThis !== 'undefined' ? globalThis : this);
`;
fs.writeFileSync(out, body);
console.log(`${path.relative(rootDir, out)}: ${zones.size} zones, ${Object.keys(aliases).length} aliases, ${body.length} B (tzdata ${version})`);
