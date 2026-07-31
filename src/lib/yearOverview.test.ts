import { describe, expect, it } from 'vitest';
import { yearOverview, yearTally } from './yearOverview';
import { packRows, readDailyCsv } from './dailyCsv';
import { SLOTS_PER_YEAR, allocateSeries, encodeValue, slotOfYear } from './packed';
import { FIXTURES, fixtureText } from '../../tests/fixtures/paths';
import type { PackedStation } from '../types';

/** Dense synthetic station: every slot of every year present. */
function dense(
  fromYear: number,
  toYear: number,
  valueAt: (year: number, slot: number) => number | null,
): PackedStation {
  const arr = allocateSeries(fromYear, toYear);
  for (let y = fromYear; y <= toYear; y++) {
    for (let s = 0; s < SLOTS_PER_YEAR; s++) {
      arr[(y - fromYear) * SLOTS_PER_YEAR + s] = encodeValue(valueAt(y, s));
    }
  }
  return {
    abbr: 'TST', name: 'Test', canton: 'ZH', lat: 47, lon: 8, altitude: 400,
    source: 'smn', homogenised: false, fromYear, toYear,
    mean: arr, max: [...arr], min: [...arr],
  };
}

describe('yearOverview', () => {
  it('returns one entry per slot, covering the whole leap-safe year', () => {
    const st = dense(2000, 2009, () => 10);
    const days = yearOverview(st, 'mean', 2005);
    expect(days).toHaveLength(SLOTS_PER_YEAR);
    expect(days[0].slot).toBe(0);
    expect(days.at(-1)!.slot).toBe(365);
  });

  it('maps slots back to the right calendar dates', () => {
    const days = yearOverview(dense(2000, 2001, () => 0), 'mean', 2000);
    const at = (s: number) => `${days[s].month}-${days[s].day}`;
    expect(at(0)).toBe('1-1');
    expect(at(31)).toBe('2-1');
    expect(at(59)).toBe('2-29'); // always Feb 29, leap-safe
    expect(at(60)).toBe('3-1');
    expect(at(slotOfYear(7, 31))).toBe('7-31');
    expect(at(365)).toBe('12-31');
  });

  it('summarises the envelope from every year at that slot', () => {
    // Year N holds value N-2000, so slot values across 2000..2004 are 0..4.
    const st = dense(2000, 2004, (y) => y - 2000);
    const d = yearOverview(st, 'mean', 2002)[100];
    expect(d.recordMin).toBe(0);
    expect(d.recordMax).toBe(4);
    expect(d.normal).toBeCloseTo(2, 6);
    expect(d.years).toBe(5);
    expect(d.current).toBe(2);
  });

  it('interpolates percentiles rather than jumping between ranks', () => {
    const st = dense(2000, 2009, (y) => y - 2000); // values 0..9
    const d = yearOverview(st, 'mean', 2000)[10];
    // p10 over 0..9 with linear interpolation is 0.9, not 0 or 1.
    expect(d.p10).toBeCloseTo(0.9, 6);
    expect(d.p90).toBeCloseTo(8.1, 6);
  });

  it('reports current as null where the selected year has no reading', () => {
    const gap = slotOfYear(6, 15);
    const st = dense(2000, 2004, (y, s) => (y === 2002 && s === gap ? null : 10));
    const days = yearOverview(st, 'mean', 2002);
    expect(days[gap].current).toBeNull();
    // The envelope still stands from the other four years.
    expect(days[gap].years).toBe(4);
    expect(days[gap].normal).toBeCloseTo(10, 6);
  });

  it('keeps Feb 29 in place for a common year instead of shifting later dates', () => {
    // Only leap years have slot 59; a common year must show a gap there, not
    // pull 1 March back into it.
    const st = dense(2000, 2003, (y, s) => (s === 59 && y % 4 !== 0 ? null : y));
    const days = yearOverview(st, 'mean', 2001);
    expect(days[59].month).toBe(2);
    expect(days[59].day).toBe(29);
    expect(days[59].current).toBeNull();
    expect(days[60].month).toBe(3);
    expect(days[60].current).toBe(2001);
  });

  it('returns nulls but not a crash for a slot no year ever recorded', () => {
    const st = dense(2000, 2002, (_, s) => (s === 200 ? null : 5));
    const d = yearOverview(st, 'mean', 2001)[200];
    expect(d).toMatchObject({ recordMin: null, recordMax: null, normal: null, years: 0 });
  });

  it('yields current null throughout for a year outside the record', () => {
    const st = dense(2000, 2004, () => 7);
    const days = yearOverview(st, 'mean', 1990);
    expect(days.every((d) => d.current === null)).toBe(true);
    expect(days[0].normal).toBeCloseTo(7, 6); // envelope unaffected
  });

  it('works on the real Basel fixture for the days it contains', () => {
    const packed = packRows(readDailyCsv(fixtureText(FIXTURES.nbcnBasDaily), 'nbcn'));
    const st: PackedStation = {
      abbr: 'BAS', name: 'Basel', canton: 'BL', lat: 47.5, lon: 7.6, altitude: 316,
      source: 'nbcn', homogenised: true, ...packed,
    };
    const days = yearOverview(st, 'mean', 1947);
    const july30 = days[slotOfYear(7, 30)];
    expect(july30.years).toBe(162);
    expect(july30.recordMax).toBeCloseTo(26.8, 5); // the verified 1947 record
    expect(july30.current).toBeCloseTo(26.8, 5);
  });
});

describe('yearTally', () => {
  it('counts only days the selected year actually has', () => {
    const st = dense(2000, 2004, (y, s) => (y === 2002 && s > 100 ? null : 10));
    const t = yearTally(yearOverview(st, 'mean', 2002));
    expect(t.withData).toBe(101);
  });

  it('counts days above p90 and below p10', () => {
    // 2004 is the warmest year at every slot, so every day clears p90.
    const st = dense(2000, 2004, (y) => y - 2000);
    const warm = yearTally(yearOverview(st, 'mean', 2004));
    expect(warm.aboveP90).toBe(SLOTS_PER_YEAR);
    expect(warm.belowP10).toBe(0);

    const cold = yearTally(yearOverview(st, 'mean', 2000));
    expect(cold.belowP10).toBe(SLOTS_PER_YEAR);
    expect(cold.aboveP90).toBe(0);
  });

  it('counts record days, with the year included in its own envelope', () => {
    const st = dense(2000, 2004, (y) => y - 2000);
    const t = yearTally(yearOverview(st, 'mean', 2004));
    // The warmest year IS the record at every slot.
    expect(t.recordHigh).toBe(SLOTS_PER_YEAR);
    expect(t.recordLow).toBe(0);
  });

  it('is all zeroes for a year outside the record', () => {
    const st = dense(2000, 2004, () => 7);
    expect(yearTally(yearOverview(st, 'mean', 1990))).toEqual({
      withData: 0, aboveP90: 0, belowP10: 0, recordHigh: 0, recordLow: 0,
    });
  });
});
