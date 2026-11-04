/* Popup: reads settings, reflects them in the controls, writes changes back. */
(function () {
  'use strict';
  const settings = globalThis.CAPD.settings;
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
    return { kind: 'none', text: 'Not a Power Apps or Power Automate page' };
  }

  /* ---- Appearance: what "Follow system" or a schedule says right now ---- */
  const schedule = globalThis.CAPD.schedule;
  const mqDark = matchMedia('(prefers-color-scheme: dark)');
  const darkFrom = $('#darkFrom');
  const darkTo = $('#darkTo');
  let shown = null; // the last [settings, tabInfo] rendered, to keep the schedule line current

  /** null for Always dark; otherwise { dark, text, until, st }. */
  function modeState(s) {
    if (s.mode === 'system') return { dark: mqDark.matches, text: 'Light while your system is light', until: null, st: null };
    const st = schedule.current(s); // a switch by hand included
    return st ? { dark: st.dark, text: schedule.summary(st), until: st.until ? st.until.at : null, st } : null;
  }

  /** Leave a field alone while the user is in it. */
  function setValue(input, value) { if (document.activeElement !== input) input.value = value; }

  function renderSchedule(s, mode) {
    const box = $('#schedule');
    box.hidden = !schedule.isScheduled(s);
    if (box.hidden) return;
    const st = mode.st;
    $('#hours').hidden = !(s.mode === 'custom' || st.fallback);
    setValue(darkFrom, s.darkFrom);
    setValue(darkTo, s.darkTo);
    let note = `${schedule.summary(st)}.`;
    if (s.mode === 'sun' && st.location) {
      const span = st.overridden ? '' : schedule.darkSpan(st);
      const loc = st.location;
      note = `${span ? `Dark ${span}.` : note} Sunset and sunrise for ${loc.source === 'manual' ? schedule.placeText(loc) : `${loc.place}, from your time zone`}.`;
    } else if (s.mode === 'sun') {
      note = `${note} Your time zone gives no location, so these hours apply until you set one.`;
    }
    $('#schedule-note').textContent = note;
    const locButton = $('#location');
    locButton.hidden = s.mode !== 'sun';
    locButton.textContent = st.location ? 'Change location' : 'Set location';
    // Switch by hand until the schedule next changes, like the keyboard shortcut.
    const flipButton = $('#flip');
    flipButton.hidden = !s.enabled || st.empty;
    flipButton.textContent = st.overridden ? 'Back to the schedule' : `Switch to ${st.dark ? 'light' : 'dark'}`;
    flipButton.title = st.overridden ? '' : 'Until the schedule next changes';
  }

  function render(s, tabInfo) {
    shown = [s, tabInfo];
    const mode = modeState(s);
    if (mode && mode.dark && mode.until) tabInfo = { ...tabInfo, text: `${tabInfo.text} until ${schedule.clock(mode.until)}` };
    enabled.checked = s.enabled;
    for (const r of radios) r.checked = s[r.name] === r.value;
    for (const t of toggles) {
      const key = t.dataset.key;
      t.checked = t.dataset.on ? s[key] === t.dataset.on : !!s[key];
    }
    const on = s.enabled && tabInfo.kind !== 'none' && tabInfo.kind !== 'player';
    if (!s.enabled) { status.textContent = 'Dark mode is off'; status.className = 'status'; }
    else if (on && mode && !mode.dark) { status.textContent = mode.text; status.className = 'status'; }
    else if (tabInfo.kind === 'maker' && !s.makerPortal) { status.textContent = 'Off for portal pages (see below)'; status.className = 'status'; }
    else { status.textContent = tabInfo.text; status.className = on ? 'status on' : 'status'; }
    document.body.classList.toggle('disabled', !s.enabled);
    renderSchedule(s, mode);
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
    for (const t of [darkFrom, darkTo]) t.addEventListener('change', () => { if (schedule.minutes(t.value) >= 0) settings.save({ [t.id]: t.value }); });
    $('#location').addEventListener('click', () => chrome.runtime.openOptionsPage());
    $('#flip').addEventListener('click', async () => settings.save(schedule.flip(await settings.load())));
    mqDark.addEventListener('change', () => { if (shown) render(...shown); });
    setInterval(() => { if (shown) render(...shown); }, 30000);
    for (const t of toggles) t.addEventListener('change', () => {
      const key = t.dataset.key;
      settings.save({ [key]: t.dataset.on ? (t.checked ? t.dataset.on : t.dataset.off) : t.checked });
    });
    settings.onChange(async (next) => render(next, await currentTabInfo()));
    $('#options').addEventListener('click', () => chrome.runtime.openOptionsPage());
    try {
      const cmds = await chrome.commands.getAll();
      const c = cmds.find((x) => x.name === 'toggle-dark-mode');
      if (c) $('#shortcut').textContent = c.shortcut || 'No shortcut set';
    } catch (e) { /* ignore */ }
  }
  init();
})();
