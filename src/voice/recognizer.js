// Thin wrapper around the Web Speech API (Chrome, Edge, Safari). Firefox has no recognition,
// so the app falls back to the typed command box, which uses the same parser.
//
// Events: 'state' {listening}, 'interim' {text}, 'final' {alternatives: string[]}, 'error' {code, message}

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

export class VoiceRecognizer extends EventTarget {
  constructor({ lang = navigator.language || 'en-US' } = {}) {
    super();
    this.supported = !!SR;
    this.active = false;   // user wants the mic on
    this.paused = false;   // temporarily off while we speak, so we don't hear ourselves
    this.running = false;
    this.lang = lang.startsWith('en') ? lang : 'en-US';
  }

  _create() {
    const r = new SR();
    r.lang = this.lang;
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 3;
    r.onstart = () => { this.running = true; };
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) {
          const alts = Array.from(res).map((a) => a.transcript.trim()).filter(Boolean);
          this._emit('interim', { text: '' });
          if (alts.length) this._emit('final', { alternatives: alts });
        } else {
          this._emit('interim', { text: res[0].transcript });
        }
      }
    };
    r.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      const messages = {
        'not-allowed': 'Microphone access was blocked. Allow the microphone in your browser\'s site settings, or type commands instead.',
        'service-not-allowed': 'Speech recognition is not allowed here. Open the app from localhost or https, or type commands instead.',
        'audio-capture': 'No microphone was found.',
        network: 'Speech recognition needs an internet connection in this browser. You can still type commands.',
      };
      if (['not-allowed', 'service-not-allowed', 'audio-capture'].includes(e.error)) this.active = false;
      this._emit('error', { code: e.error, message: messages[e.error] || `Voice error: ${e.error}` });
      this._emitState();
    };
    r.onend = () => {
      this.running = false;
      // Chrome ends sessions after silence; keep listening until the user turns it off.
      if (this.active && !this.paused) setTimeout(() => this._startEngine(), 250);
      else this._emitState();
    };
    return r;
  }

  _startEngine() {
    if (!this.supported || this.running || !this.active || this.paused) return;
    this.rec = this.rec || this._create();
    try { this.rec.start(); } catch { /* already started */ }
    this._emitState();
  }

  start() { if (!this.supported) return false; this.active = true; this.paused = false; this._startEngine(); return true; }
  stop() { this.active = false; this.paused = false; try { this.rec?.abort(); } catch {} this._emitState(); }
  toggle() { return this.active ? (this.stop(), false) : this.start(); }
  pause() { if (!this.active || this.paused) return; this.paused = true; try { this.rec?.abort(); } catch {} }
  resume() { if (!this.active || !this.paused) return; this.paused = false; this._startEngine(); }

  _emitState() { this._emit('state', { listening: this.active }); }
  _emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
}
