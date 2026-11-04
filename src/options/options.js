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

  /*
   * Schedule rows: the custom hours, and the location for sunset to sunrise.
   * Each has its own settings keys, so switching Appearance to another
   * choice and back finds them as they were left.
   */
  async function bindSchedule() {
    const schedule = globalThis.CAPD.schedule;
    const $ = (id) => document.getElementById(id);
    const hoursRow = $('hours-row');
    const hoursHint = $('hours-hint');
    const hoursHintText = hoursHint.textContent;
    const locationRow = $('location-row');
    const locationHint = $('location-hint');
    const note = $('schedule-note');
    const from = $('darkFrom');
    const to = $('darkTo');
    const lat = $('latitude');
    const lon = $('longitude');
    const setValue = (input, v) => { if (document.activeElement !== input) input.value = v === null ? '' : String(v); };
    let current = null;

    function show(s) {
      current = s;
      const st = schedule.state(s);
      const fallback = !!(st && st.fallback);
      hoursRow.hidden = !(s.mode === 'custom' || fallback);
      hoursHint.textContent = fallback ? 'Sunset to sunrise has no location yet (see below), so it uses these hours for now.' : hoursHintText;
      locationRow.hidden = s.mode !== 'sun';
      setValue(from, s.darkFrom);
      setValue(to, s.darkTo);
      setValue(lat, s.latitude);
      setValue(lon, s.longitude);
      for (const input of [lat, lon]) if (document.activeElement !== input) input.removeAttribute('aria-invalid');

      const tz = schedule.timeZone();
      const zone = schedule.zoneLocation(tz);
      lat.placeholder = zone ? String(zone.latitude) : '';
      lon.placeholder = zone ? String(zone.longitude) : '';
      if (s.latitude !== null) {
        locationHint.textContent = `Using the coordinates you entered. “Use time zone” goes back to ${zone ? zone.place : 'your time zone'}. They stay with your settings, which your browser syncs; they are sent nowhere else.`;
      } else if (zone) {
        locationHint.textContent = `Using ${schedule.placeText({ source: 'timezone', ...zone })} (${tz}). For exact times, enter where you are; one decimal place is plenty.`;
      } else {
        locationHint.textContent = `Your time zone${tz ? ` (${tz})` : ''} gives no location, so the dark hours above apply. Enter where you are to follow the sun.`;
      }

      note.hidden = !st;
      if (!st) return;
      if (st.empty) note.textContent = 'Pick two different times: with the same start and end, dark mode never turns on.';
      else if (!st.dark && schedule.darkSpan(st)) note.textContent = `Light now. Next dark period: ${schedule.darkSpan(st)}.`;
      else note.textContent = `${schedule.summary(st)}.`;
    }

    for (const input of [from, to]) input.addEventListener('change', async () => {
      if (!(schedule.minutes(input.value) >= 0)) return;
      await settings.save({ [input.id]: input.value });
      flash('Saved');
    });

    async function saveLocation() {
      const a = lat.value.trim();
      const b = lon.value.trim();
      if (!a && !b) { await settings.save({ latitude: null, longitude: null }); flash('Using your time zone'); return; }
      const okA = a !== '' && Number.isFinite(+a) && Math.abs(+a) <= 90;
      const okB = b !== '' && Number.isFinite(+b) && Math.abs(+b) <= 180;
      lat.setAttribute('aria-invalid', String(a !== '' && !okA));
      lon.setAttribute('aria-invalid', String(b !== '' && !okB));
      if (!okA || !okB) { flash(!a || !b ? 'Enter both latitude and longitude' : 'Latitude runs from -90 to 90, longitude from -180 to 180'); return; }
      await settings.save({ latitude: +a, longitude: +b });
      flash('Saved');
    }
    lat.addEventListener('change', saveLocation);
    lon.addEventListener('change', saveLocation);
    $('useTimeZone').addEventListener('click', async () => {
      lat.value = '';
      lon.value = '';
      await settings.save({ latitude: null, longitude: null });
      flash('Using your time zone');
    });

    show(await settings.load());
    settings.onChange(show);
    setInterval(() => { if (current) show(current); }, 60000); // keep "Light now…" current
  }

  async function init() {
    render(await settings.load());
    for (const t of toggles) t.addEventListener('change', async () => {
      const key = t.dataset.key;
      await settings.save({ [key]: t.dataset.on ? (t.checked ? t.dataset.on : t.dataset.off) : t.checked });
      flash('Saved');
    });
    for (const r of radios) r.addEventListener('change', async () => { if (r.checked) { await settings.save({ [r.name]: r.value }); flash('Saved'); } });
    await bindSchedule();
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
