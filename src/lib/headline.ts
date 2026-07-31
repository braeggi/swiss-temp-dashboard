import type { DayPoint, Metric } from '../types';
import type { DaySoFar } from './dayAggregate';
import { extremes, normDeviation, rankDescending } from './series';

/**
 * Minimum 10-minute readings before today's partial day is ranked at all.
 *
 * Three readings is half an hour of data. Below that the "day so far" is
 * essentially a single overnight sample, and ranking it against full-day
 * historical means is the same category error the rest of this module exists
 * to prevent — just smaller. Shortly after local midnight the app would
 * otherwise announce an ordinal ("21st-warmest of 42 years") derived from one
 * measurement, which reads as a finding rather than the noise it is.
 */
export const MIN_READINGS_FOR_RANK = 3;

export interface Headline {
  rank: number | null;
  total: number;
  deviation: number | null;
  hottest: DayPoint | null;
  coldest: DayPoint | null;
  /** True when the compared value comes from a day still in progress. */
  provisional: boolean;
  comparedValue: number | null;
}

export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/**
 * Pick the value to rank against history.
 *
 * Ranking an instantaneous reading against historical daily means is a category
 * error, so for today we take the day-so-far figure for the *same* metric the
 * user selected, and mark it provisional because the day is not over.
 */
export function buildHeadline(args: {
  points: DayPoint[];
  soFar: DaySoFar | null;
  metric: Metric;
  isToday: boolean;
  selectedYearValue: number | null;
  /** Averaging half-width applied to `points`. 0 = single calendar day. */
  windowDays?: number;
}): Headline {
  const { points, soFar, metric, isToday, selectedYearValue, windowDays = 0 } = args;

  let comparedValue: number | null;
  let provisional: boolean;
  if (isToday) {
    // Withhold the comparison — not the reading — until the day has produced
    // enough samples to be worth ranking. `provisional` still reflects that a
    // live day is in progress, so the card keeps showing max/mean/min.
    //
    // A window also disqualifies today from ranking: the historical points are
    // averaged over +-N days, but today's partial day cannot be — there are no
    // future days to average with. A single unsmoothed day scored against a
    // smoothed (and therefore narrower) distribution ranks systematically too
    // high. A past date is unaffected: its value comes from the same smoothed
    // series as the points it is compared against, so that stays like-for-like.
    const enoughData = soFar !== null && soFar.count >= MIN_READINGS_FOR_RANK;
    comparedValue = enoughData && windowDays === 0 ? soFar[metric] : null;
    provisional = soFar !== null;
  } else {
    comparedValue = selectedYearValue;
    provisional = false;
  }

  const ext = extremes(points);
  return {
    rank: comparedValue === null ? null : rankDescending(points, comparedValue),
    total: points.length,
    deviation: comparedValue === null ? null : normDeviation(points, comparedValue),
    hottest: ext?.hottest ?? null,
    coldest: ext?.coldest ?? null,
    provisional,
    comparedValue,
  };
}
