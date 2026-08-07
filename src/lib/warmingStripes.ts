import type { DayPoint } from '../types';
import { MIN_YEARS_FOR_NORM } from './series';

/**
 * The reference period the stripes are coloured against.
 *
 * 1961-1990 is the period the original warming stripes use, so the graphic
 * means the same thing here as everywhere else it appears. It is also cooler
 * than the present, which is why recent decades run red — that is a property of
 * the choice, not of the drawing, and the caption names the period for exactly
 * that reason.
 */
export const REFERENCE_FROM = 1961;
export const REFERENCE_TO = 1990;

/** Steps either side of neutral. Nine colours in total. */
export const STRIPE_MAX_STEP = 4;

/**
 * How far the ramp reaches, in standard deviations of the reference period.
 * Beyond this the stripe saturates instead of running off the end.
 */
export const STRIPE_SPAN_SD = 2.6;

export interface Stripe {
  year: number;
  /** The year's mean of daily means. */
  value: number;
  /** Difference from the reference-period mean. */
  anomaly: number;
  /** −4 … 0 … 4, indexing the colour ramp. */
  step: number;
}

export interface StripeReference {
  fromYear: number;
  toYear: number;
  /** Complete years found inside the reference period. */
  years: number;
  mean: number;
  sd: number;
}

export interface StripeWindow {
  fromYear: number;
  toYear: number;
  mean: number;
}

export interface StripeShift {
  early: StripeWindow;
  recent: StripeWindow;
  /** recent − early, in °C. */
  delta: number;
}

export interface WarmingStripes {
  stripes: Stripe[];
  reference: StripeReference;
  /**
   * What the first and last thirty complete years averaged.
   *
   * The colour field shows that something moved; this says how far. Null when
   * the record cannot carry two windows without overlapping, because a figure
   * off overlapping windows compares a period partly against itself.
   */
  shift: StripeShift | null;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Annual means turned into coloured stripes against a fixed reference period.
 *
 * Steps are scaled to the reference period's own spread rather than to a fixed
 * number of degrees. A station on the plateau and one in an alpine valley have
 * very different year-to-year variability, and a fixed scale would make the
 * steady one look alarming and the volatile one look calm — the ramp would then
 * be reporting variability, not change.
 *
 * Returns null when the reference period is too thin to anchor on. Roughly a
 * third of the network opened after 1961, and a baseline invented from six
 * years would put every later stripe on a number that means nothing.
 */
export function warmingStripes(annual: DayPoint[]): WarmingStripes | null {
  const inRef = annual.filter((p) => p.year >= REFERENCE_FROM && p.year <= REFERENCE_TO);
  if (inRef.length < MIN_YEARS_FOR_NORM) return null;

  const mean = inRef.reduce((a, p) => a + p.value, 0) / inRef.length;
  const variance = inRef.reduce((a, p) => a + (p.value - mean) ** 2, 0) / inRef.length;
  const sd = Math.sqrt(variance);

  // A reference period with no spread at all cannot scale anything. Real
  // records never do this; synthetic ones can, and dividing by it would put
  // every stripe at an end of the ramp.
  const perStep = sd === 0 ? Infinity : (sd * STRIPE_SPAN_SD) / STRIPE_MAX_STEP;

  const stripes = annual.map((p) => {
    const anomaly = p.value - mean;
    return {
      year: p.year,
      value: p.value,
      anomaly,
      step: clamp(Math.round(anomaly / perStep), -STRIPE_MAX_STEP, STRIPE_MAX_STEP),
    };
  });

  return {
    stripes,
    reference: { fromYear: REFERENCE_FROM, toYear: REFERENCE_TO, years: inRef.length, mean, sd },
    shift: shiftAcross(annual),
  };
}

/** Years per window for the warming figure — a climate normal's worth. */
const SHIFT_WINDOW = 30;

function shiftAcross(annual: DayPoint[]): StripeShift | null {
  if (annual.length < SHIFT_WINDOW * 2) return null;
  const window = (rows: DayPoint[]): StripeWindow => ({
    fromYear: rows[0].year,
    toYear: rows[rows.length - 1].year,
    mean: rows.reduce((a, p) => a + p.value, 0) / rows.length,
  });
  const early = window(annual.slice(0, SHIFT_WINDOW));
  const recent = window(annual.slice(-SHIFT_WINDOW));
  return { early, recent, delta: recent.mean - early.mean };
}
