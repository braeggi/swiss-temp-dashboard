import { describe, expect, it } from 'vitest';
import { resolveGeocoded, resolveStation } from './resolvePlace';
import type { StationIndexEntry } from '../types';

const bas: StationIndexEntry = {
  abbr: 'BAS',
  name: 'Basel / Binningen',
  canton: 'BL',
  lat: 47.541142,
  lon: 7.583525,
  altitude: 316,
  source: 'nbcn',
  homogenised: true,
  fromYear: 1864,
  toYear: 2025,
};

const bus: StationIndexEntry = {
  abbr: 'BUS',
  name: 'Buchs / Aarau',
  canton: 'AG',
  lat: 47.384381,
  lon: 8.07955,
  altitude: 387,
  source: 'smn',
  homogenised: false,
  fromYear: 1984,
  toYear: 2025,
};

const all = [bas, bus];

describe('resolveStation', () => {
  it('uses a homogenised station for both slots without a caveat about homogenisation', () => {
    const plan = resolveStation(bas);
    expect(plan.historyStation?.abbr).toBe('BAS');
    expect(plan.liveStation?.abbr).toBe('BAS');
    expect(plan.liveDistanceKm).toBeCloseTo(0, 3);
    expect(plan.caveats.join(' ')).not.toMatch(/not homogenised/i);
  });

  it('warns that a raw SMN series is not homogenised', () => {
    const plan = resolveStation(bus);
    expect(plan.caveats.join(' ')).toMatch(/not homogenised/i);
  });

  it('labels the plan with the station name', () => {
    expect(resolveStation(bus).label).toBe('Buchs / Aarau');
  });
});

describe('resolveGeocoded', () => {
  it('attaches the nearest station within 15 km and discloses the distance', () => {
    const plan = resolveGeocoded({ name: 'Aarau', lat: 47.39254, lon: 8.04422 }, all);
    expect(plan.label).toBe('Aarau');
    expect(plan.historyStation?.abbr).toBe('BUS');
    expect(plan.liveStation?.abbr).toBe('BUS');
    expect(plan.liveDistanceKm).toBeCloseTo(2.8, 1);
    expect(plan.caveats.join(' ')).toMatch(/Buchs \/ Aarau/);
    expect(plan.caveats.join(' ')).toMatch(/km/);
  });

  it('falls back to no station when nothing is within 15 km', () => {
    // Zermatt is far from both fixtures.
    const plan = resolveGeocoded({ name: 'Zermatt', lat: 46.0207, lon: 7.7491 }, all);
    expect(plan.historyStation).toBeNull();
    expect(plan.liveStation).toBeNull();
    expect(plan.caveats.join(' ')).toMatch(/Open-Meteo/);
    expect(plan.caveats.join(' ')).toMatch(/1940/);
  });
});
