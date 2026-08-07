import { useMemo } from 'react';
import type { DayPoint, Metric } from '../types';
import type { DaySoFar } from '../lib/dayAggregate';
import type { PackedStation } from '../types';
import { dayAcrossYears, dayAcrossYearsWindowed, normDeviation } from '../lib/series';
import { buildHeadline, type Headline } from '../lib/headline';
import { parseIso } from '../lib/dateUtil';
import type { WindowDays } from '../components/WindowToggle';
import type { GeocodedPlace } from '../components/PlacePicker';

export interface DayComparison {
  points: DayPoint[];
  selectedYearValue: number | null;
  /** The 1991-2020 normal for this calendar day, or null if not computable. */
  dayNorm: number | null;
  /**
   * The live so-far value for the selected metric, or null when there is
   * none (a past date, a geocoded place, or no live reading yet). The
   * caller composes this with `selectedYearValue` to pick what to plot —
   * this hook does not do that fallback itself.
   */
  todayMarkerValue: number | null;
  /** `soFar`, withheld for a geocoded place — its live feed belongs to a nearby station, not the place itself. */
  effectiveSoFar: DaySoFar | null;
  headline: Headline;
}

/**
 * Everything needed to say "how does this day compare to history" for the
 * selected calendar day — shared between the answer layer (today's rank)
 * and the day-across-years chart (the plotted points), so the two can never
 * disagree about what "today" means.
 */
export function useDayComparison(args: {
  place: GeocodedPlace | null;
  placePoints: Record<Metric, DayPoint[]> | null;
  station: PackedStation | null;
  soFar: DaySoFar | null;
  date: string;
  today: string;
  metric: Metric;
  windowDays: WindowDays;
}): DayComparison {
  const { place, placePoints, station, soFar, date, today, metric, windowDays } = args;
  const isToday = date === today;
  const { month, day } = parseIso(date);

  const points = useMemo(() => {
    // Open-Meteo is fetched one calendar day at a time, so a geocoded place has
    // no neighbouring days to average — the caller disables the window control
    // for it rather than this silently returning an unsmoothed series.
    if (place !== null) return placePoints?.[metric] ?? [];
    if (!station) return [];
    return windowDays === 0
      ? dayAcrossYears(station, month, day, metric)
      : dayAcrossYearsWindowed(station, month, day, metric, windowDays);
  }, [place, placePoints, station, month, day, metric, windowDays]);

  const selectedYearValue = useMemo(() => {
    if (isToday) return null;
    const { year } = parseIso(date);
    return points.find((p) => p.year === year)?.value ?? null;
  }, [isToday, date, points]);

  // A geocoded place has no live station feed of its own, so the day-so-far
  // reading — which belongs to whichever station happens to be loaded — must
  // not leak into its headline ranking, even though it's already withheld
  // from display.
  const effectiveSoFar = place === null ? soFar : null;

  const todayMarkerValue = effectiveSoFar === null ? null : effectiveSoFar[metric];

  const headline = useMemo(
    () =>
      buildHeadline({
        points,
        soFar: effectiveSoFar,
        metric,
        isToday,
        selectedYearValue,
        windowDays: place === null ? windowDays : 0,
      }),
    [points, effectiveSoFar, metric, isToday, selectedYearValue, place, windowDays],
  );

  const dayNorm = useMemo(() => {
    if (points.length === 0) return null;
    const d = normDeviation(points, 0);
    return d === null ? null : -d;
  }, [points]);

  return { points, selectedYearValue, dayNorm, todayMarkerValue, effectiveSoFar, headline };
}
