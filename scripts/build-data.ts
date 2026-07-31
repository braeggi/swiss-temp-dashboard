// scripts/build-data.ts
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { decodeLatin1 } from '../src/lib/csv';
import { packRows, readDailyCsv, type Collection } from '../src/lib/dailyCsv';
import type { PackedStation, StationIndexEntry } from '../src/types';
import {
  parseInventoryCoverage,
  parseStationMeta,
  selectStations,
  type BuildTarget,
} from './lib/stationSet';

const BASE = 'https://data.geo.admin.ch';
const CONCURRENCY = 8;
const CACHE = new URL('../.cache/', import.meta.url);
const OUT = new URL('../public/data/', import.meta.url);
const FORCE = process.argv.includes('--force');

/** Fetch with an on-disk cache so repeated builds don't hammer a public API. */
async function fetchCached(url: string): Promise<string> {
  const key = createHash('sha1').update(url).digest('hex');
  const path = new URL(key, CACHE);
  if (!FORCE && existsSync(path)) return decodeLatin1(await readFile(path));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(path, buf);
  return decodeLatin1(buf);
}

function historicalUrl(t: BuildTarget): string {
  const lower = t.abbr.toLowerCase();
  return t.collection === 'nbcn'
    ? `${BASE}/ch.meteoschweiz.ogd-nbcn/${lower}/ogd-nbcn_${lower}_d_historical.csv`
    : `${BASE}/ch.meteoschweiz.ogd-smn/${lower}/ogd-smn_${lower}_d_historical.csv`;
}

async function buildOne(t: BuildTarget): Promise<StationIndexEntry> {
  const text = await fetchCached(historicalUrl(t));
  const rows = readDailyCsv(text, t.collection as Collection);
  if (rows.length === 0) throw new Error(`no rows for ${t.abbr}`);
  const packed = packRows(rows);

  const station: PackedStation = {
    abbr: t.abbr,
    name: t.name,
    canton: t.canton,
    lat: t.lat,
    lon: t.lon,
    altitude: t.altitude,
    source: t.collection,
    homogenised: t.homogenised,
    ...packed,
  };

  await writeFile(
    new URL(`stations/${t.abbr}.json`, OUT),
    JSON.stringify(station),
    'utf8',
  );

  return {
    abbr: station.abbr,
    name: station.name,
    canton: station.canton,
    lat: station.lat,
    lon: station.lon,
    altitude: station.altitude,
    source: station.source,
    homogenised: station.homogenised,
    fromYear: station.fromYear,
    toYear: station.toYear,
  };
}

/** Run tasks with a bounded number in flight. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<Array<{ item: T; result: R } | { item: T; error: Error }>> {
  const out: Array<{ item: T; result: R } | { item: T; error: Error }> = [];
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      const item = items[i];
      try {
        out[i] = { item, result: await fn(item) };
      } catch (e) {
        out[i] = { item, error: e as Error };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function main() {
  await mkdir(CACHE, { recursive: true });
  await mkdir(new URL('stations/', OUT), { recursive: true });

  console.log('fetching metadata…');
  const [metaText, invText] = await Promise.all([
    fetchCached(`${BASE}/ch.meteoschweiz.ogd-smn/ogd-smn_meta_stations.csv`),
    fetchCached(`${BASE}/ch.meteoschweiz.ogd-smn/ogd-smn_meta_datainventory.csv`),
  ]);

  const targets = selectStations(parseStationMeta(metaText), parseInventoryCoverage(invText));
  console.log(`${targets.length} stations with daily temperature`);

  const results = await mapLimit(targets, CONCURRENCY, async (t) => {
    const entry = await buildOne(t);
    console.log(`  ${t.abbr.padEnd(4)} ${t.collection} ${entry.fromYear}-${entry.toYear}`);
    return entry;
  });

  const index: StationIndexEntry[] = [];
  const failures: string[] = [];
  for (const r of results) {
    if ('result' in r) index.push(r.result);
    else failures.push(`${r.item.abbr}: ${r.error.message}`);
  }

  await writeFile(new URL('stations.json', OUT), JSON.stringify(index), 'utf8');

  console.log(`\nwrote ${index.length} stations`);
  if (failures.length > 0) {
    console.warn(`skipped ${failures.length}:`);
    for (const f of failures) console.warn(`  ${f}`);
  }
  // A handful of upstream gaps is normal; a broad failure is a real problem.
  if (failures.length > targets.length * 0.1) {
    console.error('more than 10% of stations failed');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
