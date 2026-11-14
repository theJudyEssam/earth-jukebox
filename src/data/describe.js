// Turns a lat/lon into words: "over the Sahara", "near Iceland", or "over open ocean".
import { PLACES } from './places.js';
import { distanceKm, formatCoords } from '../globe/geo.js';
import { surface } from './layers.js';

/** Best gazetteer match for a point, preferring small specific places over continents. */
export function placeAt(lat, lon) {
  let best = null, bestRatio = Infinity;
  for (const p of PLACES) {
    const d = distanceKm({ lat, lon }, p);
    // Small places win ties: divide by radius, nudge continents/oceans down.
    const ratio = d / p.radius * (p.kind === 'continent' || p.kind === 'ocean' ? 1.15 : 1);
    if (ratio < bestRatio) { bestRatio = ratio; best = p; }
  }
  if (!best) return { place: null, relation: 'over' };
  if (bestRatio <= 1) return { place: best, relation: 'over' };
  if (bestRatio <= 1.8) return { place: best, relation: 'near' };
  return { place: null, relation: 'over' };
}

export function describePoint(lat, lon) {
  const { place, relation } = placeAt(lat, lon);
  const cover = surface.cover(lat, lon);
  const water = surface.isWater(lat, lon);
  let title;
  if (place && relation === 'over') title = place.name;
  else if (place) title = `Near ${place.name}`;
  else title = water ? 'Open ocean' : 'Remote land';
  return {
    title: capitalise(title),
    place, relation, cover, water,
    coords: formatCoords(lat, lon),
    spokenCoords: formatCoords(lat, lon, { spoken: true }),
    sentence: `${relation === 'near' ? 'Near' : 'Over'} ${place ? place.name : (water ? 'open ocean' : 'remote land')}. ${capitalise(cover)} below. ${formatCoords(lat, lon, { spoken: true })}.`,
  };
}

const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);
