import type { Metric, PackedStation } from '../types';

/**
 * Cumulative days before each month *as if every year were a leap year*.
 *
 * Using a real day-of-year would shift every date after February by one slot in
 * common years, so Mar 1 in 2001 would collide with Feb 29's slot from 2000.
 * A fixed leap-year table keeps a calendar date on the same offset in every
 * year, which is exactly what "this day across all years" needs.
 */
export const MONTH_OFFSET = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335] as const;

export const SLOTS_PER_YEAR = 366;

/** Sentinel for "no reading". Chosen to sit outside Int16 temperature range. */
export const MISSING = -32768;

export function slotOfYear(month: number, day: number): number {
  if (month < 1 || month > 12) throw new Error(`Month out of range: ${month}`);
  if (day < 1 || day > 31) throw new Error(`Day out of range: ${day}`);
  return MONTH_OFFSET[month - 1] + (day - 1);
}

export function indexFor(fromYear: number, year: number, month: number, day: number): number {
  return (year - fromYear) * SLOTS_PER_YEAR + slotOfYear(month, day);
}

export function allocateSeries(fromYear: number, toYear: number): number[] {
  const years = toYear - fromYear + 1;
  if (years <= 0) throw new Error(`Empty year range: ${fromYear}..${toYear}`);
  return new Array<number>(years * SLOTS_PER_YEAR).fill(MISSING);
}

export function encodeValue(celsius: number | null): number {
  if (celsius === null || !Number.isFinite(celsius)) return MISSING;
  // Math.round on a negative half rounds toward +Infinity, so round magnitude.
  const scaled = Math.sign(celsius) * Math.round(Math.abs(celsius) * 10);
  return scaled;
}

export function decodeValue(packed: number): number | null {
  return packed === MISSING ? null : packed / 10;
}

export function metricArray(st: PackedStation, metric: Metric): number[] {
  switch (metric) {
    case 'mean':
      return st.mean;
    case 'max':
      return st.max;
    case 'min':
      return st.min;
  }
}
