import { describe, expect, it } from 'vitest';
import {
  daySoFar,
  formatZurichTime,
  isStale,
  parseLiveCsv,
  readingsOnZurichDate,
  zurichDateOf,
  type Reading,
} from './dayAggregate';
import { FIXTURES, fixtureText } from '../../tests/fixtures/paths';

describe('parseLiveCsv', () => {
  const readings = parseLiveCsv(fixtureText(FIXTURES.smnBasLive));

  it('reads tre200s0 into readings', () => {
    expect(readings.length).toBeGreaterThan(0);
    expect(typeof readings[0].celsius).toBe('number');
  });

  it('parses the timestamp into date and time parts', () => {
    const r = readings[0];
    expect(r.month).toBeGreaterThanOrEqual(1);
    expect(r.minute % 10).toBe(0);
  });

  it('skips rows with a blank temperature', () => {
    const text = [
      'station_abbr;reference_timestamp;tre200s0',
      'BAS;30.07.2026 00:00;23.4',
      'BAS;30.07.2026 00:10;',
      'BAS;30.07.2026 00:20;21.0',
    ].join('\n');
    expect(parseLiveCsv(text)).toHaveLength(2);
  });
});

describe('daySoFar', () => {
  const mk = (minute: number, celsius: number): Reading => ({
    year: 2026,
    month: 7,
    day: 30,
    hour: 0,
    minute,
    celsius,
  });

  it('returns null for no readings', () => {
    expect(daySoFar([])).toBeNull();
  });

  it('computes mean, max, min and count over a partial day', () => {
    const got = daySoFar([mk(0, 10), mk(10, 20), mk(20, 30)])!;
    expect(got.mean).toBeCloseTo(20, 6);
    expect(got.max).toBe(30);
    expect(got.min).toBe(10);
    expect(got.count).toBe(3);
  });

  it('reports the chronologically latest reading, not the last row', () => {
    const got = daySoFar([mk(20, 30), mk(0, 10), mk(10, 20)])!;
    expect(got.latest.minute).toBe(20);
    expect(got.latest.celsius).toBe(30);
  });

  it('handles a single reading', () => {
    const got = daySoFar([mk(0, 15)])!;
    expect(got.mean).toBe(15);
    expect(got.max).toBe(15);
    expect(got.min).toBe(15);
  });
});

describe('isStale', () => {
  // r's fields are UTC (as MeteoSwiss publishes them): this reading's instant
  // is 2026-07-30T12:00:00Z. `now` below is therefore expressed with an
  // explicit `Z` suffix too, so both sides of the comparison are the same
  // absolute instant — the point of the fix.
  const r: Reading = { year: 2026, month: 7, day: 30, hour: 12, minute: 0, celsius: 20 };

  it('accepts a fresh reading', () => {
    // 30 minutes old.
    expect(isStale(r, new Date('2026-07-30T12:30:00Z'))).toBe(false);
  });

  it('rejects a reading older than two hours', () => {
    // 3 hours old.
    expect(isStale(r, new Date('2026-07-30T15:00:00Z'))).toBe(true);
  });

  it('honours a custom age limit', () => {
    // 30 minutes old, but the caller only allows 20.
    expect(isStale(r, new Date('2026-07-30T12:30:00Z'), 20)).toBe(true);
  });
});

describe('formatZurichTime', () => {
  it('renders a UTC instant in CEST (summer, UTC+2) as Swiss local time', () => {
    // 2026-07-30T13:40:00Z observed live — Zurich is on CEST in July.
    const r: Reading = { year: 2026, month: 7, day: 30, hour: 13, minute: 40, celsius: 30 };
    expect(formatZurichTime(r)).toBe('15:40');
  });

  it('renders a UTC instant in CET (winter, UTC+1) as Swiss local time', () => {
    const r: Reading = { year: 2026, month: 1, day: 15, hour: 13, minute: 40, celsius: 3 };
    expect(formatZurichTime(r)).toBe('14:40');
  });
});

describe('zurichDateOf', () => {
  it('resolves a reading well before UTC midnight to the same Zurich calendar day', () => {
    // 2026-07-30T21:50Z = 2026-07-30 23:50 CEST — still 30 July in Zurich.
    const r: Reading = { year: 2026, month: 7, day: 30, hour: 21, minute: 50, celsius: 19 };
    expect(zurichDateOf(r)).toBe('2026-07-30');
  });

  it('resolves a reading just after UTC midnight to the next Zurich calendar day (CEST, UTC+2)', () => {
    // 2026-07-30T22:10Z = 2026-07-31 00:10 CEST — already 31 July in Zurich.
    const r: Reading = { year: 2026, month: 7, day: 30, hour: 22, minute: 10, celsius: 18 };
    expect(zurichDateOf(r)).toBe('2026-07-31');
  });
});

describe('readingsOnZurichDate', () => {
  // Spans the UTC-day boundary: the first reading is still 30 July in
  // Zurich (23:50 CEST); the other two are already 31 July (00:10, 01:00).
  const beforeZurichMidnight: Reading = {
    year: 2026,
    month: 7,
    day: 30,
    hour: 21,
    minute: 50,
    celsius: 19,
  };
  const justAfterZurichMidnight: Reading = {
    year: 2026,
    month: 7,
    day: 30,
    hour: 22,
    minute: 10,
    celsius: 18,
  };
  const laterOnTheNewZurichDay: Reading = {
    year: 2026,
    month: 7,
    day: 30,
    hour: 23,
    minute: 0,
    celsius: 17,
  };

  it('keeps only the readings on the requested Zurich day across a UTC-day boundary', () => {
    const readings = [beforeZurichMidnight, justAfterZurichMidnight, laterOnTheNewZurichDay];
    expect(readingsOnZurichDate(readings, '2026-07-31')).toEqual([
      justAfterZurichMidnight,
      laterOnTheNewZurichDay,
    ]);
    expect(readingsOnZurichDate(readings, '2026-07-30')).toEqual([beforeZurichMidnight]);
  });

  it('returns an empty array — not a crash — when nothing matches the requested day', () => {
    const readings = [beforeZurichMidnight];
    const kept = readingsOnZurichDate(readings, '2026-08-01');
    expect(kept).toEqual([]);
    // The empty-day path must degrade the same way a missing feed does.
    expect(daySoFar(kept)).toBeNull();
  });

  it('keeps every reading on an ordinary day with no boundary crossing', () => {
    const mk = (hour: number, minute: number, celsius: number): Reading => ({
      year: 2026,
      month: 7,
      day: 30,
      hour,
      minute,
      celsius,
    });
    const readings = [mk(10, 0, 25), mk(10, 10, 25.5), mk(10, 20, 26)];
    expect(readingsOnZurichDate(readings, '2026-07-30')).toEqual(readings);
    expect(daySoFar(readingsOnZurichDate(readings, '2026-07-30'))?.count).toBe(3);
  });
});
