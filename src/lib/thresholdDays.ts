import type { PackedStation } from '../types';
import { SLOTS_PER_YEAR, decodeValue } from './packed';

/**
 * The standard Swiss threshold-day definitions.
 *
 * These are the categories MeteoSwiss reports on, and they say more about lived
 * experience than a daily mean does: "eleven hot days a year instead of four"
 * lands where "+1.9 °C per century" does not.
 */
export const THRESHOLDS = [
  { key: 'summerDays', label: 'Summer days', short: '≥ 25 °C', metric: 'max', pole: 'warm', test: (v: number) => v >= 25 },
  { key: 'hotDays', label: 'Hot days', short: '≥ 30 °C', metric: 'max', pole: 'warm', test: (v: number) => v >= 30 },
  { key: 'tropicalNights', label: 'Tropical nights', short: 'min ≥ 20 °C', metric: 'min', pole: 'warm', test: (v: number) => v >= 20 },
  { key: 'frostDays', label: 'Frost days', short: 'min < 0 °C', metric: 'min', pole: 'cool', test: (v: number) => v < 0 },
  { key: 'iceDays', label: 'Ice days', short: 'max < 0 °C', metric: 'max', pole: 'cool', test: (v: number) => v < 0 },
] as const;

/**
 * Which end of the temperature scale a threshold belongs to.
 *
 * Counting frost days in a warm hue is simply wrong: temperature is a diverging
 * quantity and the reader decodes warm/cool before they read the label. The
 * pole drives the bar colour so the chart agrees with its own title.
 */
export type Pole = (typeof THRESHOLDS)[number]['pole'];

export type ThresholdKey = (typeof THRESHOLDS)[number]['key'];

export const isThresholdKey = (s: string): s is ThresholdKey =>
  THRESHOLDS.some((t) => t.key === s);

/**
 * A year is only counted when nearly all its days are present.
 *
 * Without this, a year with a three-month outage reports few hot days and reads
 * as a cool year — the count would measure data coverage, not climate. 330 of
 * 365 is strict enough to exclude real gaps while tolerating the odd missing
 * day that every long record has.
 */
export const MIN_DAYS_FOR_YEAR = 330;

export interface ThresholdYear {
  year: number;
  /** Days with a usable reading for the metric this threshold needs. */
  daysWithData: number;
  /** Null when the year is too incomplete to count honestly. */
  count: number | null;
}

/**
 * Count, for every year, how many days cross the given threshold.
 *
 * Reads the packed arrays directly. Note that min/max series start decades
 * later than the mean at most stations (1897 at Basel, 1882 at Zürich), so a
 * threshold series is shorter than the station's mean series — that is missing
 * history, not a bug, and the caller should surface the real span.
 */
export function thresholdDays(st: PackedStation, key: ThresholdKey): ThresholdYear[] {
  const spec = THRESHOLDS.find((t) => t.key === key);
  if (spec === undefined) throw new Error(`Unknown threshold: ${key}`);
  const arr = spec.metric === 'max' ? st.max : st.min;

  const out: ThresholdYear[] = [];
  for (let year = st.fromYear; year <= st.toYear; year++) {
    const base = (year - st.fromYear) * SLOTS_PER_YEAR;
    let daysWithData = 0;
    let hits = 0;
    for (let s = 0; s < SLOTS_PER_YEAR; s++) {
      const v = decodeValue(arr[base + s]);
      if (v === null) continue;
      daysWithData++;
      if (spec.test(v)) hits++;
    }
    out.push({
      year,
      daysWithData,
      count: daysWithData >= MIN_DAYS_FOR_YEAR ? hits : null,
    });
  }
  return out;
}

export interface DecadeSummary {
  /** First year of the decade, e.g. 1990 for the 1990s. */
  decade: number;
  years: number;
  /** Mean days per year across the complete years in this decade. */
  perYear: number;
}

/**
 * Average per decade, over the complete years only.
 *
 * Decades are the shortest window in which a threshold count is worth reading:
 * single years swing wildly with one hot summer, and the whole point is the
 * shift underneath that noise. Partial decades at either end are included but
 * report how many years they rest on, so a two-year decade cannot masquerade
 * as a settled figure.
 */
export function byDecade(years: ThresholdYear[]): DecadeSummary[] {
  const buckets = new Map<number, number[]>();
  for (const y of years) {
    if (y.count === null) continue;
    const d = Math.floor(y.year / 10) * 10;
    const list = buckets.get(d) ?? [];
    list.push(y.count);
    buckets.set(d, list);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([decade, counts]) => ({
      decade,
      years: counts.length,
      perYear: counts.reduce((a, b) => a + b, 0) / counts.length,
    }));
}

/**
 * Change between the first and last complete decade, for the headline line.
 * Returns null unless there are at least three decades to compare across —
 * two adjacent decades is weather, not a shift.
 */
export function decadeChange(
  decades: DecadeSummary[],
): { from: DecadeSummary; to: DecadeSummary; delta: number } | null {
  const solid = decades.filter((d) => d.years >= 5);
  if (solid.length < 3) return null;
  const from = solid[0];
  const to = solid[solid.length - 1];
  return { from, to, delta: to.perYear - from.perYear };
}
