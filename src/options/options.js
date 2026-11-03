/* Options page: full settings with live save. */
(function () {
  'use strict';
  const settings = globalThis.CAPD.settings;
  const form = document.getElementById('form');
  const saved = document.getElementById('saved');
  const toggles = [...form.querySelectorAll('input[type="checkbox"][data-key]')];
  const radios = [...form.querySelectorAll('.segmented input[type="radio"]')];
  let savedTimer = 0;

  function render(s) {
    for (const t of toggles) { const key = t.dataset.key; t.checked = t.dataset.on ? s[key] === t.dataset.on : !!s[key]; }
    for (const r of radios) r.checked = s[r.name] === r.value;
  }

  function flash(text) {
    saved.textContent = text;
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => { saved.textContent = ''; }, 2500);
  }

  async function init() {
    render(await settings.load());
    for (const t of toggles) t.addEventListener('change', async () => {
      const key = t.dataset.key;
      await settings.save({ [key]: t.dataset.on ? (t.checked ? t.dataset.on : t.dataset.off) : t.checked });
      flash('Saved');
    });
    for (const r of radios) r.addEventListener('change', async () => { if (r.checked) { await settings.save({ [r.name]: r.value }); flash('Saved'); } });
    settings.onChange(render);
    document.getElementById('reset').addEventListener('click', async () => {
      await settings.save({ ...settings.DEFAULTS });
      render(await settings.load());
      flash('Settings reset to defaults');
    });
    try { document.getElementById('version').textContent = chrome.runtime.getManifest().version; } catch (e) { /* ignore */ }
    try {
      const cmds = await chrome.commands.getAll();
      const c = cmds.find((x) => x.name === 'toggle-dark-mode');
      if (c) document.getElementById('shortcut').textContent = c.shortcut || 'not set';
    } catch (e) { /* ignore */ }
  }
  init();
})();
