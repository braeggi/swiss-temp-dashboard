import type { Metric, PackedStation } from '../types';
import { countByYear, type Pole } from './thresholdDays';

/** Years per comparison window. A climate normal is 30; so is this. */
export const WINDOW_YEARS = 30;

/**
 * Two windows must fit without touching, or the comparison is partly against
 * itself. Sixty complete years is therefore the floor, not a preference.
 */
export const MIN_YEARS_FOR_SHIFT = WINDOW_YEARS * 2;

export interface FrequencyWindow {
  fromYear: number;
  toYear: number;
  /** Complete years in the window — always WINDOW_YEARS, reported for the text. */
  years: number;
  /** Mean days per year crossing the threshold. */
  perYear: number;
}

export interface FrequencyShift {
  early: FrequencyWindow;
  recent: FrequencyWindow;
  threshold: number;
  /** 'warm' counts days at or above the threshold, 'cool' at or below. */
  direction: Pole;
  /** recent ÷ early. Null when the early window never crossed the threshold. */
  factor: number | null;
}

/**
 * How much more (or less) often a day like this one happens now than it used to.
 *
 * A rank answers "how hot", which is a fact about today. This answers "how
 * often", which is a fact about the climate — and it is the one a reader can
 * check against their own memory. Both windows come from the station's own
 * record, so nothing outside the thermometer is being claimed.
 *
 * The windows are the first and last thirty *complete* years, not fixed
 * calendar periods: fixed periods would silently drop the sixty-odd stations
 * whose record starts after 1961. The years are returned so the caller can name
 * them, because "the first thirty years" means something different at every
 * station.
 */
export function frequencyShift(
  st: PackedStation,
  metric: Metric,
  threshold: number,
  direction: Pole,
): FrequencyShift | null {
  const test = direction === 'warm'
    ? (v: number) => v >= threshold
    : (v: number) => v <= threshold;

  const complete = countByYear(st, metric, test).filter(
    (y): y is { year: number; daysWithData: number; count: number } => y.count !== null,
  );
  if (complete.length < MIN_YEARS_FOR_SHIFT) return null;

  const window = (rows: typeof complete): FrequencyWindow => ({
    fromYear: rows[0].year,
    toYear: rows[rows.length - 1].year,
    years: rows.length,
    perYear: rows.reduce((a, r) => a + r.count, 0) / rows.length,
  });

  const early = window(complete.slice(0, WINDOW_YEARS));
  const recent = window(complete.slice(-WINDOW_YEARS));

  return {
    early,
    recent,
    threshold,
    direction,
    factor: early.perYear === 0 ? null : recent.perYear / early.perYear,
  };
}
