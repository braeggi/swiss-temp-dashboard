import type { StationIndexEntry } from '../types';

export interface LatLon {
  lat: number;
  lon: number;
}

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export function haversineKm(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function nearestStation(
  stations: StationIndexEntry[],
  to: LatLon,
): { station: StationIndexEntry; km: number } | null {
  let best: { station: StationIndexEntry; km: number } | null = null;
  for (const s of stations) {
    const km = haversineKm(to, s);
    if (best === null || km < best.km) best = { station: s, km };
  }
  return best;
}
