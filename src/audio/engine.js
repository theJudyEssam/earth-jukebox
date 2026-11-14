// Web Audio engine: interface sounds (earcons) and a live sonifier that listens to whatever data layer is
// active. Plain Web Audio keeps the app dependency-free and offline; Tone.js can slot in later if wanted.
//
// Sonification (phase 1 placeholder, same pipeline phase 2 will feed with real data):
//   three voices sample the data at the crosshair and to its west and east, panned left/centre/right;
//   value → pitch on an A minor pentatonic scale, value → filter brightness, value → pulse tempo;
//   water → surf noise. Each pulse is mirrored to the haptics output.

const SCALE = [0, 3, 5, 7, 10]; // minor pentatonic: never sounds wrong, whatever the data does
const BASE_MIDI = 45; // A2
const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
export function valueToHz(v, octaves = 3) {
  const steps = SCALE.length * octaves;
  const i = Math.round(Math.max(0, Math.min(1, v)) * (steps - 1));
  return midiToHz(BASE_MIDI + 12 * Math.floor(i / SCALE.length) + SCALE[i % SCALE.length]);
}

export class AudioEngine {
  constructor({ haptics } = {}) {
    this.haptics = haptics;
    this.ctx = null;
    this.volume = 0.7;
    this.playing = false;
    this.nextBeat = 0;
  }

  /** Must run inside (or after) a user gesture the first time. */
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      const ctx = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.volume;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.ratio.value = 4;
      this.master.connect(comp).connect(ctx.destination);
      this.reverb = this._makeReverb();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
  }

  /** Short interface sounds so blind users know a command landed. */
  earcon(kind) {
    const ctx = this.ensure(); if (!ctx) return;
    const seq = {
      listen: [[660, 0, 0.08], [880, 0.07, 0.1]],
      unlisten: [[880, 0, 0.08], [660, 0.07, 0.1]],
      ok: [[784, 0, 0.09]],
      error: [[220, 0, 0.12], [185, 0.11, 0.16]],
      arrive: [[523.25, 0, 0.5], [659.25, 0.08, 0.5], [783.99, 0.16, 0.6]],
    }[kind] || [];
    const t0 = ctx.currentTime + 0.01;
    for (const [f, at, dur] of seq) this._tone(f, t0 + at, dur, kind === 'error' ? 'square' : 'sine', kind === 'error' ? 0.06 : 0.12);
  }

  /** Start listening. sample() returns { voices: [{value, water, pan}], center: {value, water} }. */
  start(sample) {
    const ctx = this.ensure(); if (!ctx) return false;
    this.sample = sample;
    if (this.playing) return true;
    this.playing = true;
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.bus.gain.setTargetAtTime(1, ctx.currentTime, 0.4);
    this.bus.connect(this.master);
    this.bus.connect(this.reverb);
    this.voices = [-0.75, 0, 0.75].map((pan) => this._makeVoice(pan));
    this.surf = this._makeSurf();
    this.nextBeat = ctx.currentTime + 0.2;
    this._timer = setInterval(() => this._tick(), 90);
    this._tick();
    return true;
  }

  stop() {
    if (!this.playing) return;
    this.playing = false;
    clearInterval(this._timer);
    const { ctx, bus, voices, surf } = this;
    bus.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
    setTimeout(() => {
      voices.forEach((v) => v.oscs.forEach((o) => o.stop()));
      surf.src.stop(); surf.lfo.stop();
      bus.disconnect();
    }, 900);
    this.haptics?.stop();
  }

  _tick() {
    const { ctx } = this;
    const frame = this.sample?.();
    if (!frame) return;
    const now = ctx.currentTime;
    let waterCount = 0;
    frame.voices.forEach((s, i) => {
      const v = this.voices[i];
      const centre = i === 1;
      if (!s || s.water || s.value == null) {
        if (s?.water) waterCount++;
        v.gain.gain.setTargetAtTime(0, now, 0.25);
        return;
      }
      const hz = valueToHz(s.value) * (centre ? 1 : 0.5);
      v.oscs[0].frequency.setTargetAtTime(hz, now, 0.12);
      v.oscs[1].frequency.setTargetAtTime(hz * 2.003, now, 0.12);
      v.filter.frequency.setTargetAtTime(300 + s.value * 2600, now, 0.2);
      v.gain.gain.setTargetAtTime((centre ? 0.16 : 0.08) * (0.5 + 0.5 * s.value), now, 0.25);
    });
    this.surf.gain.gain.setTargetAtTime(0.22 * (waterCount / frame.voices.length), now, 0.4);

    // Pulse: tempo follows the centre value (50–150 bpm). Over water, a slow swell instead.
    const c = frame.center;
    if (now >= this.nextBeat - 0.02) {
      if (c && !c.water && c.value != null) {
        const bpm = 50 + c.value * 100;
        this._pluck(valueToHz(c.value) * 2, this.nextBeat);
        this.haptics?.pulse(0.25 + c.value * 0.75, 70);
        this.nextBeat += 60 / bpm;
      } else {
        this.haptics?.pulse(0.2, 260);
        this.nextBeat += 2.2;
      }
      if (this.nextBeat < now) this.nextBeat = now + 0.05;
    }
  }

  _makeVoice(panValue) {
    const ctx = this.ctx;
    const a = ctx.createOscillator(); a.type = 'triangle';
    const b = ctx.createOscillator(); b.type = 'sine';
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.Q.value = 0.7; filter.frequency.value = 800;
    const gain = ctx.createGain(); gain.gain.value = 0;
    const pan = ctx.createStereoPanner(); pan.pan.value = panValue;
    a.connect(filter); b.connect(filter); filter.connect(gain).connect(pan).connect(this.bus);
    a.start(); b.start();
    return { oscs: [a, b], filter, gain };
  }

  _makeSurf() {
    const ctx = this.ctx;
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; } // brown noise
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 700;
    const swell = ctx.createGain(); swell.gain.value = 0.6;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.11;
    const lfoAmt = ctx.createGain(); lfoAmt.gain.value = 0.4;
    lfo.connect(lfoAmt).connect(swell.gain);
    const gain = ctx.createGain(); gain.gain.value = 0;
    src.connect(filter).connect(swell).connect(gain).connect(this.bus);
    src.start(); lfo.start();
    return { src, lfo, gain };
  }

  _pluck(hz, when) {
    this._tone(hz, when, 0.35, 'triangle', 0.09, this.bus);
  }

  _tone(hz, when, dur, type = 'sine', peak = 0.1, dest = this.master) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = hz;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g).connect(dest);
    if (dest === this.master) g.connect(this.reverb);
    o.start(when); o.stop(when + dur + 0.05);
  }

  _makeReverb() {
    const ctx = this.ctx;
    const input = ctx.createGain();
    const conv = ctx.createConvolver();
    const len = ctx.sampleRate * 2.2, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    conv.buffer = ir;
    const wet = ctx.createGain(); wet.gain.value = 0.25;
    input.connect(conv).connect(wet).connect(this.master);
    return input;
  }
}
