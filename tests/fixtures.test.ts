// tests/fixtures.test.ts
import { describe, expect, it } from 'vitest';
import { columnIndex, parseSemicolonCsv } from '../src/lib/csv';
import { FIXTURES, fixtureText } from './fixtures/paths';

describe('NBCN Basel fixture', () => {
  const { header, rows } = parseSemicolonCsv(fixtureText(FIXTURES.nbcnBasDaily));

  it('has the homogenised temperature columns', () => {
    expect(columnIndex(header, 'ths200d0')).toBeGreaterThanOrEqual(0);
    expect(columnIndex(header, 'ths200dx')).toBeGreaterThanOrEqual(0);
    expect(columnIndex(header, 'ths200dn')).toBeGreaterThanOrEqual(0);
  });

  it('contains 162 July 30ths, 40 Feb 29ths and 162 Mar 1sts', () => {
    const count = (ddmm: string) =>
      rows.filter((r) => r[1].startsWith(ddmm)).length;
    expect(count('30.07')).toBe(162);
    expect(count('29.02')).toBe(40);
    expect(count('01.03')).toBe(162);
  });

  it('records 26.8 °C as the mean on 30 July 1947', () => {
    const ts = columnIndex(header, 'reference_timestamp');
    const mean = columnIndex(header, 'ths200d0');
    const row = rows.find((r) => r[ts].startsWith('30.07.1947'));
    expect(row?.[mean]).toBe('26.8');
  });
});

describe('SMN Buchs/Aarau fixture', () => {
  const { header, rows } = parseSemicolonCsv(fixtureText(FIXTURES.smnBusDaily));

  it('uses tre200* column names, not ths200*', () => {
    expect(header).toContain('tre200d0');
    expect(header).not.toContain('ths200d0');
  });

  it('contains 42 July 30ths, starting in 1984', () => {
    const july = rows.filter((r) => r[1].startsWith('30.07'));
    expect(july).toHaveLength(42);
    expect(july[0][1]).toContain('1984');
  });

  it('records 34.1 °C as the max on 30 July 2018', () => {
    const ts = columnIndex(header, 'reference_timestamp');
    const max = columnIndex(header, 'tre200dx');
    const row = rows.find((r) => r[ts].startsWith('30.07.2018'));
    expect(row?.[max]).toBe('34.1');
  });
});

describe('station name decoding', () => {
  it('preserves non-ASCII station names through latin-1 decoding', () => {
    const text = fixtureText(FIXTURES.smnStations);
    expect(text).toContain('Grächen');
  });
});
