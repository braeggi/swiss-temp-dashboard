import type { Metric, PackedStation } from '../types';
import { SLOTS_PER_YEAR, decodeValue, metricArray, monthDayOfSlot } from './packed';

/**
 * One calendar position, summarised across the whole record plus the selected
 * year's own value.
 *
 * `slot` is the leap-safe slot index (0..365), so Feb 29 is always 59 and Mar 1
 * always 60 — the same indexing the packed arrays use. In a common year the
 * selected year simply has no reading at slot 59, which surfaces as
 * `current: null` rather than shifting every later date by a day.
 */
export interface YearDay {
  slot: number;
  month: number;
  day: number;
  /** Coldest and warmest ever recorded on this calendar position. */
  recordMin: number | null;
  recordMax: number | null;
  /** Middle 80 % of years — the "normal range" band. */
  p10: number | null;
  p90: number | null;
  /** Mean across all years with a reading here. */
  normal: number | null;
  /** The selected year's own value, or null where it has no reading. */
  current: number | null;
  /** How many years contributed to the summary at this position. */
  years: number;
}

/**
 * Linear-interpolated percentile over a sorted array.
 *
 * Nearest-rank would jump visibly between adjacent days on short records — the
 * band would look stepped rather than smooth — so interpolate.
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Every calendar position of the year, with the historical envelope behind the
 * selected year's own curve.
 *
 * Answers a different question from `dayAcrossYears`: not "is today unusual for
 * this date" but "how has this year run against the record so far". Reads the
 * same packed arrays, walking slots within each year rather than one slot across
 * years.
 *
 * `current` deliberately excludes the selected year from its own envelope only
 * when that year is still in progress would be wrong — it does not exclude it.
 * A completed past year is part of the record and belongs in the band; showing
 * it against an envelope it was excluded from would overstate how exceptional
 * it was.
 */
export function yearOverview(
  st: PackedStation,
  metric: Metric,
  year: number,
): YearDay[] {
  const arr = metricArray(st, metric);
  const out: YearDay[] = [];

  for (let slot = 0; slot < SLOTS_PER_YEAR; slot++) {
    const values: number[] = [];
    for (let y = st.fromYear; y <= st.toYear; y++) {
      const v = decodeValue(arr[(y - st.fromYear) * SLOTS_PER_YEAR + slot]);
      if (v !== null) values.push(v);
    }

    const inRange = year >= st.fromYear && year <= st.toYear;
    const current = inRange
      ? decodeValue(arr[(year - st.fromYear) * SLOTS_PER_YEAR + slot])
      : null;

    const { month, day } = monthDayOfSlot(slot);

    if (values.length === 0) {
      out.push({
        slot, month, day,
        recordMin: null, recordMax: null, p10: null, p90: null, normal: null,
        current, years: 0,
      });
      continue;
    }

    values.sort((a, b) => a - b);
    out.push({
      slot,
      month,
      day,
      recordMin: values[0],
      recordMax: values[values.length - 1],
      p10: percentile(values, 0.1),
      p90: percentile(values, 0.9),
      normal: values.reduce((a, b) => a + b, 0) / values.length,
      current,
      years: values.length,
    });
  }

  return out;
}

/**
 * How the selected year stands against its own record so far: how many days ran
 * above the 90th percentile, below the 10th, and how many set an outright
 * record. Only days the selected year actually has a reading for are counted.
 */
export function yearTally(days: YearDay[]): {
  withData: number;
  aboveP90: number;
  belowP10: number;
  recordHigh: number;
  recordLow: number;
} {
  let withData = 0;
  let aboveP90 = 0;
  let belowP10 = 0;
  let recordHigh = 0;
  let recordLow = 0;

  for (const d of days) {
    if (d.current === null || d.years === 0) continue;
    withData++;
    if (d.p90 !== null && d.current > d.p90) aboveP90++;
    if (d.p10 !== null && d.current < d.p10) belowP10++;
    // >= because the year is part of its own envelope: a record day equals the max.
    if (d.recordMax !== null && d.current >= d.recordMax) recordHigh++;
    if (d.recordMin !== null && d.current <= d.recordMin) recordLow++;
  }

  return { withData, aboveP90, belowP10, recordHigh, recordLow };
}
