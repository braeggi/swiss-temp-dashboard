import type { DayPoint, Metric, PackedStation } from '../types';
import { SLOTS_PER_YEAR, decodeValue, metricArray, slotOfYear } from './packed';
// Derived, not re-invented: a year is "complete enough" by exactly one rule in
// this codebase, and an annual mean has the same stake in it as a day count.
import { MIN_DAYS_FOR_YEAR } from './thresholdDays';

export const MIN_YEARS_FOR_TREND = 30;
export const MIN_YEARS_FOR_NORM = 20;
const NORM_FROM = 1991;
const NORM_TO = 2020;

/**
 * Every value recorded on one calendar day, one point per year.
 * Because slots are fixed-stride, this is a walk with step 366 rather than a scan.
 */
export function dayAcrossYears(
  st: PackedStation,
  month: number,
  day: number,
  metric: Metric,
): DayPoint[] {
  const arr = metricArray(st, metric);
  const slot = slotOfYear(month, day);
  const out: DayPoint[] = [];
  for (let year = st.fromYear; year <= st.toYear; year++) {
    const i = (year - st.fromYear) * SLOTS_PER_YEAR + slot;
    const v = decodeValue(arr[i]);
    if (v !== null) out.push({ year, value: v });
  }
  return out;
}

/**
 * The mean of every daily mean, one point per complete year.
 *
 * The quantity the warming stripes encode. Incomplete years are dropped rather
 * than averaged over what is there: a year missing its winter would come out
 * warm, and the stripe would then be showing where the gaps are.
 */
export function annualMeans(st: PackedStation): DayPoint[] {
  const arr = st.mean;
  const out: DayPoint[] = [];
  for (let year = st.fromYear; year <= st.toYear; year++) {
    const base = (year - st.fromYear) * SLOTS_PER_YEAR;
    let sum = 0;
    let n = 0;
    for (let s = 0; s < SLOTS_PER_YEAR; s++) {
      const v = decodeValue(arr[base + s]);
      if (v === null) continue;
      sum += v;
      n++;
    }
    if (n >= MIN_DAYS_FOR_YEAR) out.push({ year, value: sum / n });
  }
  return out;
}

/** 1 means warmest. A value above every point also ranks 1. */
export function rankDescending(points: DayPoint[], value: number): number {
  let warmer = 0;
  for (const p of points) if (p.value > value) warmer++;
  return warmer + 1;
}

/**
 * Least-squares slope, expressed per century so the number is legible.
 * Returns null below MIN_YEARS_FOR_TREND: a slope fitted to a handful of noisy
 * single days is not meaningful.
 */
export function trendPerCentury(points: DayPoint[]): number | null {
  const n = points.length;
  if (n < MIN_YEARS_FOR_TREND) return null;
  let sx = 0;
  let sy = 0;
  let sxy = 0;
  let sxx = 0;
  for (const p of points) {
    sx += p.year;
    sy += p.value;
    sxy += p.year * p.value;
    sxx += p.year * p.year;
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  const slopePerYear = (n * sxy - sx * sy) / denom;
  return slopePerYear * 100;
}

/**
 * Difference between `value` and this day's 1991-2020 average.
 * Used for SMN stations, which have no precomputed th9120dv column.
 */
export function normDeviation(points: DayPoint[], value: number): number | null {
  const norm = points.filter((p) => p.year >= NORM_FROM && p.year <= NORM_TO);
  if (norm.length < MIN_YEARS_FOR_NORM) return null;
  const mean = norm.reduce((a, p) => a + p.value, 0) / norm.length;
  return value - mean;
}

export function extremes(
  points: DayPoint[],
): { hottest: DayPoint; coldest: DayPoint } | null {
  if (points.length === 0) return null;
  let hottest = points[0];
  let coldest = points[0];
  for (const p of points) {
    if (p.value > hottest.value) hottest = p;
    if (p.value < coldest.value) coldest = p;
  }
  return { hottest, coldest };
}

/**
 * The same query, but averaging each year over a window of ±`days` around the
 * target date.
 *
 * A single calendar day is noisy: one year's 30 July can be 8 °C off its
 * neighbours for reasons that say nothing about climate. Averaging a few days
 * either side keeps the "same date across history" question intact while making
 * the trend legible rather than a cloud.
 *
 * The window walks the flat packed array, which crosses year boundaries for
 * free: slots run 366 per year end-to-end, so stepping back from 2 January
 * lands in the previous December. Feb 29 in a common year is a MISSING slot and
 * is skipped like any other gap. A year is emitted only if at least half the
 * window has readings, so a year with one stray value near a long outage does
 * not masquerade as a full observation.
 */
export function dayAcrossYearsWindowed(
  st: PackedStation,
  month: number,
  day: number,
  metric: Metric,
  days: number,
): DayPoint[] {
  if (days <= 0) return dayAcrossYears(st, month, day, metric);

  const arr = metricArray(st, metric);
  const slot = slotOfYear(month, day);
  const width = days * 2 + 1;
  const needed = Math.ceil(width / 2);
  const out: DayPoint[] = [];

  for (let year = st.fromYear; year <= st.toYear; year++) {
    const centre = (year - st.fromYear) * SLOTS_PER_YEAR + slot;
    let sum = 0;
    let n = 0;
    for (let offset = -days; offset <= days; offset++) {
      const i = centre + offset;
      if (i < 0 || i >= arr.length) continue;
      const v = decodeValue(arr[i]);
      if (v !== null) {
        sum += v;
        n++;
      }
    }
    if (n >= needed) out.push({ year, value: sum / n });
  }
  return out;
}
