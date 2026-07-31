// src/lib/chartData.test.ts
import { describe, expect, it } from 'vitest';
import { trendSegment, yDomain } from './chartData';
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
