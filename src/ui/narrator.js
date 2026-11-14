// Every response goes three ways: the screen-reader live region, an on-screen caption (for deaf and
// hard-of-hearing users), and optional speech synthesis. The visible log is not a live region, so
// screen readers don't read things twice.

export class Narrator {
  constructor({ live, assertive, caption, log }) {
    Object.assign(this, { live, assertive, caption, log });
    this.speakAloud = readPref('speak', true);
    this.synth = window.speechSynthesis;
    this.onSpeakStart = () => {};
    this.onSpeakEnd = () => {};
    this._captionTimer = 0;
    this.voices = [];
    this.voiceName = readPref('voice', '');
    this.rate = readPref('rate', 0.95);
    if (this.synth) {
      const load = () => { this.voices = rankVoices(this.synth.getVoices()); this.onVoices?.(this.voices); };
      load();
      this.synth.addEventListener?.('voiceschanged', load);
    }
  }

  /** The chosen voice, or the most natural-sounding English one available. */
  get voice() {
    return this.voices.find((v) => v.name === this.voiceName) || this.voices[0] || null;
  }

  setVoice(name) { this.voiceName = name; writePref('voice', name); }
  setRate(r) { this.rate = r; writePref('rate', r); }

  /** @param {string} text  @param {{speak?: boolean, urgent?: boolean, kind?: 'system'|'error'}} opts */
  say(text, { speak = true, urgent = false, kind = 'system', clip = null } = {}) {
    const region = urgent ? this.assertive : this.live;
    region.textContent = '';
    // A fresh text node after a tick makes screen readers announce repeated messages too.
    setTimeout(() => { region.textContent = text; }, 30);
    this._caption(text);
    this._log(text, kind);
    if (speak && this.speakAloud) return clip ? this._playClip(clip, text) : this._speak(text);
    // Not speaking: resolve after a comfortable reading time so timed sequences (the intro) still pace well.
    return new Promise((r) => setTimeout(r, Math.max(3000, text.split(/\s+/).length * 330)));
  }

  user(text) { this._log(text, 'user'); }

  setSpeak(on) {
    this.speakAloud = on;
    writePref('speak', on);
    if (!on) this.synth?.cancel();
  }

  stopSpeaking() { this.synth?.cancel(); this.clipEl?.pause(); this.speaking = false; }

  /** Speaks and resolves when finished (or after a safety timeout if the browser never says so). */
  _speak(text) {
    if (!this.synth) return Promise.resolve();
    this.synth.cancel();
    this.lastSpokenText = text;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = this.rate;
    u.pitch = 1;
    if (!this.voices.length) this.voices = rankVoices(this.synth.getVoices());
    const voice = this.voice;
    if (voice) { u.voice = voice; u.lang = voice.lang; }
    return new Promise((resolve) => {
      const safety = setTimeout(done, text.length * 110 + 4000);
      function done() { clearTimeout(safety); resolve(); }
      u.onstart = () => { this.speaking = true; this.onSpeakStart(); };
      u.onend = u.onerror = () => { this.speaking = false; this.lastSpeakEnd = performance.now(); this.onSpeakEnd(); done(); };
      this.synth.speak(u);
    });
  }

  /** A recorded human voice-over (e.g. assets/voice/intro-1.mp3). Falls back to speech if the file is missing. */
  _playClip(src, text) {
    this.synth?.cancel();
    this.clipEl?.pause();
    const a = new Audio(src);
    this.clipEl = a;
    return new Promise((resolve) => {
      a.onplay = () => { this.speaking = true; this.onSpeakStart(); };
      a.onended = () => { this.speaking = false; this.onSpeakEnd(); resolve(); };
      a.onpause = () => { if (!a.ended) { this.speaking = false; this.onSpeakEnd(); resolve(); } };
      a.onerror = () => resolve(this._speak(text));
      a.play().catch(() => resolve(this._speak(text)));
    });
  }

  _caption(text) {
    if (!this.caption) return;
    this.caption.textContent = text;
    this.caption.classList.add('show');
    clearTimeout(this._captionTimer);
    this._captionTimer = setTimeout(() => this.caption.classList.remove('show'), Math.max(3500, text.length * 70));
  }

  _log(text, kind) {
    if (!this.log) return;
    const li = document.createElement('li');
    li.className = kind;
    li.textContent = kind === 'user' ? `“${text}”` : text;
    this.log.append(li);
    while (this.log.children.length > 40) this.log.firstChild.remove();
    this.log.scrollTop = this.log.scrollHeight;
  }
}

export function readPref(key, fallback) {
  try { const v = localStorage.getItem('ej:' + key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
}
export function writePref(key, value) {
  try { localStorage.setItem('ej:' + key, JSON.stringify(value)); } catch { /* private mode */ }
}

/**
 * Best voices first. Browser voices vary a lot: Edge's "Online (Natural)" voices and Chrome's Google voices
 * sound human; the old Windows desktop voices (David, Zira) are the robotic ones.
 */
export function rankVoices(list) {
  const score = (v) => {
    const n = v.name;
    let s = 0;
    if (/^en/i.test(v.lang)) s += 100; else return -1;
    if (/natural/i.test(n)) s += 60;          // Microsoft Edge online neural voices
    if (/neural|premium|enhanced/i.test(n)) s += 50; // macOS/iOS enhanced voices
    if (/google/i.test(n)) s += 40;           // Chrome's network voices
    if (/aria|jenny|guy|sonia|libby|ava|emma|andrew|brian|samantha|daniel|serena/i.test(n)) s += 15;
    if (/en[-_]US/i.test(v.lang)) s += 5;
    if (/david|zira|mark|hazel|desktop/i.test(n)) s -= 40; // older, robotic Windows voices
    if (v.localService === false) s += 5;
    return s;
  };
  return list.filter((v) => score(v) >= 0).sort((a, b) => score(b) - score(a));
}
