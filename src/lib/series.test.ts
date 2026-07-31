// src/lib/series.test.ts
import { describe, expect, it } from 'vitest';
import {
  MIN_YEARS_FOR_TREND,
  dayAcrossYears,
  dayAcrossYearsWindowed,
  extremes,
  normDeviation,
  rankDescending,
  trendPerCentury,
} from './series';
import { packRows, readDailyCsv } from './dailyCsv';
import { SLOTS_PER_YEAR, allocateSeries, encodeValue, slotOfYear } from './packed';
import { FIXTURES, fixtureText } from '../../tests/fixtures/paths';
import type { DayPoint, PackedStation } from '../types';

function station(collection: 'nbcn' | 'smn', fixture: string): PackedStation {
  const packed = packRows(readDailyCsv(fixtureText(fixture), collection));
  return {
    abbr: 'TST',
    name: 'Test',
    canton: 'ZH',
    lat: 47,
    lon: 8,
    altitude: 400,
    source: collection,
    homogenised: collection === 'nbcn',
    ...packed,
  };
}

const basel = station('nbcn', FIXTURES.nbcnBasDaily);
const aarau = station('smn', FIXTURES.smnBusDaily);

describe('dayAcrossYears', () => {
  it('returns 162 years for 30 July at Basel', () => {
    expect(dayAcrossYears(basel, 7, 30, 'mean')).toHaveLength(162);
  });

  it('returns 42 years for 30 July at Buchs/Aarau', () => {
    expect(dayAcrossYears(aarau, 7, 30, 'mean')).toHaveLength(42);
  });

  it('returns points sorted ascending by year', () => {
    const pts = dayAcrossYears(basel, 7, 30, 'mean');
    expect(pts[0].year).toBe(1864);
    expect(pts.at(-1)!.year).toBe(2025);
  });

  it('omits years whose value is missing rather than emitting zeros', () => {
    // Basel min/max only begin in 1897.
    const pts = dayAcrossYears(basel, 7, 30, 'max');
    expect(pts.length).toBeLessThan(162);
    expect(pts.every((p) => p.year >= 1897)).toBe(true);
    expect(pts.some((p) => p.value === 0)).toBe(false);
  });

  it('returns only the leap years for Feb 29', () => {
    expect(dayAcrossYears(basel, 2, 29, 'mean')).toHaveLength(40);
  });
});

describe('rankDescending', () => {
  const pts: DayPoint[] = [
    { year: 1, value: 10 },
    { year: 2, value: 30 },
    { year: 3, value: 20 },
  ];

  it('ranks the warmest as 1', () => {
    expect(rankDescending(pts, 30)).toBe(1);
    expect(rankDescending(pts, 20)).toBe(2);
    expect(rankDescending(pts, 10)).toBe(3);
  });

  it('ranks a new record above every stored value', () => {
    expect(rankDescending(pts, 99)).toBe(1);
  });

  it('reports 1947 as the warmest 30 July at Basel', () => {
    const july = dayAcrossYears(basel, 7, 30, 'mean');
    const hottest = extremes(july)!.hottest;
    expect(hottest.year).toBe(1947);
    expect(hottest.value).toBeCloseTo(26.8, 5);
    expect(rankDescending(july, hottest.value)).toBe(1);
  });
});

describe('trendPerCentury', () => {
  it('computes +2.57 °C/century for 30 July at Basel', () => {
    const pts = dayAcrossYears(basel, 7, 30, 'mean');
    expect(trendPerCentury(pts)).toBeCloseTo(2.5725, 3);
  });

  it('recovers an exact synthetic slope', () => {
    // +1 °C per year == +100 °C per century.
    const pts: DayPoint[] = Array.from({ length: 40 }, (_, i) => ({
      year: 2000 + i,
      value: i,
    }));
    expect(trendPerCentury(pts)).toBeCloseTo(100, 6);
  });

  it('returns null below the 30-year floor', () => {
    const pts: DayPoint[] = Array.from({ length: MIN_YEARS_FOR_TREND - 1 }, (_, i) => ({
      year: 2000 + i,
      value: i,
    }));
    expect(trendPerCentury(pts)).toBeNull();
  });
});

describe('normDeviation', () => {
  it('measures against the 1991-2020 mean for 30 July at Basel (21.07 °C)', () => {
    const pts = dayAcrossYears(basel, 7, 30, 'mean');
    expect(normDeviation(pts, 21.0667)).toBeCloseTo(0, 3);
    expect(normDeviation(pts, 24.0667)).toBeCloseTo(3, 3);
  });

  it('returns null when fewer than 20 norm years are present', () => {
    const pts: DayPoint[] = [
      { year: 1995, value: 20 },
      { year: 1996, value: 20 },
    ];
    expect(normDeviation(pts, 25)).toBeNull();
  });
});

describe('extremes', () => {
  it('returns null for an empty series', () => {
    expect(extremes([])).toBeNull();
  });

  it('finds hottest and coldest', () => {
    const pts: DayPoint[] = [
      { year: 1, value: 10 },
      { year: 2, value: 30 },
    ];
    expect(extremes(pts)).toEqual({
      hottest: { year: 2, value: 30 },
      coldest: { year: 1, value: 10 },
    });
  });
});

describe('dayAcrossYearsWindowed', () => {
  // The committed fixtures are trimmed to three calendar dates, so they cannot
  // exercise a multi-day window. Build a dense synthetic station instead: every
  // day of every year present, with a known shape.
  function dense(fromYear: number, toYear: number, valueAt: (i: number) => number | null) {
    const years = toYear - fromYear + 1;
    const arr = allocateSeries(fromYear, toYear);
    for (let i = 0; i < years * SLOTS_PER_YEAR; i++) arr[i] = encodeValue(valueAt(i));
    return {
      abbr: 'TST', name: 'Test', canton: 'ZH', lat: 47, lon: 8, altitude: 400,
      source: 'smn' as const, homogenised: false, fromYear, toYear,
      mean: arr, max: [...arr], min: [...arr],
    };
  }

  it('falls back to the single-day query for a zero window', () => {
    const st = dense(2000, 2009, (i) => i % 37);
    expect(dayAcrossYearsWindowed(st, 7, 30, 'mean', 0)).toEqual(
      dayAcrossYears(st, 7, 30, 'mean'),
    );
  });

  it('averages the window, not just the centre day', () => {
    // Every slot holds its own index, so a ±1 window around slot N averages
    // N-1, N, N+1 — which is exactly N again, but the centre-only value differs
    // if we bias the neighbours. Give the day before a +30 bump to prove the
    // neighbour is actually read.
    const centre = (2005 - 2000) * SLOTS_PER_YEAR + slotOfYear(7, 30);
    const st = dense(2000, 2009, (i) => (i === centre - 1 ? 30 : 0));
    const pts = dayAcrossYearsWindowed(st, 7, 30, 'mean', 1);
    const y2005 = pts.find((p) => p.year === 2005)!;
    expect(y2005.value).toBeCloseTo(10, 6); // (30 + 0 + 0) / 3
  });

  it('crosses the year boundary instead of truncating', () => {
    // 1 January ± 3 must reach back into the previous December. Mark the last
    // slot of the preceding year and check it lands in the average.
    const jan1of2005 = (2005 - 2000) * SLOTS_PER_YEAR + slotOfYear(1, 1);
    const st = dense(2000, 2009, (i) => (i === jan1of2005 - 1 ? 40 : 0));
    const pts = dayAcrossYearsWindowed(st, 1, 1, 'mean', 3);
    const y2005 = pts.find((p) => p.year === 2005)!;
    expect(y2005.value).toBeGreaterThan(0); // December's value was included
    expect(y2005.value).toBeCloseTo(40 / 7, 6);
  });

  it('reduces year-to-year scatter on a noisy series', () => {
    let seed = 1;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const st = dense(1900, 1999, () => 15 + (rnd() - 0.5) * 20);
    const spread = (pts: { value: number }[]) => {
      const m = pts.reduce((a, p) => a + p.value, 0) / pts.length;
      return Math.sqrt(pts.reduce((a, p) => a + (p.value - m) ** 2, 0) / pts.length);
    };
    expect(spread(dayAcrossYearsWindowed(st, 7, 30, 'mean', 7)))
      .toBeLessThan(spread(dayAcrossYears(st, 7, 30, 'mean')));
  });

  it('preserves a known linear trend', () => {
    // +0.02 °C per day compounds to a steady rise; smoothing must not bend it.
    //
    // Not bit-exact, and shouldn't be: in the first and last year the window is
    // clipped at the array boundary, so those two points average a lopsided
    // window and tilt the fit fractionally. Everything in between is exact.
    // The real property is that smoothing cuts noise without moving the signal,
    // so assert a relative error far below anything that could mislead a reader
    // (observed ~3 parts per million on this series).
    const st = dense(1900, 1999, (i) => i * 0.02);
    const plain = trendPerCentury(dayAcrossYears(st, 7, 30, 'mean'))!;
    const smooth = trendPerCentury(dayAcrossYearsWindowed(st, 7, 30, 'mean', 7))!;
    expect(Math.abs(smooth - plain) / Math.abs(plain)).toBeLessThan(1e-4);
  });

  it('drops a year whose window is mostly missing', () => {
    const centre = (2005 - 2000) * SLOTS_PER_YEAR + slotOfYear(7, 30);
    // Only the centre day present in 2005: 1 of 7 slots, below the half-window floor.
    const st = dense(2000, 2009, (i) => (i === centre ? 20 : null));
    expect(dayAcrossYearsWindowed(st, 7, 30, 'mean', 3)).toHaveLength(0);
  });

  it('keeps a year whose window is half present', () => {
    const centre = (2005 - 2000) * SLOTS_PER_YEAR + slotOfYear(7, 30);
    const st = dense(2000, 2009, (i) => (i >= centre - 1 && i <= centre + 2 ? 20 : null));
    const pts = dayAcrossYearsWindowed(st, 7, 30, 'mean', 3);
    expect(pts).toHaveLength(1);
    expect(pts[0].value).toBeCloseTo(20, 6);
  });

  it('uses real adjacent days where the fixture has them (29 Feb / 1 Mar)', () => {
    // The trimmed Basel fixture keeps 29.02 and 01.03, which are adjacent slots,
    // so a ±1 window around 1 March genuinely folds in the leap day.
    const withLeap = dayAcrossYearsWindowed(basel, 3, 1, 'mean', 1);
    const single = dayAcrossYears(basel, 3, 1, 'mean');
    const leapYear = 2000;
    const a = withLeap.find((p) => p.year === leapYear)!;
    const b = single.find((p) => p.year === leapYear)!;
    expect(a.value).not.toBe(b.value);
  });
});
