// tests/fixtures/paths.ts
import { readFileSync } from 'node:fs';
import { decodeLatin1 } from '../../src/lib/csv';

const dir = new URL('./', import.meta.url);

export function fixtureText(name: string): string {
  return decodeLatin1(readFileSync(new URL(name, dir)));
}

export const FIXTURES = {
  nbcnBasDaily: 'ogd-nbcn_bas_d_trimmed.csv',
  smnBusDaily: 'ogd-smn_bus_d_trimmed.csv',
  smnBasLive: 'ogd-smn_bas_t_now.csv',
  smnStations: 'ogd-smn_meta_stations_sample.csv',
  smnInventory: 'ogd-smn_meta_datainventory_sample.csv',
} as const;
