import { describe, expect, it } from 'vitest';
import {
  MIN_DAYS_FOR_YEAR,
  MIN_COVERAGE_RATIO,
  THRESHOLDS,
  byDecade,
  decadeChange,
  heatDaysToDate,
  isThresholdKey,
  thresholdDays,
} from './thresholdDays';
import { SLOTS_PER_YEAR, allocateSeries, encodeValue, slotOfYear } from './packed';
import type { PackedStation } from '../types';

/** Station where every day of every year carries an explicit max and min. */
function station(
  fromYear: number,
  toYear: number,
  maxAt: (year: number, slot: number) => number | null,
  minAt: (year: number, slot: number) => number | null = () => 5,
): PackedStation {
  const max = allocateSeries(fromYear, toYear);
  const min = allocateSeries(fromYear, toYear);
  for (let y = fromYear; y <= toYear; y++) {
    for (let s = 0; s < SLOTS_PER_YEAR; s++) {
      const i = (y - fromYear) * SLOTS_PER_YEAR + s;
      max[i] = encodeValue(maxAt(y, s));
      min[i] = encodeValue(minAt(y, s));
    }
  }
  return {
    abbr: 'TST', name: 'Test', canton: 'ZH', lat: 47, lon: 8, altitude: 400,
    source: 'smn', homogenised: false, fromYear, toYear,
    mean: [...max], max, min,
  };
}

/** Station whose `max` carries a chosen number of 30 °C days before a cutoff. */
function stationWithHotDays(
  fromYear: number,
  toYear: number,
  hotDaysPerYear: Record<number, number>,
  coveredSlots = 366,
): PackedStation {
  const max = allocateSeries(fromYear, toYear);
  for (let y = fromYear; y <= toYear; y++) {
    const hot = hotDaysPerYear[y] ?? 0;
    for (let s = 0; s < coveredSlots; s++) {
      max[(y - fromYear) * SLOTS_PER_YEAR + s] = encodeValue(s < hot ? 31 : 10);
    }
  }
  return {
    abbr: 'TST', name: 'Test', canton: 'ZH', lat: 47, lon: 8, altitude: 400,
    source: 'smn', homogenised: false, fromYear, toYear,
    mean: allocateSeries(fromYear, toYear), max,
    min: allocateSeries(fromYear, toYear),
  };
}

describe('THRESHOLDS', () => {
  it('uses the standard Swiss definitions', () => {
    const by = Object.fromEntries(THRESHOLDS.map((t) => [t.key, t]));
    expect(by.summerDays.test(25)).toBe(true);
    expect(by.summerDays.test(24.9)).toBe(false);
    expect(by.hotDays.test(30)).toBe(true);
    expect(by.hotDays.test(29.9)).toBe(false);
    expect(by.tropicalNights.test(20)).toBe(true);
    expect(by.tropicalNights.test(19.9)).toBe(false);
    expect(by.frostDays.test(-0.1)).toBe(true);
    expect(by.frostDays.test(0)).toBe(false);
    expect(by.iceDays.test(-0.1)).toBe(true);
    expect(by.iceDays.test(0)).toBe(false);
  });

  it('reads each threshold off the right metric', () => {
    const by = Object.fromEntries(THRESHOLDS.map((t) => [t.key, t]));
    expect(by.summerDays.metric).toBe('max');
    expect(by.hotDays.metric).toBe('max');
    expect(by.iceDays.metric).toBe('max'); // an ice day never rises above freezing
    expect(by.tropicalNights.metric).toBe('min');
    expect(by.frostDays.metric).toBe('min');
  });

  it('validates keys for the URL', () => {
    expect(isThresholdKey('hotDays')).toBe(true);
    expect(isThresholdKey('warmish')).toBe(false);
  });
});

describe('thresholdDays', () => {
  it('counts the days that cross the threshold', () => {
    // Exactly 10 days a year at 31 °C, the rest at 20 °C.
    const st = station(2000, 2004, (_, s) => (s < 10 ? 31 : 20));
    const rows = thresholdDays(st, 'hotDays');
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => r.count === 10)).toBe(true);
  });

  it('reads min-based thresholds off the min series, not the max', () => {
    // Max is scorching but min never reaches 20: no tropical nights.
    const st = station(2000, 2002, () => 35, () => 19.9);
    expect(thresholdDays(st, 'tropicalNights').every((r) => r.count === 0)).toBe(true);
    expect(thresholdDays(st, 'hotDays').every((r) => r.count === SLOTS_PER_YEAR)).toBe(true);
  });

  it('treats the boundary as inclusive where the definition is', () => {
    const at30 = station(2000, 2000, () => 30);
    expect(thresholdDays(at30, 'hotDays')[0].count).toBe(SLOTS_PER_YEAR);
    const at299 = station(2000, 2000, () => 29.9);
    expect(thresholdDays(at299, 'hotDays')[0].count).toBe(0);
  });

  it('refuses to count a year with too many missing days', () => {
    // Only 100 days present — a real outage. Counting it would report a cool
    // year when the truth is simply that the data is not there.
    const st = station(2000, 2001, (y, s) => (y === 2000 && s >= 100 ? null : 31));
    const rows = thresholdDays(st, 'hotDays');
    expect(rows[0].daysWithData).toBe(100);
    expect(rows[0].count).toBeNull();
    expect(rows[1].count).toBe(SLOTS_PER_YEAR);
  });

  it('still counts a year missing only a handful of days', () => {
    const drop = SLOTS_PER_YEAR - MIN_DAYS_FOR_YEAR - 1;
    const st = station(2000, 2000, (_, s) => (s < drop ? null : 31));
    const rows = thresholdDays(st, 'hotDays');
    expect(rows[0].daysWithData).toBeGreaterThanOrEqual(MIN_DAYS_FOR_YEAR);
    expect(rows[0].count).not.toBeNull();
  });

  it('throws on an unknown threshold rather than silently counting nothing', () => {
    const st = station(2000, 2000, () => 10);
    expect(() => thresholdDays(st, 'nope' as never)).toThrow(/Unknown threshold/);
  });
});

describe('heatDaysToDate (R3)', () => {
  it('counts only days up to and including the cutoff', () => {
    // 20 hot days sit in slots 0..19, all before 1 August (slot 213).
    const st = stationWithHotDays(2020, 2020, { 2020: 20 });
    const [row] = heatDaysToDate(st, 8, 1, 'hotDays');
    expect(row.days).toBe(20);
  });

  it('ignores hot days that fall after the cutoff', () => {
    // 250 hot days in slots 0..249; only slots 0..213 are in range.
    const st = stationWithHotDays(2020, 2020, { 2020: 250 });
    const [row] = heatDaysToDate(st, 8, 1, 'hotDays');
    expect(row.days).toBe(214);
  });

  it('compares every year against the same cutoff', () => {
    const st = stationWithHotDays(2001, 2003, { 2001: 5, 2002: 9, 2003: 31 });
    const rows = heatDaysToDate(st, 8, 1, 'hotDays');
    expect(rows.map((r) => [r.year, r.days])).toEqual([
      [2001, 5],
      [2002, 9],
      [2003, 31],
    ]);
  });

  it('withholds a year that is too incomplete up to the cutoff', () => {
    // Covered only to slot 100, well under 90.4 % of the 214 elapsed slots.
    const st = stationWithHotDays(2020, 2020, { 2020: 10 }, 100);
    const [row] = heatDaysToDate(st, 8, 1, 'hotDays');
    expect(row.days).toBeNull();
    expect(row.daysWithData).toBe(100);
  });

  it('derives its coverage ratio from the whole-year rule', () => {
    expect(MIN_COVERAGE_RATIO).toBe(MIN_DAYS_FOR_YEAR / SLOTS_PER_YEAR);
  });

  it('reproduces the whole-year gate exactly at a 31 December cutoff', () => {
    // The derivation exists so the two rules cannot drift. At the year end the
    // to-date gate must land on MIN_DAYS_FOR_YEAR itself, not one day beside it.
    const elapsed = slotOfYear(12, 31) + 1;
    expect(elapsed).toBe(SLOTS_PER_YEAR);
    expect(Math.ceil(elapsed * MIN_COVERAGE_RATIO)).toBe(MIN_DAYS_FOR_YEAR);
  });

  it('applies the threshold at the cutoff', () => {
    // 193 of 214 slots is the first count that clears ceil(214 * 330/366).
    const elapsed = 214;
    const needed = Math.ceil(elapsed * MIN_COVERAGE_RATIO);
    expect(needed).toBe(193);

    const ok = stationWithHotDays(2020, 2020, { 2020: 3 }, needed);
    expect(heatDaysToDate(ok, 8, 1, 'hotDays')[0].days).toBe(3);

    const short = stationWithHotDays(2020, 2020, { 2020: 3 }, needed - 1);
    expect(heatDaysToDate(short, 8, 1, 'hotDays')[0].days).toBeNull();
  });
});

describe('byDecade', () => {
  it('averages complete years within each decade', () => {
    const rows = [
      { year: 1990, daysWithData: 365, count: 2 },
      { year: 1991, daysWithData: 365, count: 4 },
      { year: 2000, daysWithData: 365, count: 10 },
    ];
    expect(byDecade(rows)).toEqual([
      { decade: 1990, years: 2, perYear: 3 },
      { decade: 2000, years: 1, perYear: 10 },
    ]);
  });

  it('excludes years that were too incomplete to count', () => {
    const rows = [
      { year: 1990, daysWithData: 365, count: 6 },
      { year: 1991, daysWithData: 100, count: null },
    ];
    expect(byDecade(rows)).toEqual([{ decade: 1990, years: 1, perYear: 6 }]);
  });

  it('returns nothing when no year is countable', () => {
    expect(byDecade([{ year: 1990, daysWithData: 10, count: null }])).toEqual([]);
  });
});

describe('decadeChange', () => {
  const solid = (decade: number, perYear: number) => ({ decade, years: 10, perYear });

  it('compares the first and last well-populated decade', () => {
    const c = decadeChange([solid(1900, 4), solid(1910, 5), solid(2020, 12)])!;
    expect(c.from.decade).toBe(1900);
    expect(c.to.decade).toBe(2020);
    expect(c.delta).toBe(8);
  });

  it('ignores decades resting on too few years', () => {
    const c = decadeChange([
      { decade: 1890, years: 2, perYear: 99 }, // a stub decade must not anchor the comparison
      solid(1900, 4),
      solid(1910, 5),
      solid(2020, 12),
    ])!;
    expect(c.from.decade).toBe(1900);
  });

  it('declines to report a change across fewer than three decades', () => {
    expect(decadeChange([solid(2000, 4), solid(2010, 9)])).toBeNull();
  });

  it('reports a fall as a negative delta', () => {
    const c = decadeChange([solid(1900, 100), solid(1910, 90), solid(2020, 57)])!;
    expect(c.delta).toBe(-43);
  });
});
