// scripts/lib/stationSet.ts
import { columnIndex, parseNumberOrNull, parseSemicolonCsv, parseSwissDate } from '../../src/lib/csv';
import type { Collection } from '../../src/lib/dailyCsv';

/** The 29 stations with homogenised series, from ogd-nbcn_meta_stations.csv. */
export const NBCN_ABBRS = new Set(
  (
    'ALT ANT BAS BER CDF CHD CHM DAV ELM ENG GRC GRH GSB GVE JUN LUG LUZ MER NEU ' +
    'OTL PAY RAG SAE SAM SBE SIA SIO SMA STG'
  ).split(' '),
);

export interface StationMeta {
  abbr: string;
  name: string;
  canton: string;
  lat: number;
  lon: number;
  altitude: number;
}

export interface BuildTarget extends StationMeta {
  collection: Collection;
  homogenised: boolean;
  coverageFromYear: number;
}

export function parseStationMeta(text: string): Map<string, StationMeta> {
  const { header, rows } = parseSemicolonCsv(text);
  const i = {
    abbr: columnIndex(header, 'station_abbr'),
    name: columnIndex(header, 'station_name'),
    canton: columnIndex(header, 'station_canton'),
    lat: columnIndex(header, 'station_coordinates_wgs84_lat'),
    lon: columnIndex(header, 'station_coordinates_wgs84_lon'),
    alt: columnIndex(header, 'station_height_masl'),
  };
  const out = new Map<string, StationMeta>();
  for (const r of rows) {
    const lat = parseNumberOrNull(r[i.lat]);
    const lon = parseNumberOrNull(r[i.lon]);
    const altitude = parseNumberOrNull(r[i.alt]);
    if (lat === null || lon === null || altitude === null) continue;
    out.set(r[i.abbr], {
      abbr: r[i.abbr],
      name: r[i.name],
      canton: r[i.canton],
      lat,
      lon,
      altitude,
    });
  }
  return out;
}

/**
 * First year of daily-mean temperature per station, for stations still reporting.
 *
 * This is the authoritative coverage. `station_data_since` in the station index
 * is when the station was founded and can be decades earlier — Buchs / Aarau
 * reports 1959 there but its temperature series begins in 1984.
 */
export function parseInventoryCoverage(text: string): Map<string, number> {
  const { header, rows } = parseSemicolonCsv(text);
  const iAbbr = columnIndex(header, 'station_abbr');
  const iParam = columnIndex(header, 'parameter_shortname');
  const iSince = columnIndex(header, 'data_since');
  const iTill = columnIndex(header, 'data_till');

  const out = new Map<string, number>();
  for (const r of rows) {
    if (r[iParam] !== 'tre200d0') continue;
    if ((r[iTill] ?? '').trim() !== '') continue; // series has ended
    const year = parseSwissDate(r[iSince]).year;
    const prev = out.get(r[iAbbr]);
    if (prev === undefined || year < prev) out.set(r[iAbbr], year);
  }
  return out;
}

export function selectStations(
  meta: Map<string, StationMeta>,
  coverage: Map<string, number>,
): BuildTarget[] {
  const out: BuildTarget[] = [];
  for (const [abbr, m] of meta) {
    const coverageFromYear = coverage.get(abbr);
    if (coverageFromYear === undefined) continue;
    const homogenised = NBCN_ABBRS.has(abbr);
    out.push({
      ...m,
      collection: homogenised ? 'nbcn' : 'smn',
      homogenised,
      coverageFromYear,
    });
  }
  out.sort((a, b) => a.abbr.localeCompare(b.abbr));
  return out;
}
