/*
 * Dark Mode for Power Platform — service worker.
 *
 * Responsibilities: seed defaults, keep the toolbar badge in step with the
 * enabled state, handle the keyboard shortcut, register the SharePoint
 * content scripts while that opt-in is on, and relay cross-origin stylesheet
 * fetches for content scripts when CORS blocks a direct read.
 */
importScripts('../shared/settings.js', '../shared/timezones.js', '../shared/schedule.js');

const settings = globalThis.CAPD.settings;
const sharePoint = globalThis.CAPD.sharePoint;
const cssCache = new Map(); // url -> { text, at }
const CSS_CACHE_TTL = 6 * 60 * 60 * 1000;
const CSS_CACHE_MAX = 64;

async function updateBadge() {
  const s = await settings.load();
  try {
    await chrome.action.setBadgeText({ text: s.enabled ? '' : 'OFF' });
    await chrome.action.setBadgeBackgroundColor({ color: '#5c5c5c' });
    await chrome.action.setTitle({ title: s.enabled ? 'Dark Mode for Power Platform: on' : 'Dark Mode for Power Platform: off' });
  } catch (e) { /* action API may be unavailable during install */ }
}

/* ------------------------------------------------------------------ */
/* SharePoint (opt-in)                                                */
/* ------------------------------------------------------------------ */
/*
 * The Power Platform content scripts are declared in the manifest.  The same
 * scripts run on SharePoint only while the user has switched SharePoint on
 * AND Chrome has granted the optional SharePoint host access, so they are
 * registered here at run time rather than declared.  The file lists come from
 * the manifest, so the two can never drift apart.
 */
const SP_SCRIPT_IDS = ['capd-sp-main-world', 'capd-sp-content'];

function sharePointScripts() {
  const declared = chrome.runtime.getManifest().content_scripts || [];
  const main = declared.find((c) => c.world === 'MAIN');
  const isolated = declared.find((c) => c.world !== 'MAIN');
  const common = { matches: [...sharePoint.ORIGINS], runAt: 'document_start', allFrames: true, matchOriginAsFallback: true, persistAcrossSessions: true };
  return [
    { id: SP_SCRIPT_IDS[0], js: main.js, world: 'MAIN', ...common },
    { id: SP_SCRIPT_IDS[1], js: isolated.js, ...common },
  ];
}

/* One reconciliation at a time: several events can arrive together (the
   setting saved and the access granted by the same click). */
let spQueue = Promise.resolve();
function syncSharePoint(opts) {
  spQueue = spQueue.then(() => reconcileSharePoint(opts || {})).catch((e) => console.warn('[capd] SharePoint scripts', e));
  return spQueue;
}

async function reconcileSharePoint({ fresh = false }) {
  const [s, granted] = await Promise.all([settings.load(), sharePoint.granted()]);
  const want = s.sharePoint && granted;
  const registered = await chrome.scripting.getRegisteredContentScripts({ ids: SP_SCRIPT_IDS });
  // After an install or update, register again so a changed file list applies.
  if (registered.length && (!want || fresh || registered.length !== SP_SCRIPT_IDS.length)) {
    await chrome.scripting.unregisterContentScripts({ ids: registered.map((r) => r.id) });
    registered.length = 0;
  }
  if (!want || registered.length) return;
  await chrome.scripting.registerContentScripts(sharePointScripts());
  if (!fresh) await themeOpenSharePointTabs();
}

/*
 * Registered scripts only reach pages loaded from now on.  Switching the
 * setting on should change the SharePoint tabs already open, as every other
 * setting does, so inject into their frames now, skipping frames that already
 * run the engine (it was on before, turned off, and is now on again: those
 * pick the change up from storage themselves).
 */
async function themeOpenSharePointTabs() {
  const [main, isolated] = sharePointScripts();
  let tabs = [];
  try { tabs = await chrome.tabs.query({ url: [...sharePoint.ORIGINS] }); } catch (e) { return; }
  for (const tab of tabs) {
    try {
      const probe = await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: () => !!(globalThis.CAPD && globalThis.CAPD.booted) });
      const frameIds = probe.filter((r) => r.result === false).map((r) => r.frameId);
      if (!frameIds.length) continue;
      const target = { tabId: tab.id, frameIds };
      await chrome.scripting.executeScript({ target, files: main.js, world: 'MAIN', injectImmediately: true });
      await chrome.scripting.executeScript({ target, files: isolated.js, injectImmediately: true });
    } catch (e) { /* tab closed, or an error page: it gets the theme when it next loads */ }
  }
}

const touchesSharePoint = (p) => !!(p && p.origins && p.origins.some((o) => sharePoint.ORIGINS.includes(o) || sharePoint.isHost(hostOf(o))));
function hostOf(pattern) { const m = /^[a-z*]+:\/\/(?:\*\.)?([^/]+)/i.exec(pattern || ''); return m ? m[1] : ''; }

/* The popup can close while Chrome shows the access prompt, before it saves
   the setting; a grant means the user asked for SharePoint, so record it here
   as well.  Access removed (by the setting or Chrome's site-access controls)
   switches the setting off, so the switch never claims access it lacks. */
chrome.permissions.onAdded.addListener(async (p) => {
  if (!touchesSharePoint(p)) return;
  const s = await settings.load();
  if (!s.sharePoint) await settings.save({ sharePoint: true }); // storage change -> sync
  else syncSharePoint();
});
chrome.permissions.onRemoved.addListener(async (p) => {
  if (!touchesSharePoint(p)) return;
  const s = await settings.load();
  if (s.sharePoint) await settings.save({ sharePoint: false });
  else syncSharePoint();
});

chrome.runtime.onInstalled.addListener(async () => {
  const s = await settings.load();
  await settings.save(s); // persist normalized defaults
  updateBadge();
  syncSharePoint({ fresh: true });
});

chrome.runtime.onStartup.addListener(() => { updateBadge(); syncSharePoint(); });
chrome.storage.onChanged.addListener((changes) => {
  if (!changes[settings.KEY]) return;
  updateBadge();
  const before = settings.normalize(changes[settings.KEY].oldValue);
  const after = settings.normalize(changes[settings.KEY].newValue);
  if (before.sharePoint !== after.sharePoint) syncSharePoint();
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-dark-mode') return;
  const s = await settings.load();
  // Flips what is shown: under a schedule, until the schedule next changes
  // (schedule.js); otherwise it is the master switch.
  await settings.save(globalThis.CAPD.schedule.flip(s));
});

function allowedCssUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    if (sharePoint.isHost(u.hostname)) return true;
    return /(^|\.)(powerapps\.com|powerapps\.us|appsplatform\.us|powerapps\.cn|powerautomate\.com|powerautomate\.us|powerautomate\.cn|flow\.microsoft\.com|powerplatform\.com|office\.net|azureedge\.net|msecnd\.net|cdn\.office\.net|static2\.sharepointonline\.com)$/i.test(u.hostname);
  } catch (e) { return false; }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return false;
  if (msg.type === 'capd:fetch-css') {
    (async () => {
      const url = String(msg.url || '');
      if (!allowedCssUrl(url)) { sendResponse({ text: null, error: 'host not allowed' }); return; }
      const hit = cssCache.get(url);
      if (hit && Date.now() - hit.at < CSS_CACHE_TTL) { sendResponse({ text: hit.text }); return; }
      try {
        const res = await fetch(url, { credentials: 'omit' });
        if (!res.ok) { sendResponse({ text: null, error: `HTTP ${res.status}` }); return; }
        const ct = res.headers.get('content-type') || '';
        if (ct && !/text\/css|text\/plain|application\/octet-stream/i.test(ct)) { sendResponse({ text: null, error: `unexpected type ${ct}` }); return; }
        const text = await res.text();
        if (cssCache.size >= CSS_CACHE_MAX) cssCache.delete(cssCache.keys().next().value);
        cssCache.set(url, { text, at: Date.now() });
        sendResponse({ text });
      } catch (e) {
        sendResponse({ text: null, error: String(e) });
      }
    })();
    return true; // async response
  }
  if (msg.type === 'capd:open-options') {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return false;
  }
  return false;
});

updateBadge();
