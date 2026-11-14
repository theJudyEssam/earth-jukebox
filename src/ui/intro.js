// The opening: a ~1 minute narrated journey that teaches the sound language of Earth Jukebox.
// Each scene flies the camera somewhere, says one or two sentences (spoken + caption + screen reader),
// and adds one instrument to a score that keeps building. Skippable at any moment (button, Esc, "skip").
import { Base } from '../audio/sonifiers.js';
import { valueToHz } from '../audio/engine.js';
import { readPref, writePref } from './narrator.js';

const $ = (id) => document.getElementById(id);

const SCENES = [
  { at: { lat: 15, lon: -20, distance: 5.6 }, layers: ['space'], dwell: 6000, haptic: [[0.2, 400]],
    text: 'This is Earth. Our home, seen from space. Everything you see on this globe can also be heard.' },
  { at: { lat: 0, lon: -150, distance: 3.0 }, layers: ['space', 'ocean'], dwell: 6500, haptic: [[0.25, 300], [0, 500], [0.35, 300]],
    text: 'Oceans cover seventy-one percent of the planet. Here, water sounds like surf, rising and falling like waves.' },
  { at: { lat: -4, lon: -62, distance: 2.0 }, layers: ['space', 'ocean', 'forest'], dwell: 6500, haptic: [[0.4, 60], [0, 200], [0.6, 60], [0, 200], [0.8, 60]],
    text: 'Forests breathe. Over the Amazon, the tallest trees play the highest notes.' },
  { at: { lat: -1, lon: 22, distance: 2.0 }, layers: ['space', 'ocean', 'forest', 'storms'], dwell: 6500, haptic: [[1, 40], [0, 120], [0.7, 40], [0, 80], [1, 40]],
    text: 'Storms crackle. Over the Congo, every lightning flash becomes a drum.' },
  { at: { lat: 72, lon: -40, distance: 2.1 }, layers: ['space', 'ocean', 'forest', 'storms', 'ice'], dwell: 6500, haptic: [[0.3, 500]],
    text: 'Ice is changing. Greenland loses hundreds of billions of tonnes of it every year. Change has a sound too.' },
  { at: { lat: 20, lon: 10, distance: 3.4 }, layers: ['space', 'ocean', 'forest', 'storms', 'ice', 'finale'], dwell: 7000, haptic: [[0.5, 200], [0, 100], [0.8, 200], [0, 100], [1, 400]],
    text: 'Together, they are the music of a living planet, made from NASA data.' },
];

class IntroScore extends Base {
  constructor(engine) {
    super(engine);
    this.layers = new Set();
    this.pads = [this.pad('triangle', -0.3), this.pad('sine', 0.3), this.pad('triangle', 0)];
    this.surf = this.noise({ freq: 650, brown: true });
    this.glassA = this.pad('sine', -0.6); this.glassB = this.pad('sine', 0.6);
    this.step = 0; this.phase = 0; this.next = this.now();
    this.timer = setInterval(() => this.tick(), 120);
  }
  set(layers) { this.layers = new Set(layers); }
  tick() {
    const L = this.layers, t = this.now();
    this.phase += 0.12;
    // Space: an A-minor drone that opens up as more layers join.
    const open = Math.min(1, L.size / 5);
    this.pads[0].set(valueToHz(0, 2) / 2, 0.07, 300 + open * 900, 1.2);   // A1
    this.pads[1].set(valueToHz(0.36, 2) / 2, 0.05, 300 + open * 900, 1.2); // E2
    this.pads[2].set(valueToHz(0.55, 2) / 2, L.has('finale') ? 0.06 : 0.0, 1200, 1.5);
    // Ocean: swelling surf.
    this.surf.set(L.has('ocean') ? 0.16 * (0.55 + 0.45 * Math.sin(this.phase * 0.5)) : 0, 0.6);
    // Ice: two slow glassy tones a fifth apart, beating gently.
    const ice = L.has('ice') ? 0.035 : 0;
    this.glassA.set(valueToHz(0.82, 3), ice, 4000, 1.5); this.glassB.set(valueToHz(0.82, 3) * 1.5 * 1.003, ice, 4000, 1.5);
    if (t < this.next) return;
    const beat = L.has('finale') ? 0.3 : 0.42;
    this.next = t + beat;
    this.step++;
    // Forest: a climbing and falling pentatonic melody.
    if (L.has('forest')) {
      const melody = [0.2, 0.4, 0.6, 0.8, 0.6, 0.5, 0.3, 0.45];
      this.pluck(valueToHz(melody[this.step % melody.length], 3) * 2, t, 0.08, Math.sin(this.step) * 0.4);
    }
    // Storms: kick on the one, random panned crackles.
    if (L.has('storms')) {
      if (this.step % 4 === 0) { this.hit({ when: t, hz: 60, gain: 0.25, decay: 0.35, noisy: false }); this.haptics?.pulse(0.7, 40); }
      if (Math.random() < 0.55) this.hit({ when: t + Math.random() * 0.15, pan: Math.random() * 2 - 1, hz: 120 + Math.random() * 160, gain: 0.12, decay: 0.15 });
    }
  }
  stop() { clearInterval(this.timer); super.stop(); }
}

export class Intro extends EventTarget {
  constructor({ globe, audio, narrator, haptics }) {
    super();
    Object.assign(this, { globe, audio, narrator, haptics });
    this.running = false;
    this.run = 0;
    $('intro-begin').addEventListener('click', () => this.start());
    $('intro-skip-start').addEventListener('click', () => this.dismiss('skip'));
    $('intro-skip').addEventListener('click', () => this.skip());
    $('intro-again').addEventListener('click', () => this.start());
  }

  /** Show the welcome screen. Its button gives the browser the click it needs before any sound. */
  offer() {
    const d = $('intro-welcome');
    if (readPref('introSeen', false)) $('intro-welcome-sub').textContent = 'Welcome back. Hear the one-minute introduction again, or go straight to the globe.';
    d.showModal();
    $('intro-begin').focus();
    d.addEventListener('cancel', (e) => { e.preventDefault(); this.dismiss('skip'); }, { once: true });
  }

  dismiss(reason) {
    const d = $('intro-welcome');
    if (d.open) d.close();
    if (reason === 'skip') { this.audio.ensure(); this.dispatchEvent(new CustomEvent('done', { detail: { skipped: true } })); }
  }

  async start() {
    if (this.running) return;
    this.dismiss();
    if (!this.audio.ensure()) return this.dispatchEvent(new CustomEvent('done', { detail: { skipped: true } }));
    const run = ++this.run;
    this.running = true;
    document.body.classList.add('intro-on');
    $('intro-bar').hidden = false;
    $('intro-skip').focus();
    this.dispatchEvent(new Event('start'));
    this.score = new IntroScore(this.audio);
    this.globe.setMarker(null);
    // Begin far out, then glide in.
    await this.globe.flyTo(SCENES[0].at.lat, SCENES[0].at.lon, { distance: 6, duration: 0 });
    for (let i = 0; i < SCENES.length; i++) {
      if (run !== this.run) return;
      const s = SCENES[i];
      this._progress(i);
      this.score.set(s.layers);
      this.haptics.pattern(s.haptic);
      const fly = this.globe.flyTo(s.at.lat, s.at.lon, { distance: s.at.distance, duration: i === 0 ? 5000 : 2600 });
      const talk = this.narrator.say(s.text, { clip: (await this._hasClips()) ? `assets/voice/intro-${i + 1}.mp3` : null });
      const dwell = new Promise((r) => setTimeout(r, s.dwell));
      await Promise.all([fly, talk, dwell]);
    }
    if (run !== this.run) return;
    this._finish(false);
  }

  skip() {
    if (!this.running) return;
    this.narrator.stopSpeaking();
    this.globe.flyTo(20, 0, { distance: 3.2, duration: 900 });
    this._finish(true);
  }

  _finish(skipped) {
    this.run++;
    this.running = false;
    this.score?.stop(); this.score = null;
    document.body.classList.remove('intro-on');
    $('intro-bar').hidden = true;
    writePref('introSeen', true);
    this.dispatchEvent(new CustomEvent('done', { detail: { skipped } }));
  }

  /** Recorded voice-over is used if assets/voice/intro-1.mp3 … intro-6.mp3 exist; otherwise browser speech. */
  _hasClips() {
    this._clips ??= fetch('assets/voice/intro-1.mp3', { method: 'HEAD' }).then((r) => r.ok && /audio|mpeg|octet/.test(r.headers.get('content-type') || '')).catch(() => false);
    return this._clips;
  }

  _progress(i) {
    const bar = $('intro-progress');
    bar.style.width = `${Math.round(((i + 1) / SCENES.length) * 100)}%`;
    $('intro-step').textContent = `Part ${i + 1} of ${SCENES.length}`;
  }
}
