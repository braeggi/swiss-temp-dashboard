import { describe, expect, it } from 'vitest';
import { searchStations } from './PlacePicker';
import { clampDate } from './DateControl';
import type { StationIndexEntry } from '../types';

const mk = (abbr: string, name: string, canton: string): StationIndexEntry => ({
  abbr,
  name,
  canton,
  lat: 47,
  lon: 8,
  altitude: 400,
  source: 'smn',
  homogenised: false,
  fromYear: 1990,
  toYear: 2025,
});

const index = [
  mk('BAS', 'Basel / Binningen', 'BL'),
  mk('BUS', 'Buchs / Aarau', 'AG'),
  mk('SMA', 'Zürich / Fluntern', 'ZH'),
  mk('GRC', 'Grächen', 'VS'),
];

describe('searchStations', () => {
  it('matches on station name, case-insensitively', () => {
    expect(searchStations(index, 'aarau').map((s) => s.abbr)).toEqual(['BUS']);
  });

  it('matches on abbreviation', () => {
    expect(searchStations(index, 'sma').map((s) => s.abbr)).toEqual(['SMA']);
  });

  it('matches on canton', () => {
    expect(searchStations(index, 'VS').map((s) => s.abbr)).toEqual(['GRC']);
  });

  it('matches accented names typed without accents', () => {
    expect(searchStations(index, 'zurich').map((s) => s.abbr)).toEqual(['SMA']);
    expect(searchStations(index, 'grachen').map((s) => s.abbr)).toEqual(['GRC']);
  });

  it('prefers matches at the start of the name', () => {
    const got = searchStations([mk('X', 'Alt Basel', 'ZH'), mk('BAS', 'Basel', 'BL')], 'basel');
    expect(got[0].abbr).toBe('BAS');
  });

  it('returns an empty list for a blank query', () => {
    expect(searchStations(index, '   ')).toEqual([]);
  });

  it('honours the limit', () => {
    expect(searchStations(index, 'a', 2)).toHaveLength(2);
  });
});

describe('clampDate', () => {
  it('keeps a past date', () => {
    expect(clampDate('2020-01-15', '2026-07-30')).toBe('2020-01-15');
  });

  it('clamps a future date to today', () => {
    expect(clampDate('2030-01-01', '2026-07-30')).toBe('2026-07-30');
  });

  it('keeps today', () => {
    expect(clampDate('2026-07-30', '2026-07-30')).toBe('2026-07-30');
  });
});
