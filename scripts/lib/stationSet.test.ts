// scripts/lib/stationSet.test.ts
import { describe, expect, it } from 'vitest';
import {
  NBCN_ABBRS,
  parseInventoryCoverage,
  parseStationMeta,
  selectStations,
} from './stationSet';
import { FIXTURES, fixtureText } from '../../tests/fixtures/paths';

describe('NBCN_ABBRS', () => {
  it('lists the 29 homogenised stations', () => {
    expect(NBCN_ABBRS.size).toBe(29);
    expect(NBCN_ABBRS.has('BAS')).toBe(true);
    expect(NBCN_ABBRS.has('BUS')).toBe(false);
  });
});

describe('parseStationMeta', () => {
  const meta = parseStationMeta(fixtureText(FIXTURES.smnStations));

  it('reads coordinates, altitude and canton', () => {
    const bas = meta.get('BAS')!;
    expect(bas.name).toBe('Basel / Binningen');
    expect(bas.canton).toBe('BL');
    expect(bas.lat).toBeCloseTo(47.541142, 4);
    expect(bas.altitude).toBeCloseTo(316, 1);
  });

  it('decodes non-ASCII names', () => {
    expect(meta.get('GRC')!.name).toBe('Grächen');
  });
});

describe('parseInventoryCoverage', () => {
  const cov = parseInventoryCoverage(fixtureText(FIXTURES.smnInventory));

  it('uses the daily-mean parameter start year, not the station founding year', () => {
    // The station index claims BUS has data since 1959; tre200d0 starts 1984.
    expect(cov.get('BUS')).toBe(1984);
  });

  it('reports 1864 for Basel', () => {
    expect(cov.get('BAS')).toBe(1864);
  });

  it('omits stations whose series has ended', () => {
    const text = [
      'station_abbr;parameter_shortname;meas_cat_nr;data_since;data_till;owner',
      'AAA;tre200d0;1;01.01.1990 00:00;31.12.2000 00:00;MeteoSchweiz',
      'BBB;tre200d0;1;01.01.1990 00:00;;MeteoSchweiz',
    ].join('\n');
    const c = parseInventoryCoverage(text);
    expect(c.has('AAA')).toBe(false);
    expect(c.get('BBB')).toBe(1990);
  });
});

describe('selectStations', () => {
  it('routes NBCN members to the nbcn collection and the rest to smn', () => {
    const meta = parseStationMeta(fixtureText(FIXTURES.smnStations));
    const cov = parseInventoryCoverage(fixtureText(FIXTURES.smnInventory));
    const targets = selectStations(meta, cov);

    const bas = targets.find((t) => t.abbr === 'BAS')!;
    const bus = targets.find((t) => t.abbr === 'BUS')!;
    expect(bas.collection).toBe('nbcn');
    expect(bas.homogenised).toBe(true);
    expect(bus.collection).toBe('smn');
    expect(bus.homogenised).toBe(false);
  });

  it('skips stations with no daily-temperature coverage', () => {
    const meta = new Map([
      ['ZZZ', { abbr: 'ZZZ', name: 'Nowhere', canton: 'ZH', lat: 47, lon: 8, altitude: 400 }],
    ]);
    expect(selectStations(meta, new Map())).toEqual([]);
  });
});
