// Computer vision for sonification: reads the pixels of the NASA frame on screen (video or still) and
// turns them into a handful of numbers the sonifiers play. Runs ~10 times a second on a small copy.
//
// If the browser can't read the pixels (remote media without CORS), `readable` is false and the
// caller falls back to approximate values. Mirror the media with tools/fetch_svs.py to avoid that.

const W = 192, H = 108;

export class FrameAnalyzer {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.prevLum = null;
    this.readable = null; // unknown until the first read
  }

  /**
   * @param {HTMLVideoElement|HTMLImageElement} el
   * @param {{x0?: number, x1?: number}} window  horizontal slice (0–1) to analyse; for scanning stills
   * @returns features or null if unreadable
   */
  analyze(el, { x0 = 0, x1 = 1 } = {}) {
    const ready = el instanceof HTMLVideoElement ? el.readyState >= 2 : el.complete && el.naturalWidth > 0;
    if (!ready) return null;
    let data;
    try {
      this.ctx.drawImage(el, 0, 0, W, H);
      data = this.ctx.getImageData(0, 0, W, H).data;
      this.readable = true;
    } catch {
      this.readable = false; // tainted canvas: cross-origin pixels
      return null;
    }

    const xa = Math.floor(x0 * W), xb = Math.max(xa + 1, Math.ceil(x1 * W));
    const cols = new Float32Array(16);
    const colCount = new Float32Array(16);
    const hue = { blue: 0, pink: 0, orange: 0, green: 0, yellow: 0 };
    let n = 0, dataPx = 0, intensity = 0, bright = 0, left = 0, right = 0, greenLum = 0, motion = 0;
    const flashes = [];
    const lum = new Float32Array(W * H);

    for (let y = 0; y < H; y++) {
      for (let x = xa; x < xb; x++) {
        const i = (y * W + x) * 4;
        const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const v = max, s = max ? (max - min) / max : 0;
        const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        lum[y * W + x] = L;
        if (this.prevLum) motion += Math.abs(L - this.prevLum[y * W + x]);
        n++;
        if (v > 0.82 && s < 0.3) {
          bright++;
          if (flashes.length < 24 && Math.random() < 0.25) flashes.push((x - xa) / (xb - xa));
        }
        if (s < 0.3 || v < 0.22) continue; // background, land texture, labels
        dataPx++;
        const k = v * s;
        intensity += k;
        const h = hueOf(r, g, b, max, min);
        if (h >= 185 && h < 255) hue.blue += k;
        else if (h >= 275 && h < 345) hue.pink += k;
        else if (h >= 345 || h < 40) hue.orange += k;
        else if (h >= 40 && h < 70) hue.yellow += k;
        else if (h >= 70 && h < 170) { hue.green += k; greenLum += L; }
        const c = Math.min(15, Math.floor(((x - xa) / (xb - xa)) * 16));
        cols[c] += k; colCount[c]++;
        if (x - xa < (xb - xa) / 2) left += k; else right += k;
      }
    }
    this.prevLum = lum;
    const total = hue.blue + hue.pink + hue.orange + hue.green + hue.yellow || 1;
    for (let c = 0; c < 16; c++) cols[c] = colCount[c] ? cols[c] / colCount[c] : 0;
    return {
      coverage: dataPx / n,                         // how much of the frame is coloured data
      intensity: dataPx ? intensity / dataPx : 0,   // how strong that colour is
      bright: bright / n,                           // white/near-white pixels: flashes, clouds, tall canopy
      hues: Object.fromEntries(Object.entries(hue).map(([k, v]) => [k, v / n])), // share of frame per colour
      hueMix: Object.fromEntries(Object.entries(hue).map(([k, v]) => [k, v / total])), // share of data per colour
      greenLum: hue.green ? greenLum / Math.max(1, dataPx) : 0,
      balance: (right - left) / ((right + left) || 1), // -1 left … +1 right
      motion: this.prevLum ? motion / n : 0,
      columns: Array.from(cols),
      flashes,
    };
  }

  reset() { this.prevLum = null; }
}

function hueOf(r, g, b, max, min) {
  const d = max - min; if (!d) return 0;
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

/** Fake but plausible features from a 0–1 level, for when pixels can't be read. Labelled in the UI. */
export function syntheticFeatures(level, t) {
  const wobble = 0.5 + 0.5 * Math.sin(t * 0.7) * Math.sin(t * 0.23 + 1);
  const v = Math.max(0, Math.min(1, level * (0.75 + 0.5 * wobble)));
  const flashes = [];
  const count = Math.round(v * 6 * Math.random());
  for (let i = 0; i < count; i++) flashes.push(Math.random());
  return {
    coverage: v * 0.6, intensity: v, bright: v * 0.02 * Math.random(),
    hues: { blue: v * 0.2, pink: v * 0.2, orange: v * 0.2, green: v * 0.2, yellow: 0 },
    hueMix: { blue: 0.25, pink: 0.25, orange: 0.25, green: 0.25, yellow: 0 },
    greenLum: v * 0.6, balance: Math.sin(t * 0.3) * 0.5, motion: 0.01 + wobble * 0.02,
    columns: Array.from({ length: 16 }, (_, i) => v * (0.6 + 0.4 * Math.sin(i + t))),
    flashes, synthetic: true,
  };
}
