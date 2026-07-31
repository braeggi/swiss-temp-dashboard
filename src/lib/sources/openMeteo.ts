import type { DayPoint, Metric } from '../../types';
import type { FetchLike } from './stationIndex';

export interface GeocodeResult {
  name: string;
  lat: number;
  lon: number;
  altitude: number;
  admin1: string;
}

const GEO = 'https://geocoding-api.open-meteo.com/v1/search';
const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
const FORECAST = 'https://api.open-meteo.com/v1/forecast';

/** Earliest year in the ERA5 reanalysis archive. */
export const OPEN_METEO_FROM_YEAR = 1940;

export async function geocode(
  name: string,
  fetchImpl: FetchLike = globalThis.fetch,
): Promise<GeocodeResult[]> {
  const url = `${GEO}?name=${encodeURIComponent(name)}&count=8&countryCode=CH&language=de`;
  const res = await fetchImpl(url);
  if (!res.ok) return [];
  const body = (await res.json()) as {
    results?: Array<{
      name: string;
      latitude: number;
      longitude: number;
      elevation?: number;
      admin1?: string;
    }>;
  };
  return (body.results ?? []).map((r) => ({
    name: r.name,
    lat: r.latitude,
    lon: r.longitude,
    altitude: r.elevation ?? 0,
    admin1: r.admin1 ?? '',
  }));
}

const DAILY_VARS = 'temperature_2m_mean,temperature_2m_max,temperature_2m_min';

/** ERA5 reanalysis lags several days behind real time, so the archive rejects
 * an `end_date` that reaches all the way to 31 December of the current,
 * still-in-progress year. Cap the request at a safe distance behind today
 * instead of assuming the requested year has already finished. */
const ARCHIVE_LAG_DAYS = 6;

function safeEndDate(toYear: number): string {
  const requested = `${toYear}-12-31`;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - ARCHIVE_LAG_DAYS);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  return requested < cutoffIso ? requested : cutoffIso;
}

/**
 * One calendar day across every archive year, for a place with no nearby
 * station. Requests the whole archive span once and filters client-side, since
 * the API has no "same day every year" query.
 */
export async function openMeteoDaily(
  lat: number,
  lon: number,
  month: number,
  day: number,
  toYear: number,
  fetchImpl: FetchLike = globalThis.fetch,
): Promise<Record<Metric, DayPoint[]>> {
  const url =
    `${ARCHIVE}?latitude=${lat}&longitude=${lon}` +
    `&start_date=${OPEN_METEO_FROM_YEAR}-01-01&end_date=${safeEndDate(toYear)}` +
    `&daily=${DAILY_VARS}&timezone=Europe%2FZurich`;
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`Open-Meteo archive failed (${res.status})`);
  const body = (await res.json()) as {
    daily?: {
      time: string[];
      temperature_2m_mean: Array<number | null>;
      temperature_2m_max: Array<number | null>;
      temperature_2m_min: Array<number | null>;
    };
  };

  const out: Record<Metric, DayPoint[]> = { mean: [], max: [], min: [] };
  const d = body.daily;
  if (!d) return out;

  const suffix = `-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  for (let i = 0; i < d.time.length; i++) {
    if (!d.time[i].endsWith(suffix)) continue;
    const year = Number(d.time[i].slice(0, 4));
    const push = (m: Metric, v: number | null) => {
      if (v !== null) out[m].push({ year, value: v });
    };
    push('mean', d.temperature_2m_mean[i]);
    push('max', d.temperature_2m_max[i]);
    push('min', d.temperature_2m_min[i]);
  }
  return out;
}

export async function openMeteoCurrent(
  lat: number,
  lon: number,
  fetchImpl: FetchLike = globalThis.fetch,
): Promise<number | null> {
  const url = `${FORECAST}?latitude=${lat}&longitude=${lon}&current=temperature_2m&timezone=Europe%2FZurich`;
  const res = await fetchImpl(url);
  if (!res.ok) return null;
  const body = (await res.json()) as { current?: { temperature_2m?: number } };
  return body.current?.temperature_2m ?? null;
}
