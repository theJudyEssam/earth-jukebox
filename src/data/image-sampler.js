// Reads pixel colours from an equirectangular image (lon -180..180 left→right, lat 90..-90 top→bottom).
// NASA SVS frames, GIBS snapshots and the globe textures all use this projection, so one sampler serves
// the land/water mask today and the EIC data frames in phase 2.

export class ImageSampler {
  /** @param {string|HTMLImageElement|HTMLCanvasElement} source  @param {number} width  sampling resolution */
  constructor(source, width = 1024) {
    this.source = source;
    this.width = width;
    this.ready = this._load();
  }

  async _load() {
    let img = this.source;
    if (typeof img === 'string') {
      img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = this.source;
      await img.decode();
    }
    this.image = img;
    const w = this.width, h = Math.round(w / 2);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    this.w = w; this.h = h;
    this.data = ctx.getImageData(0, 0, w, h).data;
    return this;
  }

  /** [r, g, b] 0–255 at a lat/lon, or null before loading. */
  rgb(lat, lon) {
    if (!this.data) return null;
    const x = Math.min(this.w - 1, Math.max(0, Math.floor(((lon + 180) / 360) * this.w)));
    const y = Math.min(this.h - 1, Math.max(0, Math.floor(((90 - lat) / 180) * this.h)));
    const i = (y * this.w + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2]];
  }

  /** Perceived brightness 0–1. */
  luminance(lat, lon) {
    const c = this.rgb(lat, lon);
    return c ? (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255 : null;
  }
}

/**
 * Turn a colour back into a data value using a colorbar: an array of [r, g, b] stops, low → high.
 * Phase 2: build the stops by sampling an SVS colorbar PNG (e.g. the DYAMOND CO2 bar) left to right.
 * Returns 0–1 along the bar, or null if the colour is far from every stop (labels, land mask, etc.).
 */
export function invertColormap(rgb, stops, maxDistance = 60) {
  let best = -1, bestD = Infinity;
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i];
    const d = (s[0] - rgb[0]) ** 2 + (s[1] - rgb[1]) ** 2 + (s[2] - rgb[2]) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  if (Math.sqrt(bestD) > maxDistance) return null;
  return stops.length > 1 ? best / (stops.length - 1) : 0;
}
