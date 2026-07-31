import type { PackedStation } from '../../types';
import { decodeLatin1 } from '../csv';
import { packRows, readDailyCsv } from '../dailyCsv';
import { SLOTS_PER_YEAR, allocateSeries, encodeValue, indexFor } from '../packed';
import type { FetchLike } from './stationIndex';

const BASE = 'https://data.geo.admin.ch';

/**
 * Prebuilt station histories, keyed by abbreviation.
 *
 * These files are immutable between `build:data` runs and are 160-675 KB each,
 * so switching Zürich -> Aarau -> Zürich would otherwise re-download the first
 * one. Held for the lifetime of the page; the index is only ~150 stations and a
 * session touches a handful.
 *
 * Callers must treat the returned station as read-only. `mergeRecent` copies
 * before writing, so the cached base is never mutated through it.
 */
const stationCache = new Map<string, PackedStation>();

/** Drop the cache. Exists for tests; the app has no reason to call it. */
export function clearStationCache(): void {
  stationCache.clear();
}

export async function loadPackedStation(
  abbr: string,
  fetchImpl: FetchLike = globalThis.fetch,
): Promise<PackedStation> {
  const cached = stationCache.get(abbr);
  if (cached !== undefined) return cached;

  const res = await fetchImpl(`data/stations/${abbr}.json`);
  // Deliberately after the throw: a failed load must not be cached, or one
  // transient 500 would poison that station for the rest of the session.
  if (!res.ok) throw new Error(`Cannot load station ${abbr} (${res.status})`);
  const station = (await res.json()) as PackedStation;
  stationCache.set(abbr, station);
  return station;
}

function recentUrl(st: PackedStation): string {
  const lower = st.abbr.toLowerCase();
  return st.source === 'nbcn'
    ? `${BASE}/ch.meteoschweiz.ogd-nbcn/${lower}/ogd-nbcn_${lower}_d_recent.csv`
    : `${BASE}/ch.meteoschweiz.ogd-smn/${lower}/ogd-smn_${lower}_d_recent.csv`;
}

/**
 * Overlay the current-year daily file onto a prebuilt station.
 *
 * The build only covers years up to the last historical file, so without this
 * the dashboard would show nothing for the year in progress. A missing or
 * unreachable recent file is not an error: the history is still worth showing.
 */
export async function mergeRecent(
  st: PackedStation,
  fetchImpl: FetchLike = globalThis.fetch,
): Promise<PackedStation> {
  let text: string;
  try {
    const res = await fetchImpl(recentUrl(st));
    if (!res.ok) return st;
    text = decodeLatin1(await res.arrayBuffer());
  } catch {
    return st;
  }

  const rows = readDailyCsv(text, st.source === 'nbcn' ? 'nbcn' : 'smn');
  if (rows.length === 0) return st;

  const packedRecent = packRows(rows);
  const toYear = Math.max(st.toYear, packedRecent.toYear);
  if (toYear === st.toYear) {
    // Same span: write in place on copies.
    const out = { ...st, mean: [...st.mean], max: [...st.max], min: [...st.min] };
    applyRows(out, rows);
    return out;
  }

  // Grow the arrays to cover the new years, preserving existing values.
  const grown: PackedStation = {
    ...st,
    toYear,
    mean: allocateSeries(st.fromYear, toYear),
    max: allocateSeries(st.fromYear, toYear),
    min: allocateSeries(st.fromYear, toYear),
  };
  const oldLen = (st.toYear - st.fromYear + 1) * SLOTS_PER_YEAR;
  for (let i = 0; i < oldLen; i++) {
    grown.mean[i] = st.mean[i];
    grown.max[i] = st.max[i];
    grown.min[i] = st.min[i];
  }
  applyRows(grown, rows);
  return grown;
}

function applyRows(
  st: PackedStation,
  rows: ReturnType<typeof readDailyCsv>,
): void {
  for (const r of rows) {
    if (r.year < st.fromYear || r.year > st.toYear) continue;
    const i = indexFor(st.fromYear, r.year, r.month, r.day);
    st.mean[i] = encodeValue(r.mean);
    st.max[i] = encodeValue(r.max);
    st.min[i] = encodeValue(r.min);
  }
}
