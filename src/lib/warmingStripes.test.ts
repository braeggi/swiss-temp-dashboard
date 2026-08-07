import { describe, expect, it } from 'vitest';
import {
  REFERENCE_FROM,
  REFERENCE_TO,
  STRIPE_MAX_STEP,
  warmingStripes,
} from './warmingStripes';
import type { DayPoint } from '../types';

/** Annual means for a run of years, from a per-year function. */
const years = (from: number, to: number, at: (y: number) => number): DayPoint[] =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ year: from + i, value: at(from + i) }));

/** A reference period with a known mean of 10 and a known spread. */
const reference = (spread: number) =>
  years(REFERENCE_FROM, REFERENCE_TO, (y) => 10 + ((y % 2 === 0 ? 1 : -1) * spread));

describe('warmingStripes', () => {
  it('measures each year against the reference mean', () => {
    const result = warmingStripes([...reference(1), { year: 2020, value: 13 }]);
    expect(result).not.toBeNull();
    expect(result!.reference.mean).toBeCloseTo(10, 6);
    const y2020 = result!.stripes.find((s) => s.year === 2020)!;
    expect(y2020.anomaly).toBeCloseTo(3, 6);
  });

  it('names the reference period it used', () => {
    const result = warmingStripes(reference(1));
    expect(result!.reference.fromYear).toBe(REFERENCE_FROM);
    expect(result!.reference.toYear).toBe(REFERENCE_TO);
  });

  it('puts a year at the reference mean on the neutral step', () => {
    const result = warmingStripes([...reference(1), { year: 2020, value: 10 }]);
    expect(result!.stripes.find((s) => s.year === 2020)!.step).toBe(0);
  });

  it('clamps far outliers to the end of the ramp rather than running off it', () => {
    const result = warmingStripes([...reference(1), { year: 2020, value: 99 }]);
    expect(result!.stripes.find((s) => s.year === 2020)!.step).toBe(STRIPE_MAX_STEP);
    const cold = warmingStripes([...reference(1), { year: 2020, value: -99 }]);
    expect(cold!.stripes.find((s) => s.year === 2020)!.step).toBe(-STRIPE_MAX_STEP);
  });

  it('scales the steps to the reference spread, not to a fixed °C', () => {
    // The same +1.5 °C anomaly is remarkable at a steady station and ordinary
    // at a variable one. A fixed °C-per-step would make flat lowland records
    // look alarming and volatile alpine ones look calm.
    const steady = warmingStripes([...reference(0.25), { year: 2020, value: 11.5 }]);
    const volatile = warmingStripes([...reference(2), { year: 2020, value: 11.5 }]);
    const step = (r: ReturnType<typeof warmingStripes>) =>
      r!.stripes.find((s) => s.year === 2020)!.step;
    expect(step(steady)).toBeGreaterThan(step(volatile));
  });

  it('refuses to draw when the reference period is too thin to anchor on', () => {
    // A station opened in 1985 has no 1961-1990 normal, and inventing one from
    // six years would put every later stripe on a meaningless baseline.
    expect(warmingStripes(years(1985, 2020, () => 10))).toBeNull();
  });

  it('keeps years outside the reference period, on both sides', () => {
    const result = warmingStripes([
      { year: 1900, value: 8 },
      ...reference(1),
      { year: 2020, value: 12 },
    ]);
    const listed = result!.stripes.map((s) => s.year);
    expect(listed[0]).toBe(1900);
    expect(listed.at(-1)).toBe(2020);
  });

  it('returns no stripes for an empty record', () => {
    expect(warmingStripes([])).toBeNull();
  });
});

describe('warmingStripes shift', () => {
  it('reports what the first and last thirty complete years averaged', () => {
    // 1900-1929 at 8 °C, 1930-1990 at 9 °C (carrying the reference), 1991-2020 at 11 °C.
    const record = years(1900, 2020, (y) => (y < 1930 ? 8 : y < 1991 ? 9 : 11));
    const shift = warmingStripes(record)!.shift!;
    expect(shift.early).toMatchObject({ fromYear: 1900, toYear: 1929, mean: 8 });
    expect(shift.recent).toMatchObject({ fromYear: 1991, toYear: 2020, mean: 11 });
    expect(shift.delta).toBeCloseTo(3, 6);
  });

  it('withholds the figure when the record cannot carry two full windows', () => {
    // Thirty years of reference plus a handful is not two windows, and a
    // "warming since" figure off overlapping windows compares a period to itself.
    const shift = warmingStripes([...reference(1), { year: 1991, value: 12 }])!.shift;
    expect(shift).toBeNull();
  });
});
