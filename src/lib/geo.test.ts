import { describe, expect, it } from 'vitest';
import { haversineKm, nearestStation } from './geo';
import type { StationIndexEntry } from '../types';

const entry = (abbr: string, lat: number, lon: number): StationIndexEntry => ({
  abbr,
  name: abbr,
  canton: 'ZH',
  lat,
  lon,
  altitude: 400,
  source: 'smn',
  homogenised: false,
  fromYear: 1990,
  toYear: 2025,
});

describe('haversineKm', () => {
  it('is zero for identical points', () => {
    expect(haversineKm({ lat: 47, lon: 8 }, { lat: 47, lon: 8 })).toBeCloseTo(0, 6);
  });

  it('measures Aarau to Buchs/Aarau at about 2.8 km', () => {
    // Aarau 47.39254, 8.04422 (geocoder); BUS station 47.384381, 8.07955 (metadata).
    const km = haversineKm(
      { lat: 47.39254, lon: 8.04422 },
      { lat: 47.384381, lon: 8.07955 },
    );
    expect(km).toBeCloseTo(2.81, 1);
  });

  it('measures Zurich to Bern at roughly 95 km', () => {
    const km = haversineKm({ lat: 47.3769, lon: 8.5417 }, { lat: 46.948, lon: 7.4474 });
    expect(km).toBeGreaterThan(90);
    expect(km).toBeLessThan(102);
  });
});

describe('nearestStation', () => {
  it('returns null for an empty list', () => {
    expect(nearestStation([], { lat: 47, lon: 8 })).toBeNull();
  });

  it('picks the closest station and reports the distance', () => {
    const got = nearestStation(
      [entry('FAR', 46, 7), entry('NEAR', 47.01, 8.01)],
      { lat: 47, lon: 8 },
    )!;
    expect(got.station.abbr).toBe('NEAR');
    expect(got.km).toBeLessThan(2);
  });
});
