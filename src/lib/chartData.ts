import type { DayPoint } from '../types';
import { trendPerCentury } from './series';

export interface TrendSegment {
  from: { x: number; y: number };
  to: { x: number; y: number };
}

/**
 * Recharts cannot fit a regression line, so express the trend as the two
 * endpoints of a straight segment through the series mean.
 */
export function trendSegment(points: DayPoint[]): TrendSegment | null {
  const perCentury = trendPerCentury(points);
  if (perCentury === null || points.length === 0) return null;

  const perYear = perCentury / 100;
  const years = points.map((p) => p.year);
  const firstYear = Math.min(...years);
  const lastYear = Math.max(...years);
  const meanYear = years.reduce((a, b) => a + b, 0) / years.length;
  const meanValue = points.reduce((a, p) => a + p.value, 0) / points.length;

  return {
    from: { x: firstYear, y: meanValue + (firstYear - meanYear) * perYear },
    to: { x: lastYear, y: meanValue + (lastYear - meanYear) * perYear },
  };
}

/**
 * The series the scatter should plot: the record, with today's provisional
 * reading folded in when the record does not already reach it.
 *
 * The packed history ends at the last year `build:data` ran, so today's value
 * arrives separately from the live feed. Drawing it only as a ReferenceDot left
 * it with no hit area at all — a ScatterChart's tooltip is item-based, so it
 * fires on the Scatter's own shapes and never on an overlay. The one point a
 * reader most wants to interrogate was the one point they could not.
 *
 * Deliberately returned apart from `points`: the trend line and the "every year
 * on record" table must keep seeing the completed record alone, or a half-
 * finished day would tug the regression and appear as a recorded year.
 */
export function withTodayPoint(
  points: DayPoint[],
  todayYear: number,
  todayValue: number | null,
): DayPoint[] {
  if (todayValue === null) return points;
  if (points.some((p) => p.year === todayYear)) return points;
  return [...points, { year: todayYear, value: todayValue }];
}

export function yDomain(points: DayPoint[], extra: number[]): [number, number] {
  const values = [...points.map((p) => p.value), ...extra];
  if (values.length === 0) return [0, 10];
  const lo = Math.floor(Math.min(...values) - 1);
  const hi = Math.ceil(Math.max(...values) + 1);
  return [lo, hi];
}
