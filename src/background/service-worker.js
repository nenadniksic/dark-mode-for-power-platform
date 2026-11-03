/*
 * Canvas Studio Dark Mode — service worker.
 *
 * Responsibilities: seed defaults, keep the toolbar badge in step with the
 * enabled state, handle the keyboard shortcut, and relay cross-origin
 * stylesheet fetches for content scripts when CORS blocks a direct read.
 */
importScripts('../shared/settings.js');

const settings = globalThis.CAPD.settings;
const cssCache = new Map(); // url -> { text, at }
const CSS_CACHE_TTL = 6 * 60 * 60 * 1000;
const CSS_CACHE_MAX = 64;

async function updateBadge() {
  const s = await settings.load();
  try {
    await chrome.action.setBadgeText({ text: s.enabled ? '' : 'OFF' });
    await chrome.action.setBadgeBackgroundColor({ color: '#5c5c5c' });
    await chrome.action.setTitle({ title: s.enabled ? 'Canvas Studio Dark Mode: on' : 'Canvas Studio Dark Mode: off' });
  } catch (e) { /* action API may be unavailable during install */ }
}

chrome.runtime.onInstalled.addListener(async () => {
  const s = await settings.load();
  await settings.save(s); // persist normalized defaults
  updateBadge();
});

chrome.runtime.onStartup.addListener(updateBadge);
chrome.storage.onChanged.addListener((changes) => { if (changes[settings.KEY]) updateBadge(); });

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-dark-mode') return;
  const s = await settings.load();
  await settings.save({ enabled: !s.enabled });
});

function allowedCssUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
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
