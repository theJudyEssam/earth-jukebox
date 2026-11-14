// One sonifier per dataset. Each takes the analyzer's features ~10x a second and plays them.
// Design rules: stay on a pentatonic or modal scale (musical whatever the data does), map MORE to
// higher/louder/busier, keep every mapping explainable in one sentence (see datasets.js `mapping`),
// and mirror the beat to haptics.
import { valueToHz } from './engine.js';

/** Adapts to each video's own range so relative change is always audible. */
class AutoRange {
  constructor(floor = 1e-4) { this.min = Infinity; this.max = -Infinity; this.floor = floor; }
  norm(x) {
    this.min = Math.min(this.min * 0.999 + x * 0.001, x);
    this.max = Math.max(this.max * 0.998 + x * 0.002, x, this.min + this.floor);
    return Math.max(0, Math.min(1, (x - this.min) / (this.max - this.min)));
  }
}

export class Base {
  constructor(engine) {
    this.e = engine; this.ctx = engine.ctx; this.haptics = engine.haptics;
    this.out = this.ctx.createGain(); this.out.gain.value = 0;
    this.out.connect(engine.master); this.out.connect(engine.reverb);
    this.out.gain.setTargetAtTime(1, this.ctx.currentTime, 0.3);
    this.nodes = []; this.nextBeat = this.ctx.currentTime + 0.1;
    this.level = 0; // 0–1 summary, drives the UI meter and narration
    this.channels = {}; // name → 0–1, shown as meters in the pop-up
  }
  now() { return this.ctx.currentTime; }
  pad(type = 'triangle', pan = 0) {
    const ctx = this.ctx;
    const o1 = ctx.createOscillator(); o1.type = type;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.detune.value = 7;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600; f.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.value = 0;
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    o1.connect(f); o2.connect(f); f.connect(g).connect(p).connect(this.out);
    o1.start(); o2.start();
    this.nodes.push(o1, o2);
    return { o1, o2, f, g, p, set: (hz, gain, cutoff, t = 0.2) => {
      const n = this.now();
      o1.frequency.setTargetAtTime(hz, n, t); o2.frequency.setTargetAtTime(hz * 2, n, t);
      g.gain.setTargetAtTime(gain, n, t); if (cutoff) f.frequency.setTargetAtTime(cutoff, n, t);
    } };
  }
  noise({ type = 'lowpass', freq = 800, q = 0.7, brown = true, pan = 0 } = {}) {
    const ctx = this.ctx;
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w * 0.5; }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0;
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    src.connect(f).connect(g).connect(p).connect(this.out); src.start();
    this.nodes.push(src);
    return { f, g, p, set: (gain, t = 0.3) => g.gain.setTargetAtTime(gain, this.now(), t) };
  }
  hit({ when = this.now(), pan = 0, hz = 180, decay = 0.25, gain = 0.3, noisy = true }) {
    const ctx = this.ctx;
    const g = ctx.createGain(); const p = ctx.createStereoPanner(); p.pan.value = pan;
    g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(gain, when + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, when + decay);
    g.connect(p).connect(this.out);
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(hz * 2.2, when); o.frequency.exponentialRampToValueAtTime(hz, when + 0.06);
    o.connect(g); o.start(when); o.stop(when + decay + 0.05);
    if (noisy) {
      const len = Math.floor(ctx.sampleRate * 0.08), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const s = ctx.createBufferSource(); s.buffer = buf;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
      const ng = ctx.createGain(); ng.gain.value = 0.5;
      s.connect(hp).connect(ng).connect(g); s.start(when);
    }
  }
  pluck(hz, when = this.now(), gain = 0.12, pan = 0) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = hz;
    const g = ctx.createGain(); const p = ctx.createStereoPanner(); p.pan.value = pan;
    g.gain.setValueAtTime(0.0001, when); g.gain.exponentialRampToValueAtTime(gain, when + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, when + 0.6);
    o.connect(g).connect(p).connect(this.out); o.start(when); o.stop(when + 0.7);
  }
  stop() {
    const n = this.now();
    this.out.gain.setTargetAtTime(0, n, 0.15);
    setTimeout(() => { this.nodes.forEach((x) => { try { x.stop(); } catch {} }); this.out.disconnect(); }, 800);
    this.haptics?.stop();
  }
}

// CO₂: a breathing drone. Plume brightness → pitch + brightness; frame change → breathing swell.
class Co2 extends Base {
  constructor(e) { super(e); this.a = this.pad('sawtooth', -0.3); this.b = this.pad('triangle', 0.3); this.r = new AutoRange(); this.m = new AutoRange(); this.breath = 0; }
  update(f) {
    const v = this.r.norm(f.intensity * (0.4 + f.coverage));
    const motion = this.m.norm(f.motion);
    this.breath += 0.08 + motion * 0.25;
    const swell = 0.75 + 0.25 * Math.sin(this.breath);
    const hz = valueToHz(v, 2);
    this.a.set(hz, 0.09 * swell, 300 + v * 2200, 0.5);
    this.b.set(hz * 1.5, 0.06 * swell * v, 300 + v * 1800, 0.5);
    this.a.p.pan.setTargetAtTime(f.balance * 0.8, this.now(), 0.5);
    this.level = v; this.channels = { 'CO₂ plumes': v, 'Change': motion };
    if (this.now() >= this.nextBeat) { this.haptics?.pulse(0.2 + v * 0.7, 180); this.nextBeat = this.now() + 1.6 - v * 0.8; }
  }
}

// Lightning: flashes → drum hits, panned by position. Count → density.
class Lightning extends Base {
  constructor(e) { super(e); this.bed = this.noise({ freq: 220, brown: true }); this.r = new AutoRange(0.0005); }
  update(f) {
    const raw = f.bright + f.hues.yellow * 0.5 + f.hues.blue * 0.3;
    const v = this.r.norm(raw);
    this.level = v;
    const hits = Math.min(6, Math.round(v * 5 + (f.synthetic ? 0 : f.flashes.length * 0.15)));
    const t = this.now();
    for (let i = 0; i < hits; i++) {
      const x = f.flashes[i % Math.max(1, f.flashes.length)] ?? Math.random();
      this.hit({ when: t + Math.random() * 0.09, pan: x * 2 - 1, hz: 90 + Math.random() * 140, gain: 0.12 + v * 0.25, decay: 0.18 + Math.random() * 0.2 });
    }
    if (hits) this.haptics?.pulse(Math.min(1, 0.3 + hits * 0.12), 40);
    this.bed.set(0.03 + v * 0.07);
    this.channels = { Flashes: v };
  }
}

// Aerosols: four particle types, four instruments.
class Aerosols extends Base {
  constructor(e) {
    super(e);
    this.salt = this.noise({ freq: 900, brown: true, pan: -0.5 });            // sea salt: surf
    this.dust = this.noise({ type: 'bandpass', freq: 4500, q: 0.8, brown: false, pan: 0.4 }); // dust: sandy hiss
    this.smoke = this.pad('sawtooth', 0);                                       // smoke: low rumble
    this.sulf = this.pad('sine', 0.2);                                          // sulfates: glassy
    this.sulf2 = this.pad('sine', -0.2);
    this.rs = { blue: new AutoRange(), pink: new AutoRange(), orange: new AutoRange(), green: new AutoRange() };
  }
  update(f) {
    const n = (k) => this.rs[k].norm(f.hues[k]);
    const salt = n('blue'), dust = n('pink'), smoke = n('orange'), sulf = n('green');
    this.salt.set(0.25 * salt); this.dust.set(0.18 * dust);
    this.smoke.set(55 + smoke * 20, 0.12 * smoke, 180 + smoke * 300);
    this.sulf.set(valueToHz(0.55 + sulf * 0.3, 2), 0.06 * sulf, 3000); this.sulf2.set(valueToHz(0.75 + sulf * 0.2, 2), 0.04 * sulf, 3000);
    if (smoke > 0.3 && Math.random() < smoke * 0.5) this.hit({ hz: 60, gain: 0.05 * smoke, decay: 0.05, pan: Math.random() - 0.5 }); // crackle
    this.level = Math.max(salt, dust, smoke, sulf);
    this.channels = { 'Sea salt (blue)': salt, 'Dust (pink)': dust, 'Smoke (orange)': smoke, 'Sulfate (green)': sulf };
    if (this.now() >= this.nextBeat) { this.haptics?.pulse(0.2 + this.level * 0.6, 90); this.nextBeat = this.now() + 0.5; }
  }
}

// Forest height: taller (brighter green/white) → higher melody notes.
class Forest extends Base {
  constructor(e) { super(e); this.drone = this.pad('triangle', 0); this.r = new AutoRange(); this.c = new AutoRange(); }
  update(f) {
    const tall = this.r.norm(f.greenLum + f.bright * 2);
    const cover = this.c.norm(f.hues.green + f.hues.yellow * 0.5);
    this.drone.set(valueToHz(0.05, 2), 0.05 + cover * 0.05, 400 + cover * 800, 0.6);
    const t = this.now();
    if (t >= this.nextBeat) {
      const hz = valueToHz(tall, 3) * 2;
      this.pluck(hz, t, 0.06 + cover * 0.12, f.balance * 0.6);
      if (tall > 0.75) this.pluck(hz * 1.5, t + 0.12, 0.05, -f.balance * 0.6); // shimmer on tall canopy
      this.haptics?.pulse(0.2 + tall * 0.8, 60);
      this.nextBeat = t + 0.42 - cover * 0.18;
    }
    this.level = tall; this.channels = { 'Tree height': tall, 'Forest cover': cover };
  }
}

// Air quality: consonant → tense chord as pollution rises; pulse speeds up.
class AirQuality extends Base {
  constructor(e) { super(e); this.v = [this.pad('triangle', -0.4), this.pad('triangle', 0), this.pad('triangle', 0.4)]; this.r = new AutoRange(); }
  update(f) {
    const p = this.r.norm(f.intensity * f.coverage + f.hues.orange + f.hues.pink * 0.5);
    const root = 110;
    // Open fifth → minor → tritone/minor-second cluster as p rises.
    const third = p < 0.4 ? 1.5 : p < 0.75 ? 1.189 : 1.414;
    const top = p < 0.4 ? 2 : p < 0.75 ? 1.5 : 1.059 * 2;
    const g = 0.05 + p * 0.05;
    this.v[0].set(root, g, 500 + p * 1500); this.v[1].set(root * third, g, 500 + p * 1500); this.v[2].set(root * top, g * 0.8, 500 + p * 2000);
    this.v.forEach((x) => x.o2.detune.setTargetAtTime(7 + p * 30, this.now(), 0.3)); // roughness
    const t = this.now();
    if (t >= this.nextBeat) { this.hit({ hz: 55, gain: 0.1 + p * 0.15, decay: 0.3, noisy: false }); this.haptics?.pulse(0.3 + p * 0.7, 80); this.nextBeat = t + 1.1 - p * 0.75; }
    this.level = p; this.channels = { Pollution: p };
  }
}

// Atmospheric river: water vapour → swelling wave drone; bright cloud/rain → raindrops.
class River extends Base {
  constructor(e) { super(e); this.wave = this.noise({ freq: 500, brown: true }); this.drone = this.pad('sine', 0); this.r = new AutoRange(); this.b = new AutoRange(); this.phase = 0; }
  update(f) {
    const vapour = this.r.norm(f.hues.blue + f.intensity * 0.2);
    const rain = this.b.norm(f.bright);
    this.phase += 0.1 + vapour * 0.15;
    const swell = 0.6 + 0.4 * Math.sin(this.phase);
    this.wave.set((0.08 + vapour * 0.25) * swell, 0.4);
    this.wave.f.frequency.setTargetAtTime(300 + vapour * 900, this.now(), 0.4);
    this.drone.set(valueToHz(vapour * 0.6, 2) / 2, 0.05 + vapour * 0.06, 300 + vapour * 600, 0.6);
    const drops = Math.round(rain * 4 * Math.random());
    for (let i = 0; i < drops; i++) this.pluck(1600 + Math.random() * 1600, this.now() + Math.random() * 0.1, 0.03 + rain * 0.03, Math.random() * 2 - 1);
    if (this.now() >= this.nextBeat) { this.haptics?.pulse(0.15 + vapour * 0.6 * swell, 200); this.nextBeat = this.now() + 0.8; }
    this.level = vapour; this.channels = { 'Water vapour': vapour, 'Clouds and rain': rain };
  }
}

const MODES = { co2: Co2, lightning: Lightning, aerosols: Aerosols, forest: Forest, airquality: AirQuality, river: River };
export function createSonifier(mode, engine) { return new MODES[mode](engine); }
