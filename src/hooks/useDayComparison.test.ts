// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDayComparison } from './useDayComparison';
import { allocateSeries, encodeValue, indexFor } from '../lib/packed';
import type { PackedStation } from '../types';
import type { DaySoFar } from '../lib/dayAggregate';

/** A station whose mean/max/min all carry `value` on every 31 July. */
function stationWithJuly31(fromYear: number, toYear: number, valueByYear: Record<number, number>) {
  const mean = allocateSeries(fromYear, toYear);
  for (const [y, v] of Object.entries(valueByYear)) {
    mean[indexFor(fromYear, Number(y), 7, 31)] = encodeValue(v);
  }
  const st: PackedStation = {
    abbr: 'TST', name: 'Test', canton: 'ZH', lat: 47, lon: 8, altitude: 400,
    source: 'smn', homogenised: false, fromYear, toYear,
    mean, max: [...mean], min: [...mean],
  };
  return st;
}

const soFar = (mean: number): DaySoFar => ({
  mean, max: mean + 1, min: mean - 1, count: 12,
  latest: { year: 2026, month: 7, day: 31, hour: 12, minute: 0, celsius: mean },
});

describe('useDayComparison', () => {
  it('plots dayAcrossYears for a station, unwindowed', () => {
    const st = stationWithJuly31(2020, 2022, { 2020: 20, 2021: 22, 2022: 24 });
    const { result } = renderHook(() =>
      useDayComparison({
        place: null, placePoints: null, station: st, soFar: null,
        date: '2026-07-31', today: '2026-07-31', metric: 'mean', windowDays: 0,
      }),
    );
    expect(result.current.points.map((p) => p.value)).toEqual([20, 22, 24]);
  });

  it('reads placePoints instead of the station series for a geocoded place', () => {
    const place = { name: 'X', lat: 46, lon: 8, altitude: 500 };
    const placePoints = { mean: [{ year: 2020, value: 15 }], max: [], min: [] };
    const { result } = renderHook(() =>
      useDayComparison({
        place, placePoints, station: null, soFar: null,
        date: '2026-07-31', today: '2026-07-31', metric: 'mean', windowDays: 0,
      }),
    );
    expect(result.current.points).toEqual([{ year: 2020, value: 15 }]);
  });

  it('withholds effectiveSoFar for a geocoded place even when soFar is present', () => {
    const place = { name: 'X', lat: 46, lon: 8, altitude: 500 };
    const { result } = renderHook(() =>
      useDayComparison({
        place, placePoints: null, station: null, soFar: soFar(24),
        date: '2026-07-31', today: '2026-07-31', metric: 'mean', windowDays: 0,
      }),
    );
    expect(result.current.effectiveSoFar).toBeNull();
  });

  it('computes selectedYearValue only for a past date, not today', () => {
    const st = stationWithJuly31(2020, 2022, { 2020: 20, 2021: 22, 2022: 24 });
    const past = renderHook(() =>
      useDayComparison({
        place: null, placePoints: null, station: st, soFar: null,
        date: '2021-07-31', today: '2026-07-31', metric: 'mean', windowDays: 0,
      }),
    );
    expect(past.result.current.selectedYearValue).toBe(22);

    const today = renderHook(() =>
      useDayComparison({
        place: null, placePoints: null, station: st, soFar: null,
        date: '2026-07-31', today: '2026-07-31', metric: 'mean', windowDays: 0,
      }),
    );
    expect(today.result.current.selectedYearValue).toBeNull();
  });

  it('feeds soFar into the headline only for today, keyed to the selected metric', () => {
    const st = stationWithJuly31(2020, 2022, { 2020: 20, 2021: 22, 2022: 24 });
    const { result } = renderHook(() =>
      useDayComparison({
        place: null, placePoints: null, station: st, soFar: soFar(30),
        date: '2026-07-31', today: '2026-07-31', metric: 'mean', windowDays: 0,
      }),
    );
    expect(result.current.todayMarkerValue).toBe(30);
    expect(result.current.headline.provisional).toBe(true);
  });
});
