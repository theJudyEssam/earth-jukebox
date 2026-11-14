// Earth Jukebox: wires the globe, voice, narration, sound, data layers and haptics together.
import { Globe, HOME } from './globe/globe.js';
import { formatCoords, distanceKm } from './globe/geo.js';
import { VoiceRecognizer } from './voice/recognizer.js';
import { parse, HELP, KEYS } from './voice/commands.js';
import { Narrator, readPref, writePref } from './ui/narrator.js';
import { AudioEngine } from './audio/engine.js';
import { Haptics } from './haptics/haptics.js';
import { LAYERS, surface } from './data/layers.js';
import { PLACES, TOUR, findPlaceById } from './data/places.js';
import { describePoint } from './data/describe.js';
import { DATASETS } from './data/datasets.js';
import { DataDialog } from './ui/data-dialog.js';

const $ = (id) => document.getElementById(id);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const narrator = new Narrator({ live: $('live'), assertive: $('live-assertive'), caption: $('caption'), log: $('log') });
const haptics = new Haptics();
const audio = new AudioEngine({ haptics });
const voice = new VoiceRecognizer();
const globe = new Globe($('globe'), { reducedMotion });
const dialog = new DataDialog({ audio, narrator });

const state = {
  layer: LAYERS[0],
  tourIndex: -1,
  lastAnnounced: '',
  suppressSettledUntil: 0,
  chips: [],          // datasets offered for the current view
  chipsKey: '',
  chipsAnnounced: '',
};

// ---------------------------------------------------------------- boot
init().catch((err) => {
  console.error(err);
  $('loading').textContent = 'Could not start the 3D globe. ' + (err?.message || '');
  narrator.say('Sorry, the 3D globe could not start in this browser. Voice and typed commands still work for descriptions.', { kind: 'error' });
});

async function init() {
  buildHelp();
  buildLayerSelect();
  bindUi();
  bindKeys();
  bindVoice();
  await Promise.all([globe.init(), surface.load(), state.layer.load()]);
  $('loading').hidden = true;
  globe.setClouds($('opt-clouds').checked);
  globe.addEventListener('frame', updateMarkerLabel);
  globe.addEventListener('move', throttle(() => { updateLocationCard(); updateChips(); }, 150));
  dialog.addEventListener('willplay', () => stopSound());
  dialog.addEventListener('closed', () => narrator.say('Back to the globe.', { speak: false }));
  updateChips();
  globe.addEventListener('settled', onSettled);
  globe.addEventListener('pick', (e) => goToPoint(e.detail.lat, e.detail.lon, { fromClick: true }));
  updateLocationCard();
  const intro = voice.supported
    ? 'Welcome to Earth Jukebox. Press V or the microphone button and say “take me to the Amazon”, or type a command. Say “help” to hear everything you can do.'
    : 'Welcome to Earth Jukebox. Voice recognition is not available in this browser, so type commands in the box, for example “go to Greenland”. Chrome, Edge and Safari support voice.';
  narrator.say(intro, { speak: false });
  window.earthJukebox = { globe, audio, voice, narrator, haptics, dialog, run }; // handy for debugging and demos
}

// ---------------------------------------------------------------- command handling
/** Run one utterance (voice alternatives or typed text). Returns true if it was understood. */
function run(alternatives, { source = 'typed' } = {}) {
  const list = Array.isArray(alternatives) ? alternatives : [alternatives];
  let cmd = null, heard = list[0];
  for (const alt of list) { cmd = parse(alt); if (cmd) { heard = alt; break; } }
  narrator.user(heard);
  audio.ensure();
  if (!cmd) {
    audio.earcon('error');
    // In continuous voice mode, background chatter shouldn't trigger a spoken complaint every time.
    narrator.say(`I didn't catch a command in “${heard}”. Say “help” for ideas.`, { speak: source === 'typed', kind: 'error' });
    return false;
  }
  audio.earcon('ok');
  execute(cmd);
  return true;
}

function execute(cmd) {
  if (dialog.isOpen) {
    if (cmd.type === 'play') return dialog.play();
    if (cmd.type === 'stop') { dialog.pause(); return narrator.say('Paused.', { speak: false }); }
    if (cmd.type === 'describe' || cmd.type === 'describe-layer') return dialog.describe();
    if (['goto', 'goto-coords', 'reset', 'tour-start', 'tour-next', 'tour-prev', 'nudge', 'zoom'].includes(cmd.type)) dialog.close();
  }
  switch (cmd.type) {
    case 'open-data': {
      const ds = cmd.dataset || state.chips[cmd.index];
      if (!ds) return narrator.say(cmd.index != null ? `There is no option ${cmd.index + 1} here. ${chipsSentence()}` : 'I could not find that data story.');
      return dialog.open(ds, { place: contextPlaceFor(ds) });
    }
    case 'close-data': return dialog.isOpen ? dialog.close() : narrator.say('No data view is open.', { speak: false });
    case 'list-data': return narrator.say(chipsSentence());
    case 'goto': return goToPlace(cmd.place);
    case 'goto-coords': return goToPoint(cmd.lat, cmd.lon, { distance: 1.9 });
    case 'zoom': {
      const before = globe.getView().distance;
      globe.zoomBy(cmd.factor).then(() => {
        const v = globe.getView();
        if (Math.abs(v.distance - before) < 0.01) narrator.say(cmd.factor < 1 ? 'That is as close as we can go.' : 'That is as far out as we can go.');
        else narrator.say(`${cmd.factor < 1 ? 'Zoomed in' : 'Zoomed out'}. ${capital(v.zoom)} view, about ${v.altitudeKm.toLocaleString()} kilometres up.`);
      });
      return;
    }
    case 'nudge': {
      state.suppressSettledUntil = performance.now() + 1500;
      return globe.nudge(cmd.dLat, cmd.dLon).then(() => announceHere({ brief: true, prefix: `Moved ${cmd.direction}.` }));
    }
    case 'reset':
      stopTour(false);
      globe.setMarker(null);
      state.suppressSettledUntil = performance.now() + 4000;
      return globe.flyTo(HOME.lat, HOME.lon, { distance: HOME.distance }).then(() => narrator.say('Back to the whole planet.'));
    case 'describe': return announceHere({ brief: false });
    case 'describe-layer': return narrator.say(`${state.layer.name}. ${state.layer.description} How it sounds: ${state.layer.mapping}`);
    case 'list-places': {
      const names = PLACES.filter((p) => p.kind !== 'city').map((p) => p.name.replace(/^the /, ''));
      return narrator.say(`You can visit ${names.slice(0, -1).join(', ')}, and ${names.at(-1)}, plus cities like New York, Cairo, Mumbai and Tokyo. You can also say coordinates, like “go to 40 north 74 west”.`);
    }
    case 'play': return startSound();
    case 'stop': stopSound(); stopTour(false); return;
    case 'volume': {
      audio.setVolume(audio.volume + cmd.delta);
      $('volume').value = Math.round(audio.volume * 100);
      return narrator.say(`Volume ${Math.round(audio.volume * 100)} percent.`, { speak: false });
    }
    case 'spin': $('opt-spin').checked = cmd.on; globe.setAutoRotate(cmd.on); return narrator.say(cmd.on ? 'Spinning slowly.' : 'Holding still.');
    case 'clouds': $('opt-clouds').checked = cmd.on; globe.setClouds(cmd.on); return narrator.say(cmd.on ? 'Clouds on.' : 'Clouds off.');
    case 'speech': setSpeak(cmd.on); return narrator.say(cmd.on ? 'I will speak my replies.' : 'Okay, captions only.', { speak: cmd.on });
    case 'voice-off': voice.stop(); return;
    case 'help': {
      $('help').open = true;
      return narrator.say('Try: take me to the Sahara. Zoom in. Go north. Where am I? Play, to hear the data, and stop. Take me on a tour, then say next. Louder or quieter. Stop listening, to turn off the microphone. The full list is in the help panel.');
    }
    case 'tour-start': state.tourIndex = -1; return tourStep(1);
    case 'tour-next': return tourStep(1);
    case 'tour-prev': return tourStep(-1);
    case 'tour-stop': return stopTour(true);
    case 'layer': return switchLayer(cmd.query);
  }
}

async function goToPlace(place, { tourLine = '' } = {}) {
  state.suppressSettledUntil = performance.now() + 6000;
  narrator.say(`Flying to ${place.name}.`, { speak: false });
  globe.setMarker(place.lat, place.lon, stripThe(place.name));
  const done = await globe.flyTo(place.lat, place.lon, { distance: place.distance });
  if (!done) return; // another flight took over
  audio.earcon('arrive');
  haptics.pattern([[0.6, 80], [0, 60], [0.9, 120]]);
  state.lastAnnounced = place.id;
  updateLocationCard(); updateChips();
  state.chipsAnnounced = state.chipsKey;
  narrator.say(`${capital(place.name)}. ${place.blurb}${tourLine ? ' ' + tourLine : ''} ${chipsSentence(true)}${tourLine && state.tourIndex < TOUR.length - 1 ? ' Say next to continue the tour.' : ''}`);
}

async function goToPoint(lat, lon, { distance, fromClick = false } = {}) {
  state.suppressSettledUntil = performance.now() + 6000;
  const d = describePoint(lat, lon);
  globe.setMarker(lat, lon, d.title);
  const done = await globe.flyTo(lat, lon, { distance: distance ?? globe.getView().distance });
  if (!done) return;
  if (fromClick) audio.ensure();
  audio.earcon('arrive');
  state.lastAnnounced = d.place?.id || d.coords;
  updateChips(); state.chipsAnnounced = state.chipsKey;
  narrator.say(d.sentence + (d.place && d.relation === 'over' ? ' ' + d.place.blurb : '') + ' ' + chipsSentence(true));
}

function announceHere({ brief, prefix = '' }) {
  const v = globe.getView();
  const d = describePoint(v.lat, v.lon);
  const sample = state.layer.sample(v.lat, v.lon);
  state.lastAnnounced = d.place?.id || d.coords;
  let text = `${prefix} ${d.sentence}`.trim();
  if (!brief) {
    if (d.place && d.relation === 'over') text += ' ' + d.place.blurb;
    text += ` You are seeing a ${v.zoom} view, about ${v.altitudeKm.toLocaleString()} kilometres up.`;
    if (sample && audio.playing) text += ` The ${state.layer.name.toLowerCase()} layer reads ${sample.label}.`;
  }
  narrator.say(text);
}

function onSettled() {
  updateLocationCard();
  updateChips();
  if (performance.now() < state.suppressSettledUntil) return;
  if (state.chipsKey !== state.chipsAnnounced && !dialog.isOpen) {
    state.chipsAnnounced = state.chipsKey;
    const v0 = globe.getView(), d0 = describePoint(v0.lat, v0.lon);
    state.lastAnnounced = d0.place?.id || (d0.water ? 'ocean' : 'land');
    return narrator.say(`${d0.title}. ${chipsSentence(true)}`);
  }
  // After a drag or keyboard move, say where we ended up, but only if it changed.
  const v = globe.getView();
  const d = describePoint(v.lat, v.lon);
  const key = d.place?.id || (d.water ? 'ocean' : 'land');
  if (key === state.lastAnnounced) return;
  state.lastAnnounced = key;
  narrator.say(`${d.title}. ${d.spokenCoords}.`);
}

// ---------------------------------------------------------------- tour
function tourStep(dir) {
  const i = state.tourIndex + dir;
  if (i < 0) return narrator.say('This is the first stop of the tour.');
  if (i >= TOUR.length) { state.tourIndex = -1; return narrator.say('That is the end of the tour. Say “take me on a tour” to start again, or ask to go anywhere.'); }
  state.tourIndex = i;
  const stop = TOUR[i];
  const place = findPlaceById(stop.id);
  return goToPlace(place, { tourLine: `Stop ${i + 1} of ${TOUR.length}. ${stop.say}` });
}
function stopTour(announce) {
  if (state.tourIndex < 0) return;
  state.tourIndex = -1;
  if (announce) narrator.say('Tour ended.');
}

// ---------------------------------------------------------------- sound
function sampleFrame() {
  const v = globe.getView();
  const spread = Math.max(3, (v.distance - 1) * 18); // degrees between voices, wider when zoomed out
  const pts = [v.lon - spread, v.lon, v.lon + spread].map((lon) => state.layer.sample(v.lat, ((lon + 540) % 360) - 180));
  return { voices: pts, center: pts[1] };
}

function startSound() {
  if (!audio.start(sampleFrame)) return narrator.say('Sound is not available in this browser.', { kind: 'error' });
  setPlaying(true);
  narrator.say(`Listening to ${state.layer.name}. ${state.layer.mapping} Move around to hear it change. Say stop to end.`);
}
function stopSound() {
  if (!audio.playing) return;
  audio.stop();
  setPlaying(false);
  narrator.say('Sound stopped.', { speak: false });
}
function setPlaying(on) {
  $('play').setAttribute('aria-pressed', String(on));
  $('play').textContent = on ? 'Stop sound' : 'Listen here';
  $('globe').classList.toggle('playing', on);
}

async function switchLayer(query) {
  let next;
  if (query === 'next') next = LAYERS[(LAYERS.indexOf(state.layer) + 1) % LAYERS.length];
  else next = LAYERS.find((l) => l.name.toLowerCase().includes(query) || l.id.includes(query));
  if (!next) return narrator.say(`There is no “${query}” layer yet. Available: ${LAYERS.map((l) => l.name).join(', ')}.`);
  await next.load();
  state.layer = next;
  $('layer').value = next.id;
  $('layer-desc').textContent = next.mapping;
  globe.setOverlay(next.overlay || null);
  narrator.say(`Switched to ${next.name}. ${next.mapping}`);
}

// ---------------------------------------------------------------- voice
function bindVoice() {
  const mic = $('mic');
  if (!voice.supported) {
    mic.disabled = true;
    $('mic-label').textContent = 'Voice not supported here';
    $('mic-hint').textContent = 'Use Chrome, Edge or Safari for voice. Typing works everywhere.';
  }
  mic.addEventListener('click', () => toggleVoice());
  voice.addEventListener('state', (e) => {
    const on = e.detail.listening;
    mic.setAttribute('aria-pressed', String(on));
    $('mic-label').textContent = on ? 'Listening… (press to stop)' : 'Start voice control';
  });
  voice.addEventListener('interim', (e) => { $('interim').textContent = e.detail.text; });
  voice.addEventListener('final', (e) => run(e.detail.alternatives, { source: 'voice' }));
  voice.addEventListener('error', (e) => { audio.earcon('error'); narrator.say(e.detail.message, { kind: 'error', urgent: true }); });
  // Don't let the microphone hear our own voice.
  narrator.onSpeakStart = () => voice.pause();
  narrator.onSpeakEnd = () => voice.resume();
}

function toggleVoice() {
  audio.ensure();
  if (!voice.supported) return narrator.say('Voice recognition is not available in this browser. Please type commands instead.');
  const on = voice.toggle();
  audio.earcon(on ? 'listen' : 'unlisten');
  narrator.say(on ? 'Listening. Where would you like to go?' : 'Voice control off.', { speak: false });
}

// ---------------------------------------------------------------- UI wiring
function bindUi() {
  $('command-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('command-input');
    const text = input.value.trim();
    if (!text) return;
    run(text, { source: 'typed' });
    input.value = '';
  });
  $('play').addEventListener('click', () => (audio.playing ? stopSound() : startSound()));
  $('volume').addEventListener('input', (e) => audio.setVolume(e.target.value / 100));
  $('layer').addEventListener('change', (e) => switchLayer(LAYERS.find((l) => l.id === e.target.value).id));
  const speak = $('opt-speak');
  speak.checked = narrator.speakAloud;
  speak.addEventListener('change', () => setSpeak(speak.checked));
  $('opt-clouds').addEventListener('change', (e) => globe.setClouds(e.target.checked));
  const spin = $('opt-spin');
  spin.checked = readPref('spin', false) && !reducedMotion;
  spin.addEventListener('change', () => { globe.setAutoRotate(spin.checked); writePref('spin', spin.checked); });
  queueMicrotask(() => globe.controls && globe.setAutoRotate(spin.checked));
  globe.addEventListener('interact', () => { audio.ensure(); if (spin.checked) { spin.checked = false; globe.setAutoRotate(false); } });

  // Haptics: meter always; serial button only where Web Serial exists.
  haptics.addEventListener('output', (e) => {
    const bar = $('hap-bar');
    bar.style.width = `${Math.round(e.detail.intensity * 100)}%`;
    clearTimeout(bar._t);
    bar._t = setTimeout(() => { bar.style.width = '0%'; }, Math.max(80, e.detail.ms));
  });
  if (haptics.canSerial) {
    const btn = $('hap-connect');
    btn.hidden = false;
    btn.addEventListener('click', async () => {
      try { await haptics.connectSerial(); btn.textContent = 'Haptic device connected'; btn.disabled = true; narrator.say('Haptic device connected.'); }
      catch (err) { narrator.say(`Could not connect the haptic device. ${err.message}`, { kind: 'error' }); }
    });
  }
  $('hap-status').textContent = haptics.canVibrate
    ? 'Your device can vibrate in time with the sound.'
    : 'This device cannot vibrate; the bar shows the rhythm a wearable would feel (phase 3).';
}

function setSpeak(on) { $('opt-speak').checked = on; narrator.setSpeak(on); }

function bindKeys() {
  document.addEventListener('keydown', (e) => {
    const t = e.target;
    const typing = t.closest?.('input[type=text], textarea, select');
    if (e.key === 'Escape') {
      stopSound(); stopTour(false); narrator.stopSpeaking();
      if (voice.active) toggleVoice();
      if (typing) t.blur();
      return;
    }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (dialog.isOpen) {
      const k = e.key.toLowerCase();
      if (k === 'p') { e.preventDefault(); dialog.playing ? dialog.pause() : dialog.play(); }
      else if (k === 'd') { e.preventDefault(); dialog.describe(); }
      else if (k === 'v') { e.preventDefault(); toggleVoice(); }
      return;
    }
    if (/^[1-6]$/.test(e.key)) { e.preventDefault(); audio.ensure(); return execute({ type: 'open-data', index: +e.key - 1 }); }
    const big = e.shiftKey ? 2.5 : 1;
    const step = 12 * big;
    const handled = {
      ArrowUp: () => execute({ type: 'nudge', dLat: step, dLon: 0, direction: 'north' }),
      ArrowDown: () => execute({ type: 'nudge', dLat: -step, dLon: 0, direction: 'south' }),
      ArrowLeft: () => execute({ type: 'nudge', dLat: 0, dLon: -step * 1.5, direction: 'west' }),
      ArrowRight: () => execute({ type: 'nudge', dLat: 0, dLon: step * 1.5, direction: 'east' }),
      '+': () => execute({ type: 'zoom', factor: 0.65 }),
      '=': () => execute({ type: 'zoom', factor: 0.65 }),
      '-': () => execute({ type: 'zoom', factor: 1.5 }),
      _: () => execute({ type: 'zoom', factor: 1.5 }),
      PageUp: () => execute({ type: 'zoom', factor: 0.65 }),
      PageDown: () => execute({ type: 'zoom', factor: 1.5 }),
      v: toggleVoice, V: toggleVoice,
      d: () => execute({ type: 'describe' }), D: () => execute({ type: 'describe' }),
      p: () => execute({ type: audio.playing ? 'stop' : 'play' }), P: () => execute({ type: audio.playing ? 'stop' : 'play' }),
      t: () => execute({ type: 'tour-start' }), T: () => execute({ type: 'tour-start' }),
      n: () => execute({ type: 'tour-next' }), N: () => execute({ type: 'tour-next' }),
      b: () => execute({ type: 'tour-prev' }), B: () => execute({ type: 'tour-prev' }),
      r: () => execute({ type: 'reset' }), R: () => execute({ type: 'reset' }), Home: () => execute({ type: 'reset' }),
      s: () => execute({ type: 'speech', on: !narrator.speakAloud }), S: () => execute({ type: 'speech', on: !narrator.speakAloud }),
      h: () => execute({ type: 'help' }), H: () => execute({ type: 'help' }), '?': () => execute({ type: 'help' }),
      '/': () => $('command-input').focus(),
    }[e.key];
    // Arrow keys only steer the globe when focus isn't on a form control that uses them.
    if (!handled) return;
    if (e.key.startsWith('Arrow') && t.closest?.('input, select, details, summary')) return;
    e.preventDefault();
    audio.ensure();
    handled();
  });
}

function buildHelp() {
  const body = $('help-body');
  let html = '';
  for (const g of HELP) {
    html += `<h3>${g.group}</h3><table><thead><tr><th scope="col">Say</th><th scope="col">What it does</th></tr></thead><tbody>`;
    html += g.items.map(([say, does]) => `<tr><td>${say}</td><td>${does}</td></tr>`).join('');
    html += '</tbody></table>';
  }
  html += '<h3>Keyboard</h3><table><thead><tr><th scope="col">Key</th><th scope="col">What it does</th></tr></thead><tbody>';
  html += KEYS.map(([k, does]) => `<tr><td><kbd>${k}</kbd></td><td>${does}</td></tr>`).join('');
  html += '</tbody></table>';
  body.innerHTML = html;
}

function buildLayerSelect() {
  const sel = $('layer');
  sel.innerHTML = LAYERS.map((l) => `<option value="${l.id}">${l.name}</option>`).join('');
  $('layer-desc').textContent = state.layer.mapping;
}

function updateLocationCard() {
  if (!globe.camera) return;
  const v = globe.getView();
  const d = describePoint(v.lat, v.lon);
  $('loc-name').textContent = d.title;
  $('loc-coords').textContent = `${formatCoords(v.lat, v.lon)} · ${v.zoom} · ${v.altitudeKm.toLocaleString()} km up`;
  $('loc-blurb').textContent = d.place && d.relation === 'over' ? d.place.blurb : capital(d.cover) + '.';
  $('globe').setAttribute('aria-description', `Centred on ${d.title}, ${d.spokenCoords}.`);
}

function updateMarkerLabel() {
  const el = $('marker-label');
  const m = globe.markerLatLon;
  const p = globe.marker?.visible && m ? globe.project(m.lat, m.lon) : null;
  if (!p) { el.hidden = true; return; }
  el.hidden = false;
  el.textContent = globe.markerLabel;
  el.style.left = `${p.x}px`;
  el.style.top = `${p.y}px`;
}

// ---------------------------------------------------------------- data options
function nearbyPlaces(v) {
  return PLACES.map((p) => ({ p, r: distanceKm(v, p) / p.radius })).filter((x) => x.r <= 1.3).sort((a, b) => a.r - b.r).map((x) => x.p);
}

/** Which data stories to offer for the current view. Zoomed out → everything. */
function datasetsHere(v) {
  if (v.distance > 3.6) return DATASETS;
  const ids = new Set(nearbyPlaces(v).map((p) => p.id));
  const water = surface.isWater(v.lat, v.lon);
  return DATASETS.filter((ds) => ds.global || ds.regions.some((r) => ids.has(r)) || (ds.landBand && !water && Math.abs(v.lat) <= ds.landBand));
}

/** The most specific place near the view that this dataset has something to say about. */
function contextPlaceFor(ds) {
  const v = globe.getView();
  const near = nearbyPlaces(v);
  return near.find((p) => ds.notes[p.id]) || near.find((p) => ds.regions.includes(p.id)) || near[0] || null;
}

function updateChips() {
  if (!globe.camera) return;
  const list = datasetsHere(globe.getView());
  const key = list.map((d) => d.id).join(',');
  if (key === state.chipsKey) return;
  state.chips = list; state.chipsKey = key;
  const nav = $('data-chips');
  nav.hidden = !list.length;
  $('chips-list').innerHTML = list.map((d, i) =>
    `<li><button type="button" class="chip" data-id="${d.id}" aria-label="${i + 1}: ${d.title}. ${d.subtitle}"><span class="num" aria-hidden="true">${i + 1}</span>${d.title}</button></li>`).join('');
  nav.querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => {
    audio.ensure();
    execute({ type: 'open-data', dataset: DATASETS.find((d) => d.id === b.dataset.id) });
  }));
}

function chipsSentence(short = false) {
  const list = state.chips;
  if (!list.length) return short ? '' : 'No data stories here yet. Try flying somewhere else.';
  const names = list.map((d, i) => `${i + 1}, ${d.title}`).join('; ');
  const first = list.find((d) => !d.global) || list[0];
  return short
    ? `Data here: ${list.map((d) => d.title).join(', ')}. Say open ${first.title.toLowerCase()}, or press ${list.length > 1 ? `1 to ${list.length}` : '1'}.`
    : `Data stories here: ${names}. Say open and a name or number, for example open ${first.title.toLowerCase()}.`;
}

// ---------------------------------------------------------------- utils
function throttle(fn, ms) { let last = 0, t; return (...a) => { const now = Date.now(); clearTimeout(t); if (now - last > ms) { last = now; fn(...a); } else t = setTimeout(() => { last = Date.now(); fn(...a); }, ms); }; }
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const stripThe = (s) => s.replace(/^the /, '');
