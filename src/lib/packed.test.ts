import { describe, expect, it } from 'vitest';
import {
  MISSING,
  SLOTS_PER_YEAR,
  allocateSeries,
  decodeValue,
  encodeValue,
  indexFor,
  metricArray,
  monthDayOfSlot,
  slotOfYear,
} from './packed';
import type { PackedStation } from '../types';

describe('slotOfYear', () => {
  it('puts Jan 1 at slot 0 and Dec 31 at slot 365', () => {
    expect(slotOfYear(1, 1)).toBe(0);
    expect(slotOfYear(12, 31)).toBe(365);
  });

  it('reserves slot 59 for Feb 29 so Mar 1 is always slot 60', () => {
    expect(slotOfYear(2, 29)).toBe(59);
    expect(slotOfYear(3, 1)).toBe(60);
  });

  it('gives a date the same slot regardless of year (the leap-year trap)', () => {
    // A true day-of-year would shift Mar 1 by one between leap and common years.
    const leapMar1 = indexFor(2000, 2000, 3, 1) - indexFor(2000, 2000, 1, 1);
    const commonMar1 = indexFor(2000, 2001, 3, 1) - indexFor(2000, 2001, 1, 1);
    expect(leapMar1).toBe(commonMar1);
    expect(leapMar1).toBe(60);
  });

  it('places July 30 at slot 211', () => {
    // 31+29+31+30+31+30 = 182 days before July, then +29 for the 30th.
    expect(slotOfYear(7, 30)).toBe(211);
  });
});

describe('indexFor', () => {
  it('strides by 366 per year', () => {
    expect(indexFor(1864, 1864, 1, 1)).toBe(0);
    expect(indexFor(1864, 1865, 1, 1)).toBe(SLOTS_PER_YEAR);
    expect(indexFor(1864, 1866, 7, 30)).toBe(2 * SLOTS_PER_YEAR + 211);
  });
});

describe('allocateSeries', () => {
  it('allocates 366 slots per inclusive year, all MISSING', () => {
    const a = allocateSeries(2000, 2002);
    expect(a).toHaveLength(3 * SLOTS_PER_YEAR);
    expect(new Set(a)).toEqual(new Set([MISSING]));
  });
});

describe('encodeValue / decodeValue', () => {
  it('round-trips to one decimal place', () => {
    for (const v of [0, 17.5, -2.4, 34.1, -30.7]) {
      expect(decodeValue(encodeValue(v))).toBeCloseTo(v, 5);
    }
  });

  it('maps null to MISSING and back', () => {
    expect(encodeValue(null)).toBe(MISSING);
    expect(decodeValue(MISSING)).toBeNull();
  });

  it('rounds rather than truncates', () => {
    expect(encodeValue(17.55)).toBe(176);
    expect(encodeValue(-17.55)).toBe(-176);
  });
});

describe('metricArray', () => {
  const st = {
    mean: [1],
    max: [2],
    min: [3],
  } as unknown as PackedStation;

  it('selects the array for each metric', () => {
    expect(metricArray(st, 'mean')).toEqual([1]);
    expect(metricArray(st, 'max')).toEqual([2]);
    expect(metricArray(st, 'min')).toEqual([3]);
  });
});

describe('monthDayOfSlot', () => {
  it('inverts slotOfYear for every slot in the table', () => {
    // Every slot 0..365 must round-trip, including 59 (Feb 29), which only
    // exists because the offsets are leap-year based.
    for (let slot = 0; slot < SLOTS_PER_YEAR; slot++) {
      const { month, day } = monthDayOfSlot(slot);
      expect(slotOfYear(month, day)).toBe(slot);
    }
  });

  it('maps the boundary slots', () => {
    expect(monthDayOfSlot(0)).toEqual({ month: 1, day: 1 });
    expect(monthDayOfSlot(31)).toEqual({ month: 2, day: 1 });
    expect(monthDayOfSlot(59)).toEqual({ month: 2, day: 29 });
    expect(monthDayOfSlot(60)).toEqual({ month: 3, day: 1 });
    expect(monthDayOfSlot(213)).toEqual({ month: 8, day: 1 });
    expect(monthDayOfSlot(365)).toEqual({ month: 12, day: 31 });
  });

  it('rejects slots outside the year', () => {
    expect(() => monthDayOfSlot(-1)).toThrow();
    expect(() => monthDayOfSlot(366)).toThrow();
  });
});
