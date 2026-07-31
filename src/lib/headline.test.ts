import { describe, expect, it } from 'vitest';
import { MIN_READINGS_FOR_RANK, buildHeadline, ordinal } from './headline';
import type { DayPoint } from '../types';
import type { DaySoFar } from './dayAggregate';

const points: DayPoint[] = [
  { year: 2020, value: 20 },
  { year: 2021, value: 22 },
  { year: 2022, value: 24 },
];

const soFar: DaySoFar = {
  mean: 21,
  max: 30,
  min: 12,
  latest: { year: 2026, month: 7, day: 30, hour: 14, minute: 20, celsius: 26.3 },
  count: 86,
};

describe('ordinal', () => {
  it('handles the teens correctly', () => {
    expect(ordinal(11)).toBe('11th');
    expect(ordinal(12)).toBe('12th');
    expect(ordinal(13)).toBe('13th');
  });

  it('handles 1, 2, 3 and 21', () => {
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(2)).toBe('2nd');
    expect(ordinal(3)).toBe('3rd');
    expect(ordinal(21)).toBe('21st');
  });
});

describe('buildHeadline', () => {
  it('compares the day-so-far value of the SAME metric, not the latest reading', () => {
    const h = buildHeadline({
      points,
      soFar,
      metric: 'max',
      isToday: true,
      selectedYearValue: null,
    });
    // soFar.max is 30, which beats every historical point.
    expect(h.comparedValue).toBe(30);
    expect(h.rank).toBe(1);
    expect(h.provisional).toBe(true);
  });

  it('uses the mean when the mean metric is selected', () => {
    const h = buildHeadline({
      points,
      soFar,
      metric: 'mean',
      isToday: true,
      selectedYearValue: null,
    });
    // 22 and 24 are warmer than 21, so this is the 3rd-warmest of three.
    expect(h.comparedValue).toBe(21);
    expect(h.rank).toBe(3);
  });

  it('is not provisional for a past date and uses that year value', () => {
    const h = buildHeadline({
      points,
      soFar: null,
      metric: 'mean',
      isToday: false,
      selectedYearValue: 24,
    });
    expect(h.provisional).toBe(false);
    expect(h.comparedValue).toBe(24);
    expect(h.rank).toBe(1);
  });

  it('reports total and extremes', () => {
    const h = buildHeadline({
      points,
      soFar,
      metric: 'mean',
      isToday: true,
      selectedYearValue: null,
    });
    expect(h.total).toBe(3);
    expect(h.hottest).toEqual({ year: 2022, value: 24 });
    expect(h.coldest).toEqual({ year: 2020, value: 20 });
  });

  it('withholds the rank until enough of the day has elapsed', () => {
    // One 10-minute reading is not a day. Ranking an overnight sample against
    // 162 full-day means invites exactly the over-reading that the UTC-day bug
    // produced, so below MIN_READINGS_FOR_RANK there is nothing to compare.
    const h = buildHeadline({
      points,
      soFar: { ...soFar, count: 1 },
      metric: 'mean',
      isToday: true,
      selectedYearValue: null,
    });
    expect(h.comparedValue).toBeNull();
    expect(h.rank).toBeNull();
    expect(h.deviation).toBeNull();
  });

  it('still reports the day-so-far figures while withholding the rank', () => {
    // The card shows max/mean/min from soFar directly, so suppressing the rank
    // must not blank the reading itself.
    const h = buildHeadline({
      points,
      soFar: { ...soFar, count: 1 },
      metric: 'mean',
      isToday: true,
      selectedYearValue: null,
    });
    expect(h.provisional).toBe(true);
    expect(h.total).toBe(3);
    expect(h.hottest).toEqual({ year: 2022, value: 24 });
  });

  it('ranks once the reading count reaches the threshold', () => {
    const h = buildHeadline({
      points,
      soFar: { ...soFar, count: MIN_READINGS_FOR_RANK },
      metric: 'mean',
      isToday: true,
      selectedYearValue: null,
    });
    expect(h.comparedValue).toBe(21);
    expect(h.rank).toBe(3);
  });

  it('never withholds the rank for a finished past day', () => {
    // A past date has no soFar at all; the threshold must not apply to it.
    const h = buildHeadline({
      points,
      soFar: null,
      metric: 'mean',
      isToday: false,
      selectedYearValue: 24,
    });
    expect(h.comparedValue).toBe(24);
    expect(h.rank).toBe(1);
  });

  it('yields a null rank when there is nothing to compare', () => {
    const h = buildHeadline({
      points,
      soFar: null,
      metric: 'mean',
      isToday: true,
      selectedYearValue: null,
    });
    expect(h.rank).toBeNull();
    expect(h.comparedValue).toBeNull();
  });

  it('suppresses deviation when the norm window is too thin', () => {
    const h = buildHeadline({
      points,
      soFar,
      metric: 'mean',
      isToday: true,
      selectedYearValue: null,
    });
    expect(h.deviation).toBeNull();
  });
});

describe('buildHeadline with an averaging window', () => {
  it('withholds today\'s rank when the history is smoothed', () => {
    // Historical points are ±N-day averages; today's partial day is not, and
    // cannot be. Scoring one against the other inflates the rank.
    const h = buildHeadline({
      points, soFar, metric: 'mean', isToday: true, selectedYearValue: null, windowDays: 7,
    });
    expect(h.comparedValue).toBeNull();
    expect(h.rank).toBeNull();
  });

  it('still ranks today when no window is applied', () => {
    const h = buildHeadline({
      points, soFar, metric: 'mean', isToday: true, selectedYearValue: null, windowDays: 0,
    });
    expect(h.rank).toBe(3);
  });

  it('still ranks a past date under a window, which is like-for-like', () => {
    // selectedYearValue is read from the same smoothed series as `points`.
    const h = buildHeadline({
      points, soFar: null, metric: 'mean', isToday: false, selectedYearValue: 24, windowDays: 7,
    });
    expect(h.comparedValue).toBe(24);
    expect(h.rank).toBe(1);
  });
});
