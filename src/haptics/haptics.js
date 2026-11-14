// HAPTICS OUTPUT HOOK (phase 3 plugs in here).
//
// The sonifier calls haptics.pulse(intensity, ms) in time with the music. Today that drives:
//   • navigator.vibrate on Android phones,
//   • an on-screen meter (so the rhythm is visible too),
//   • and, optionally, a USB/serial device via Web Serial (Chrome/Edge desktop).
// The serial protocol is one text line per pulse:  P <intensity 0-255> <duration ms>\n
// See hardware/README.md for a matching Arduino sketch for a vibration motor.

export class Haptics extends EventTarget {
  constructor() {
    super();
    this.enabled = true;
    this.canVibrate = typeof navigator.vibrate === 'function';
    this.canSerial = 'serial' in navigator;
    this.port = null;
    this.writer = null;
  }

  /** One tap. intensity 0–1, ms = how long. */
  pulse(intensity, ms = 60) {
    if (!this.enabled) return;
    const i = Math.max(0, Math.min(1, intensity));
    this.dispatchEvent(new CustomEvent('output', { detail: { intensity: i, ms } }));
    if (i <= 0.02) return;
    if (this.canVibrate) {
      try { navigator.vibrate(Math.round(ms * (0.4 + i * 0.6))); } catch { /* not allowed without a gesture */ }
    }
    this._serialWrite(`P ${Math.round(i * 255)} ${Math.round(ms)}\n`);
  }

  /** A sequence like [[0.3, 80], [0, 120], [0.9, 60]] — pairs of intensity and ms. */
  async pattern(steps) {
    for (const [i, ms] of steps) { this.pulse(i, ms); await new Promise((r) => setTimeout(r, ms)); }
  }

  stop() {
    if (this.canVibrate) try { navigator.vibrate(0); } catch {}
    this.dispatchEvent(new CustomEvent('output', { detail: { intensity: 0, ms: 0 } }));
    this._serialWrite('P 0 0\n');
  }

  async connectSerial() {
    if (!this.canSerial) throw new Error('Web Serial is not available in this browser.');
    this.port = await navigator.serial.requestPort();
    await this.port.open({ baudRate: 115200 });
    this.writer = this.port.writable.getWriter();
    return true;
  }

  get serialConnected() { return !!this.writer; }

  _serialWrite(line) {
    if (!this.writer) return;
    this.writer.write(new TextEncoder().encode(line)).catch(() => { this.writer = null; });
  }
}
