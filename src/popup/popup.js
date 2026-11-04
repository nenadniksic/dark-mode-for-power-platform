/* Popup: reads settings, reflects them in the controls, writes changes back. */
(function () {
  'use strict';
  const settings = globalThis.CAPD.settings;
  const sharePoint = globalThis.CAPD.sharePoint;
  const $ = (sel) => document.querySelector(sel);

  const enabled = $('#enabled');
  const status = $('#status');
  const toggles = [...document.querySelectorAll('input[type="checkbox"][data-key]')];
  const radios = [...document.querySelectorAll('.segmented input[type="radio"]')];

  function describeTab(url) {
    if (!url) return { kind: 'none', text: 'Open Power Apps or Power Automate to use dark mode' };
    let u; try { u = new URL(url); } catch (e) { return { kind: 'none', text: 'Not a Power Apps page' }; }
    const h = u.hostname;
    const maker = /^make(\.preview|\.test)?\.powerapps\.(com|cn)$/.test(h) || /^make\.(gov|high)\.powerapps\.us$/.test(h) || h === 'make.apps.appsplatform.us';
    if (maker && /\/canvas(\/|$)/.test(u.pathname)) return { kind: 'studio', text: 'Active in Power Apps Studio' };
    if (maker) return { kind: 'maker', text: 'Active on the maker portal' };
    const automate = /^make(\.preview|\.test)?\.powerautomate\.(com|cn)$/.test(h) || /^make\.(gov|high)\.powerautomate\.us$/.test(h) || /(^|\.)flow\.microsoft\.com$/.test(h);
    if (automate) return { kind: 'maker', text: 'Active on Power Automate' };
    if (/powerapps\.(com|us|cn)$|appsplatform\.us$/.test(h) && /\/play\//.test(u.pathname)) return { kind: 'player', text: 'Published apps are never themed' };
    if (sharePoint.isHost(h)) return { kind: 'sharepoint', text: 'Active on SharePoint' };
    if (/(^|\.)sharepoint(-mil)?\.(com|us|cn)$/.test(h)) return { kind: 'none', text: 'OneDrive keeps its own dark mode' };
    return { kind: 'none', text: 'Not a Power Apps or Power Automate page' };
  }

  function render(s, tabInfo) {
    enabled.checked = s.enabled;
    for (const r of radios) r.checked = s[r.name] === r.value;
    for (const t of toggles) {
      const key = t.dataset.key;
      t.checked = t.dataset.on ? s[key] === t.dataset.on : !!s[key];
    }
    const on = s.enabled && tabInfo.kind !== 'none' && tabInfo.kind !== 'player';
    if (!s.enabled) { status.textContent = 'Dark mode is off'; status.className = 'status'; }
    else if (tabInfo.kind === 'maker' && !s.makerPortal) { status.textContent = 'Off for portal pages (see below)'; status.className = 'status'; }
    else if (tabInfo.kind === 'sharepoint' && !s.sharePoint) { status.textContent = 'Off for SharePoint (see below)'; status.className = 'status'; }
    else { status.textContent = tabInfo.text; status.className = on ? 'status on' : 'status'; }
    document.body.classList.toggle('disabled', !s.enabled);
  }

  async function currentTabInfo() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      return describeTab(tab && tab.url);
    } catch (e) { return describeTab(''); }
  }

  async function init() {
    const [s, tabInfo] = await Promise.all([settings.load(), currentTabInfo()]);
    render(s, tabInfo);
    enabled.addEventListener('change', () => settings.save({ enabled: enabled.checked }));
    for (const r of radios) r.addEventListener('change', () => { if (r.checked) settings.save({ [r.name]: r.value }); });
    for (const t of toggles) t.addEventListener('change', () => {
      const key = t.dataset.key;
      settings.save({ [key]: t.dataset.on ? (t.checked ? t.dataset.on : t.dataset.off) : t.checked });
    });
    settings.onChange(async (next) => render(next, await currentTabInfo()));
    const spHint = $('#sharePoint-hint');
    const spHintText = spHint.textContent;
    sharePoint.bindSwitch($('#sharePoint'), async (next, granted) => {
      spHint.textContent = next.sharePoint && !granted ? 'On in another browser: allow it here too' : spHintText;
      render(next, await currentTabInfo()); // the tab's address is readable once access is granted
    });
    $('#options').addEventListener('click', () => chrome.runtime.openOptionsPage());
    try {
      const cmds = await chrome.commands.getAll();
      const c = cmds.find((x) => x.name === 'toggle-dark-mode');
      if (c) $('#shortcut').textContent = c.shortcut || 'No shortcut set';
    } catch (e) { /* ignore */ }
  }
  init();
})();
