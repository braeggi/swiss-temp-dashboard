import { columnIndex, parseNumberOrNull, parseSemicolonCsv, parseSwissDate } from './csv';

/**
 * One 10-minute live reading, as published in MeteoSwiss's `_t_now.csv` feed.
 *
 * `year`/`month`/`day`/`hour`/`minute` are **UTC**, not Swiss local time —
 * MeteoSwiss's open-data documentation states `reference_timestamp` is UTC.
 * Never build a `Date` from these fields with the local-time constructor
 * (`new Date(year, month - 1, day, hour, minute)`); that silently
 * reinterprets a UTC instant as local and is wrong by 1–2 hours depending on
 * DST. Use `Date.UTC(...)` (see `isStale`) or `formatZurichTime` for display.
 */
export interface Reading {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  celsius: number;
}

export interface DaySoFar {
  mean: number;
  max: number;
  min: number;
  latest: Reading;
  count: number;
}

const TIME = /\s(\d{2}):(\d{2})$/;

export function parseLiveCsv(text: string): Reading[] {
  const { header, rows } = parseSemicolonCsv(text);
  const ts = columnIndex(header, 'reference_timestamp');
  const iTemp = columnIndex(header, 'tre200s0');

  const out: Reading[] = [];
  for (const r of rows) {
    const celsius = parseNumberOrNull(r[iTemp]);
    if (celsius === null) continue;
    const { year, month, day } = parseSwissDate(r[ts]);
    const t = TIME.exec(r[ts]);
    out.push({
      year,
      month,
      day,
      hour: t ? Number(t[1]) : 0,
      minute: t ? Number(t[2]) : 0,
      celsius,
    });
  }
  return out;
}

const minutesOfDay = (r: Reading) => r.hour * 60 + r.minute;

/**
 * Aggregate the day's readings so far. The result is provisional until midnight:
 * `max` is a running maximum and `mean` covers only the elapsed part of the day.
 * Callers must label it as in progress rather than compare it to a finished day.
 */
export function daySoFar(readings: Reading[]): DaySoFar | null {
  if (readings.length === 0) return null;
  let sum = 0;
  let max = -Infinity;
  let min = Infinity;
  let latest = readings[0];
  for (const r of readings) {
    sum += r.celsius;
    if (r.celsius > max) max = r.celsius;
    if (r.celsius < min) min = r.celsius;
    if (minutesOfDay(r) > minutesOfDay(latest)) latest = r;
  }
  return { mean: sum / readings.length, max, min, latest, count: readings.length };
}

export function isStale(latest: Reading, now: Date, maxAgeMinutes = 120): boolean {
  const at = new Date(
    Date.UTC(latest.year, latest.month - 1, latest.day, latest.hour, latest.minute),
  );
  const ageMinutes = (now.getTime() - at.getTime()) / 60000;
  return ageMinutes > maxAgeMinutes;
}

/**
 * Render a `Reading`'s UTC instant as Swiss wall-clock `HH:MM`.
 * Uses `Intl.DateTimeFormat` with the `Europe/Zurich` time zone so the
 * CET/CEST offset is resolved correctly for the given date — never
 * hardcode a +1/+2 offset, since it changes with daylight saving.
 */
export function formatZurichTime(reading: Reading): string {
  const at = new Date(
    Date.UTC(reading.year, reading.month - 1, reading.day, reading.hour, reading.minute),
  );
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Zurich',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(at);
}

/**
 * A reading's Europe/Zurich calendar date, as `YYYY-MM-DD`. `_t_now.csv` is
 * scoped to a single UTC day, which does not line up with the Swiss local
 * day for the 1–2 hours (CET/CEST) around local midnight — this lets callers
 * filter a feed's readings down to the local day actually in view instead of
 * trusting the feed's UTC day wholesale. Derived the same DST-safe way as
 * `formatZurichTime`: never add or subtract a fixed offset.
 */
export function zurichDateOf(reading: Reading): string {
  const at = new Date(
    Date.UTC(reading.year, reading.month - 1, reading.day, reading.hour, reading.minute),
  );
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Zurich',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

/**
 * Keep only the readings whose Europe/Zurich calendar date matches
 * `zurichDay` (`YYYY-MM-DD`). Pure and clock-independent: callers pass in the
 * day they mean by "today" rather than this function assuming `now`, which
 * keeps it deterministically testable.
 */
export function readingsOnZurichDate(readings: Reading[], zurichDay: string): Reading[] {
  return readings.filter((r) => zurichDateOf(r) === zurichDay);
}
