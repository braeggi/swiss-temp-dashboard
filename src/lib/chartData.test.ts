// src/lib/chartData.test.ts
import { describe, expect, it } from 'vitest';
import { trendSegment, withTodayPoint, yDomain } from './chartData';
import type { DayPoint } from '../types';

const rising: DayPoint[] = Array.from({ length: 40 }, (_, i) => ({
  year: 1980 + i,
  value: 10 + i * 0.1,
}));

describe('trendSegment', () => {
  it('spans the first and last year', () => {
    const seg = trendSegment(rising)!;
    expect(seg.from.x).toBe(1980);
    expect(seg.to.x).toBe(2019);
  });

  it('follows the fitted slope', () => {
    const seg = trendSegment(rising)!;
    expect(seg.to.y - seg.from.y).toBeCloseTo(3.9, 6);
  });

  it('returns null below the 30-year trend floor', () => {
    expect(trendSegment(rising.slice(0, 20))).toBeNull();
  });

  it('returns null for an empty series', () => {
    expect(trendSegment([])).toBeNull();
  });
});

describe('yDomain', () => {
  it('pads the range by 1 degree and rounds outward', () => {
    const [lo, hi] = yDomain([{ year: 2000, value: 10.2 }, { year: 2001, value: 20.7 }], []);
    expect(lo).toBeLessThanOrEqual(9);
    expect(hi).toBeGreaterThanOrEqual(21);
  });

  it('includes extra values such as today', () => {
    const [, hi] = yDomain([{ year: 2000, value: 10 }], [35]);
    expect(hi).toBeGreaterThanOrEqual(36);
  });

  it('falls back to a sane range with no data', () => {
    expect(yDomain([], [])).toEqual([0, 10]);
  });
});

describe('withTodayPoint', () => {
  const history: DayPoint[] = [
    { year: 2023, value: 19 },
    { year: 2024, value: 20 },
    { year: 2025, value: 21 },
  ];

  // The bug this guards: the packed history ends at the last rebuilt year, so
  // today's live reading was drawn only as a ReferenceDot — an overlay the
  // scatter tooltip cannot reach. The one point a reader most wants to
  // interrogate was the one point with no hit target.
  it('adds today when the history does not reach it', () => {
    expect(withTodayPoint(history, 2026, 22.4)).toEqual([
      ...history,
      { year: 2026, value: 22.4 },
    ]);
  });

  it('leaves the series alone when today is already in it', () => {
    const withCurrent = [...history, { year: 2026, value: 18 }];
    expect(withTodayPoint(withCurrent, 2026, 22.4)).toBe(withCurrent);
  });

  // A past date highlights a year that is already plotted — nothing to add.
  it('leaves the series alone when the marked year is a past year', () => {
    expect(withTodayPoint(history, 2024, 20)).toBe(history);
  });

  it('leaves the series alone when there is no marker value', () => {
    expect(withTodayPoint(history, 2026, null)).toBe(history);
  });
});
