import { describe, expect, it } from 'vitest';
import { findHeatEpisodes, HEATWAVE_MIN_MEAN } from './heatEpisodes';
import { packRows, readDailyCsv } from './dailyCsv';
import { decodeValue } from './packed';
import { FIXTURES, fixtureText } from '../../tests/fixtures/paths';
import type { PackedStation } from '../types';

/** The trimmed Basel record, packed the way build-data.ts packs it. */
function baselStation(): PackedStation {
  const rows = readDailyCsv(fixtureText(FIXTURES.nbcnBasDaily), 'nbcn');
  return {
    abbr: 'BAS', name: 'Basel / Binningen', canton: 'BS',
    lat: 47.54, lon: 7.58, altitude: 316,
    source: 'nbcn', homogenised: true,
    ...packRows(rows),
  };
}

describe('findHeatEpisodes against the real Basel fixture', () => {
  it('contains six qualifying days but forms no episode', () => {
    // The fixture keeps 30 July of each year (plus the odd leap-day row), so
    // six days clear 25 °C yet none has a qualifying neighbour. An episode
    // here would mean the walk treats a 365-day jump as adjacency.
    const st = baselStation();
    const qualifying = st.mean
      .map(decodeValue)
      .filter((v): v is number => v !== null && v >= HEATWAVE_MIN_MEAN);

    expect(qualifying).toHaveLength(6);
    expect(Math.max(...qualifying)).toBe(26.8); // 30 July 1947, per the README
    expect(findHeatEpisodes(st)).toEqual([]);
  });

  it('spans the record the other fixture tests rely on', () => {
    // Guards the fixture itself: if its shape drifts, the count above stops
    // meaning anything.
    const st = baselStation();
    expect(st.fromYear).toBe(1864);
    expect(st.toYear).toBe(2025);
    expect(st.mean.length % 366).toBe(0);
  });
});
