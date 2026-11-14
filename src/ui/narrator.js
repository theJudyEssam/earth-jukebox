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
  }

  /** @param {string} text  @param {{speak?: boolean, urgent?: boolean, kind?: 'system'|'error'}} opts */
  say(text, { speak = true, urgent = false, kind = 'system' } = {}) {
    const region = urgent ? this.assertive : this.live;
    region.textContent = '';
    // A fresh text node after a tick makes screen readers announce repeated messages too.
    setTimeout(() => { region.textContent = text; }, 30);
    this._caption(text);
    this._log(text, kind);
    if (speak && this.speakAloud) this._speak(text);
  }

  user(text) { this._log(text, 'user'); }

  setSpeak(on) {
    this.speakAloud = on;
    writePref('speak', on);
    if (!on) this.synth?.cancel();
  }

  stopSpeaking() { this.synth?.cancel(); }

  _speak(text) {
    if (!this.synth) return;
    this.synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.02;
    u.pitch = 1;
    const voice = this.synth.getVoices().find((v) => /en[-_]/i.test(v.lang) && /natural|neural|google|samantha|aria|jenny/i.test(v.name));
    if (voice) u.voice = voice;
    u.onstart = () => this.onSpeakStart();
    u.onend = u.onerror = () => this.onSpeakEnd();
    this.synth.speak(u);
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
