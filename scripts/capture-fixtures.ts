// scripts/capture-fixtures.ts
import { mkdir, writeFile } from 'node:fs/promises';
import { decodeLatin1, parseSemicolonCsv } from '../src/lib/csv';

const OUT = new URL('../tests/fixtures/', import.meta.url);
const KEEP_DATES = new Set(['30.07', '29.02', '01.03']);

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return decodeLatin1(await res.arrayBuffer());
}

/** Keep the header plus rows whose DD.MM prefix is in KEEP_DATES. */
function trimByDate(text: string): string {
  const { header, rows } = parseSemicolonCsv(text);
  const kept = rows.filter((r) => KEEP_DATES.has(r[1]?.slice(0, 5) ?? ''));
  return [header.join(';'), ...kept.map((r) => r.join(';'))].join('\n') + '\n';
}

/** Keep the header plus the first `n` rows. */
function trimHead(text: string, n: number): string {
  const { header, rows } = parseSemicolonCsv(text);
  return [header.join(';'), ...rows.slice(0, n).map((r) => r.join(';'))].join('\n') + '\n';
}

const BASE = 'https://data.geo.admin.ch';

async function main() {
  await mkdir(OUT, { recursive: true });

  const nbcnBas = await fetchText(
    `${BASE}/ch.meteoschweiz.ogd-nbcn/bas/ogd-nbcn_bas_d_historical.csv`,
  );
  await writeFile(new URL('ogd-nbcn_bas_d_trimmed.csv', OUT), trimByDate(nbcnBas), 'latin1');

  const smnBus = await fetchText(
    `${BASE}/ch.meteoschweiz.ogd-smn/bus/ogd-smn_bus_d_historical.csv`,
  );
  await writeFile(new URL('ogd-smn_bus_d_trimmed.csv', OUT), trimByDate(smnBus), 'latin1');

  const live = await fetchText(`${BASE}/ch.meteoschweiz.ogd-smn/bas/ogd-smn_bas_t_now.csv`);
  await writeFile(new URL('ogd-smn_bas_t_now.csv', OUT), live, 'latin1');

  const stations = await fetchText(`${BASE}/ch.meteoschweiz.ogd-smn/ogd-smn_meta_stations.csv`);
  await writeFile(
    new URL('ogd-smn_meta_stations_sample.csv', OUT),
    trimHead(stations, 400),
    'latin1',
  );

  const inv = await fetchText(
    `${BASE}/ch.meteoschweiz.ogd-smn/ogd-smn_meta_datainventory.csv`,
  );
  // Keep only temperature parameters, so the sample stays small but complete.
  const { header, rows } = parseSemicolonCsv(inv);
  const tempRows = rows.filter((r) => r[1]?.startsWith('tre200'));
  await writeFile(
    new URL('ogd-smn_meta_datainventory_sample.csv', OUT),
    [header.join(';'), ...tempRows.map((r) => r.join(';'))].join('\n') + '\n',
    'latin1',
  );

  console.log('fixtures written');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
