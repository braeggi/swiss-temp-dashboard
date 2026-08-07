import { describe, expect, it } from 'vitest';
import { MIN_YEARS_FOR_SHIFT, WINDOW_YEARS, frequencyShift } from './returnPeriod';
import { SLOTS_PER_YEAR, allocateSeries, encodeValue } from './packed';
import type { PackedStation } from '../types';

/**
 * A station whose every day is either warm or cool, with the number of warm days
 * per year chosen by the caller. `coveredSlots` below 330 makes a year
 * incomplete, which is how the completeness rule gets exercised.
 */
function station(
  fromYear: number,
  toYear: number,
  warmDaysPerYear: (year: number) => number,
  coveredSlots = SLOTS_PER_YEAR,
): PackedStation {
  const mean = allocateSeries(fromYear, toYear);
  for (let y = fromYear; y <= toYear; y++) {
    const warm = warmDaysPerYear(y);
    for (let s = 0; s < coveredSlots; s++) {
      mean[(y - fromYear) * SLOTS_PER_YEAR + s] = encodeValue(s < warm ? 25 : 5);
    }
  }
  return {
    abbr: 'TST', name: 'Test', canton: 'ZH', lat: 47, lon: 8, altitude: 400,
    source: 'smn', homogenised: false, fromYear, toYear,
    mean, max: [...mean], min: [...mean],
  };
}

describe('frequencyShift', () => {
  it('compares the first and last complete windows, naming their years', () => {
    // 1900-1929: 2 warm days a year. 1930-1969: irrelevant middle.
    // 1970-1999: 10 warm days a year.
    const st = station(1900, 1999, (y) => (y < 1930 ? 2 : y >= 1970 ? 10 : 6));
    const shift = frequencyShift(st, 'mean', 20, 'warm');

    expect(shift).not.toBeNull();
    expect(shift!.early).toMatchObject({ fromYear: 1900, toYear: 1929, years: WINDOW_YEARS, perYear: 2 });
    expect(shift!.recent).toMatchObject({ fromYear: 1970, toYear: 1999, years: WINDOW_YEARS, perYear: 10 });
    expect(shift!.factor).toBe(5);
  });

  it('counts days at or below the threshold in the cool direction', () => {
    // Warm days are 25 °C, cool days 5 °C. A cool-direction count at 10 °C
    // therefore picks up the days the warm count ignores.
    const st = station(1900, 1999, (y) => (y < 1930 ? 6 : 300));
    const shift = frequencyShift(st, 'mean', 10, 'cool');

    expect(shift!.early.perYear).toBe(SLOTS_PER_YEAR - 6);
    expect(shift!.recent.perYear).toBe(SLOTS_PER_YEAR - 300);
    // Frost becoming rarer is a fall, not a rise — the factor must say so.
    expect(shift!.factor).toBeLessThan(1);
  });

  it('refuses to report on a record shorter than two full windows', () => {
    const short = station(1970, 1970 + MIN_YEARS_FOR_SHIFT - 2, () => 5);
    expect(frequencyShift(short, 'mean', 20, 'warm')).toBeNull();
  });

  it('reports on a record exactly two windows long', () => {
    const exact = station(1970, 1970 + MIN_YEARS_FOR_SHIFT - 1, () => 5);
    const shift = frequencyShift(exact, 'mean', 20, 'warm');
    expect(shift).not.toBeNull();
    // The windows must abut, never overlap — otherwise the same years would be
    // counted on both sides and the comparison would be against itself.
    expect(shift!.early.toYear).toBeLessThan(shift!.recent.fromYear);
  });

  it('skips incomplete years rather than reading them as cool', () => {
    // A year covered only to slot 100 has no business being counted: it would
    // report few warm days and look like a cold year.
    const patchy = station(1900, 1999, () => 10, 100);
    expect(frequencyShift(patchy, 'mean', 20, 'warm')).toBeNull();
  });

  it('returns no factor when the early window never crossed the threshold', () => {
    // Dividing by zero would print "Infinity× as often". The caller needs to be
    // able to say "did not happen at all back then" instead.
    const st = station(1900, 1999, (y) => (y < 1930 ? 0 : 12));
    const shift = frequencyShift(st, 'mean', 20, 'warm');
    expect(shift!.early.perYear).toBe(0);
    expect(shift!.factor).toBeNull();
  });
});
