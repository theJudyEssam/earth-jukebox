// DATA LAYER HOOK (phase 2 plugs in here).
//
// A data layer answers one question: "what is the value at this lat/lon (at this time)?"
// The sonifier and haptics only ever talk to this interface, so swapping the demo layers below for
// real NASA EIC layers (CO2, lightning, aerosols…) needs no change to the globe, voice or audio code.
//
// interface DataLayer {
//   id: string; name: string;
//   description: string;            // read aloud by "describe the data"
//   mapping: string;                // plain-language "how it sounds", for accessibility and judges
//   units?: string;
//   load(): Promise<void>;
//   sample(lat, lon, t?): { value: number /* 0..1 */, raw?: number, label?: string, water?: boolean } | null;
//   overlay?: HTMLImageElement | HTMLCanvasElement;   // optional image draped on the globe
//   frames?: number; fps?: number;   // optional time axis for animated EIC sequences
//   setTime?(t: number): void;
// }

import { ImageSampler, invertColormap } from './image-sampler.js';

const TEX = './assets/textures/';

// Shared land/water mask from the specular map (water is bright there).
export const surface = {
  colour: new ImageSampler(TEX + 'earth_atmos_2048.jpg', 1024),
  water: new ImageSampler(TEX + 'earth_specular_2048.jpg', 1024),
  async load() { await Promise.all([this.colour.ready, this.water.ready]); },
  isWater(lat, lon) { const v = this.water.luminance(lat, lon); return v == null ? null : v > 0.45; },
  /** Rough land-cover word from the Blue Marble colour, for descriptions. */
  cover(lat, lon) {
    if (this.isWater(lat, lon)) return Math.abs(lat) > 66 ? 'sea ice or polar ocean' : 'ocean';
    const c = this.colour.rgb(lat, lon); if (!c) return 'land';
    const [r, g, b] = c; const lum = (r + g + b) / 3;
    if (lum > 200) return 'ice and snow';
    if (lum < 70) return 'dense forest';
    if (r > g * 1.08 && lum > 110) return 'desert or dry land';
    return 'mixed land';
  },
};

/** Demo layer 1: land vs ocean, with land brightness as the value. Placeholder until phase 2. */
class SurfaceDemoLayer {
  id = 'demo-surface';
  name = 'Land and ocean (demo)';
  description = 'A placeholder layer made from the Blue Marble image. Oceans wash in as surf; over land, bright deserts and ice play high notes and dark forests play low ones. Real NASA data arrives in phase 2.';
  mapping = 'Ocean: surf noise. Land: brighter ground gives higher pitch and a faster pulse.';
  async load() { await surface.load(); }
  sample(lat, lon) {
    const water = surface.isWater(lat, lon);
    if (water == null) return null;
    if (water) return { value: 0, water: true, label: 'ocean' };
    const v = surface.colour.luminance(lat, lon);
    return { value: Math.min(1, v * 1.4), water: false, label: surface.cover(lat, lon) };
  }
}

/** Demo layer 2: distance from the equator. Shows how a smooth global field sounds. */
class LatitudeDemoLayer {
  id = 'demo-latitude';
  name = 'Latitude (demo)';
  description = 'A synthetic layer: the value is highest at the equator and falls to zero at the poles. It is not real data; it shows how a smooth field like temperature will sound.';
  mapping = 'Higher pitch and faster pulse toward the equator, low and slow near the poles.';
  async load() { await surface.load(); }
  sample(lat, lon) {
    return { value: Math.cos((lat * Math.PI) / 180), water: !!surface.isWater(lat, lon), label: `${Math.round(Math.abs(lat))} degrees from the equator` };
  }
}

/**
 * Phase 2 template: a layer backed by an equirectangular EIC frame plus its colorbar.
 *   new ImageDataLayer({ id: 'co2', name: 'Carbon dioxide', url: 'data/co2/frame_0001.png',
 *                        colorbar: stopsFromColorbarPng, units: 'ppm', range: [400, 430] })
 */
export class ImageDataLayer {
  constructor({ id, name, url, colorbar, units = '', range = [0, 1], description = '', mapping = '' }) {
    Object.assign(this, { id, name, url, colorbar, units, range, description, mapping });
  }
  async load() {
    this.sampler = new ImageSampler(this.url, 1024);
    await this.sampler.ready;
    this.overlay = this.sampler.image;
  }
  sample(lat, lon) {
    const rgb = this.sampler?.rgb(lat, lon); if (!rgb) return null;
    const value = this.colorbar ? invertColormap(rgb, this.colorbar) : this.sampler.luminance(lat, lon);
    if (value == null) return null;
    const raw = this.range[0] + value * (this.range[1] - this.range[0]);
    return { value, raw, label: `${raw.toFixed(1)} ${this.units}`.trim() };
  }
}

export const LAYERS = [new SurfaceDemoLayer(), new LatitudeDemoLayer()];
