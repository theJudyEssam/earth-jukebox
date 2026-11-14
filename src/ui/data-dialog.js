// The data pop-up: shows a NASA visualization and plays it as sound, live.
// Built on <dialog>.showModal(), so focus is trapped, Esc closes it and focus returns to the opener.
import { localPath } from '../data/datasets.js';
import { FrameAnalyzer, syntheticFeatures } from '../audio/analyzer.js';
import { createSonifier } from '../audio/sonifiers.js';

const $ = (id) => document.getElementById(id);
const localCache = new Map();

async function hasLocal(path) {
  if (!localCache.has(path)) {
    localCache.set(path, fetch(path, { method: 'HEAD' }).then((r) => r.ok && !/text\/html/.test(r.headers.get('content-type') || '')).catch(() => false));
  }
  return localCache.get(path);
}

export class DataDialog extends EventTarget {
  constructor({ audio, narrator }) {
    super();
    this.audio = audio; this.narrator = narrator;
    this.el = $('data-dialog');
    this.analyzer = new FrameAnalyzer();
    this.ds = null; this.mediaIndex = 0; this.sonifier = null; this.timer = 0;
    this.scanX = 0; this.lastSpoken = 0; this.lastLevelWord = '';
    this.el.addEventListener('close', () => this._teardown());
    this.el.addEventListener('cancel', () => this.narrator.say('Closed the data view.', { speak: false }));
    $('dd-close').addEventListener('click', () => this.close());
    $('dd-play').addEventListener('click', () => (this.playing ? this.pause() : this.play()));
    $('dd-describe').addEventListener('click', () => this.describe());
    $('dd-views').addEventListener('change', (e) => this._loadMedia(+e.target.value).then(() => this.playing && this.play()));
    $('dd-narration').addEventListener('change', (e) => { const v = this._video(); if (v) v.muted = !e.target.checked; });
    this.el.addEventListener('click', (e) => { if (e.target === this.el) this.close(); }); // click on backdrop
  }

  get isOpen() { return this.el.open; }

  /** @param ds dataset  @param context {place, note} what region we opened it from */
  async open(ds, { place = null, autoplay = true } = {}) {
    if (this.isOpen) this._teardown();
    this.ds = ds; this.place = place;
    $('dd-title').textContent = ds.title;
    $('dd-subtitle').textContent = ds.subtitle;
    $('dd-desc').textContent = ds.description;
    $('dd-mapping').textContent = ds.mapping;
    $('dd-here').textContent = this._note();
    $('dd-here-wrap').hidden = !place;
    $('dd-credit').innerHTML = `${ds.credit}. <a href="https://svs.gsfc.nasa.gov/${ds.svs}/" target="_blank" rel="noopener">SVS ${ds.svs} on NASA's site<span class="visually-hidden"> (opens in a new tab)</span></a>`;
    const views = $('dd-views');
    views.innerHTML = ds.media.map((m, i) => `<option value="${i}">${m.label}${m.big ? ' (large)' : ''}</option>`).join('');
    $('dd-views-wrap').hidden = ds.media.length < 2;
    // Pick the view that matches where we are (e.g. the California forest flyover over California).
    const idx = Math.max(0, ds.media.findIndex((m) => place && m.places?.includes(place.id)));
    views.value = String(idx);
    if (!this.el.open) this.el.showModal();
    $('dd-play').focus();
    this.narrator.say(`${ds.title}. ${ds.subtitle}. ${this._note()} ${autoplay ? 'Playing now. Say stop to pause, describe for details, or close.' : 'Press play to hear it.'}`);
    $('dd-meters').innerHTML = ''; $('dd-meters').dataset.keys = ''; $('dd-now').textContent = '';
    const loading = this._loadMedia(idx);
    if (autoplay) this.play(); // approximate sound starts at once, live analysis takes over when frames arrive
    await loading;
  }

  close() { if (this.el.open) this.el.close(); }

  play() {
    if (!this.ds) return;
    const ctx = this.audio.ensure(); if (!ctx) return;
    this.dispatchEvent(new Event('willplay')); // lets the globe sonifier step aside
    if (!this.sonifier) this.sonifier = createSonifier(this.ds.mode, this.audio);
    this._video()?.play().catch(() => {});
    this.playing = true;
    $('dd-play').textContent = 'Pause sound';
    $('dd-play').setAttribute('aria-pressed', 'true');
    clearInterval(this.timer);
    this.t0 = performance.now();
    this.lastSpoken = performance.now() - 6000; this.lastLevelWord = '';
    this.timer = setInterval(() => this._tick(), 100);
  }

  pause() {
    this.playing = false;
    clearInterval(this.timer);
    this.sonifier?.stop(); this.sonifier = null;
    this._video()?.pause();
    $('dd-play').textContent = 'Play sound';
    $('dd-play').setAttribute('aria-pressed', 'false');
  }

  describe() {
    if (!this.ds) return;
    const lvl = this.sonifier ? ` Right now: ${this._levelSentence()}` : '';
    this.narrator.say(`${this.ds.title}. ${this.ds.description} ${this._note()} How it sounds: ${this.ds.mapping}${lvl}`);
  }

  // ---------- internals

  _note() { return this.place ? (this.ds.notes[this.place.id] || this.ds.default) : this.ds.default; }
  _video() { return this.stage?.querySelector('video'); }

  async _loadMedia(i) {
    const ds = this.ds, m = ds.media[i];
    this.mediaIndex = i;
    const stage = $('dd-stage');
    this.stage = stage;
    stage.innerHTML = '';
    this.analyzer.reset(); this.analyzer.readable = null; this.scanX = 0;
    const local = localPath(ds, m.file);
    const isLocal = await hasLocal(local);
    const src = isLocal ? local : m.url;
    let el;
    if (m.type === 'video') {
      el = document.createElement('video');
      Object.assign(el, { muted: true, loop: true, playsInline: true, preload: 'auto' });
      el.setAttribute('aria-describedby', 'dd-desc');
      if (m.poster) el.poster = m.poster;
      if (m.captions) {
        const tr = document.createElement('track');
        Object.assign(tr, { kind: 'captions', srclang: 'en', label: 'English', default: true });
        tr.src = (await hasLocal(localPath(ds, m.captionsFile))) ? localPath(ds, m.captionsFile) : m.captions;
        el.append(tr);
      }
      $('dd-narration-wrap').hidden = !m.narrated;
      $('dd-narration').checked = false;
    } else {
      el = document.createElement('img');
      el.alt = `${ds.title}: ${ds.subtitle}. ${ds.description}`;
      $('dd-narration-wrap').hidden = true;
    }
    // Try with CORS so pixels can be read; if the server refuses, fall back to plain display.
    if (!isLocal) el.crossOrigin = 'anonymous';
    const scan = document.createElement('div');
    scan.className = 'scanline'; scan.hidden = m.type !== 'image';
    stage.append(el, scan);
    this.scanEl = scan;
    this.mediaFailed = false;
    this.loading = true;
    $('dd-source').dataset.mode = 'loading';
    $('dd-source').textContent = 'Loading the NASA visualization…';
    const loaded = await new Promise((resolve) => {
      const ok = () => resolve(true);
      el.addEventListener(m.type === 'video' ? 'loadeddata' : 'load', ok, { once: true });
      el.addEventListener('error', () => {
        if (el.crossOrigin && !isLocal) { el.removeAttribute('crossorigin'); el.src = src; el.load?.(); }
        else resolve(false);
      }, { once: false });
      el.src = src;
      setTimeout(() => resolve(false), 10000);
    });
    this.loading = false;
    if (loaded && this.playing && el.play) el.play().catch(() => {});
    if (!loaded) {
      this.mediaFailed = true;
      const msg = document.createElement('p');
      msg.className = 'dd-fail';
      msg.textContent = 'The NASA visualization could not be loaded (are you offline?). The sound below uses approximate values for this region.';
      stage.append(msg);
    }
    this._setSource(isLocal);
  }

  _setSource(isLocal) {
    const s = $('dd-source');
    s.dataset.mode = isLocal ? 'local' : 'remote';
    s.textContent = isLocal ? 'Live: reading the NASA frames on screen.' : 'Streaming from NASA. Checking whether the frames can be read…';
  }

  _tick() {
    const m = this.ds.media[this.mediaIndex];
    const el = this.stage.querySelector('video, img');
    // Stills are played like a score: a scan line sweeps left → right over ~16 s.
    let win;
    if (m.type === 'image') {
      this.scanX = (this.scanX + 0.1 / 16) % 1;
      win = { x0: Math.max(0, this.scanX - 0.03), x1: Math.min(1, this.scanX + 0.03) };
      this.scanEl.style.left = `${this.scanX * 100}%`;
    }
    let f = this.analyzer.analyze(el, win);
    if (!f) {
      if (this.analyzer.readable === false || this.mediaFailed || this.loading) {
        const s = $('dd-source');
        if (this.loading) { /* keep the loading message */ } else if (s.dataset.mode !== 'approx') {
          s.dataset.mode = 'approx';
          s.textContent = this.mediaFailed
            ? 'Approximate sound for this region: the NASA media did not load.'
            : 'Approximate sound: this browser can\'t read NASA\'s frames directly. Run tools/fetch_svs.py once for live analysis.';
        }
        const lv = this.ds.levels[this.place?.id] ?? this.ds.levels._;
        f = syntheticFeatures(lv, (performance.now() - this.t0) / 1000);
      } else return;
    } else if ($('dd-source').dataset.mode !== 'local') {
      $('dd-source').textContent = 'Live: reading the NASA frames on screen.';
      $('dd-source').dataset.mode = 'local';
    }
    this.sonifier.update(f);
    this._meters();
    this._maybeNarrate();
  }

  _meters() {
    const box = $('dd-meters');
    const ch = this.sonifier.channels;
    const keys = Object.keys(ch);
    if (box.dataset.keys !== keys.join('|')) {
      box.dataset.keys = keys.join('|');
      box.innerHTML = keys.map((k) => `<div class="dm"><span>${k}</span><div class="meter"><div class="meter-bar"></div></div></div>`).join('');
    }
    box.querySelectorAll('.meter-bar').forEach((bar, i) => { bar.style.width = `${Math.round(ch[keys[i]] * 100)}%`; });
  }

  _levelSentence() {
    const ch = this.sonifier.channels;
    const words = (v) => (v > 0.75 ? 'very high' : v > 0.5 ? 'high' : v > 0.25 ? 'moderate' : 'low');
    return Object.entries(ch).map(([k, v]) => `${k.replace(/ \(.+\)/, '')} ${words(v)}`).join(', ') + '.';
  }

  // A short spoken update now and then, only when the overall level changes band. Text always goes to the live region.
  _maybeNarrate() {
    const now = performance.now();
    if (now - this.lastSpoken < 9000) return;
    const lv = this.sonifier.level;
    const word = lv > 0.66 ? 'rising' : lv < 0.33 ? 'quiet' : 'steady';
    if (word === this.lastLevelWord) return;
    this.lastLevelWord = word; this.lastSpoken = now;
    $('dd-now').textContent = this._levelSentence();
  }

  _teardown() {
    this.pause();
    if (this.stage) this.stage.innerHTML = '';
    this.dispatchEvent(new Event('closed'));
  }
}
