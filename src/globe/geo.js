// Geography helpers shared by the globe, the narrator and the data layers.
import * as THREE from 'three';

const D2R = Math.PI / 180;

/** Matches three.js SphereGeometry UVs, so an equirectangular texture lines up: lon -180 at u=0. */
export function latLonToVector3(lat, lon, r = 1) {
  const la = lat * D2R, lo = lon * D2R;
  return new THREE.Vector3(r * Math.cos(la) * Math.cos(lo), r * Math.sin(la), -r * Math.cos(la) * Math.sin(lo));
}

export function vector3ToLatLon(v) {
  const r = v.length();
  return { lat: Math.asin(v.y / r) / D2R, lon: Math.atan2(-v.z, v.x) / D2R };
}

/** Great-circle distance in km. */
export function distanceKm(a, b) {
  return angularDistanceDeg(a, b) * D2R * 6371;
}

export function angularDistanceDeg(a, b) {
  const p1 = a.lat * D2R, p2 = b.lat * D2R, dl = (b.lon - a.lon) * D2R;
  const c = Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dl);
  return Math.acos(Math.max(-1, Math.min(1, c))) / D2R;
}

/** "23° N, 45° W" for display; spoken form spells out the words for screen readers and TTS. */
export function formatCoords(lat, lon, { spoken = false } = {}) {
  const la = Math.round(Math.abs(lat)), lo = Math.round(Math.abs(lon));
  const ns = lat >= 0 ? 'north' : 'south', ew = lon >= 0 ? 'east' : 'west';
  const deg = (n) => `${n} ${n === 1 ? 'degree' : 'degrees'}`;
  if (spoken) return `${deg(la)} ${la === 0 ? '' : ns}, ${deg(lo)} ${lo === 0 ? '' : ew}`.replace(/ ,/g, ',').trim();
  return `${la}° ${la === 0 ? '' : ns[0].toUpperCase()}, ${lo}° ${lo === 0 ? '' : ew[0].toUpperCase()}`.replace(/ ,/g, ',').trim();
}
