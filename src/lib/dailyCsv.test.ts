import { describe, expect, it } from 'vitest';
import { readDailyCsv, packRows } from './dailyCsv';
import { decodeValue, indexFor } from './packed';
import { FIXTURES, fixtureText } from '../../tests/fixtures/paths';

describe('readDailyCsv', () => {
  it('reads NBCN homogenised columns', () => {
    const rows = readDailyCsv(fixtureText(FIXTURES.nbcnBasDaily), 'nbcn');
    const y1947 = rows.find((r) => r.year === 1947 && r.month === 7 && r.day === 30);
    expect(y1947?.mean).toBe(26.8);
  });

  it('reads SMN measured columns', () => {
    const rows = readDailyCsv(fixtureText(FIXTURES.smnBusDaily), 'smn');
    const y2018 = rows.find((r) => r.year === 2018 && r.month === 7 && r.day === 30);
    expect(y2018?.max).toBe(34.1);
  });

  it('yields null for blank min/max in early NBCN years', () => {
    const rows = readDailyCsv(fixtureText(FIXTURES.nbcnBasDaily), 'nbcn');
    const early = rows.find((r) => r.year === 1870 && r.month === 7 && r.day === 30);
    expect(early?.mean).not.toBeNull();
    expect(early?.min).toBeNull();
    expect(early?.max).toBeNull();
  });
});

describe('packRows', () => {
  it('derives the year range from the data', () => {
    const rows = readDailyCsv(fixtureText(FIXTURES.smnBusDaily), 'smn');
    const packed = packRows(rows);
    expect(packed.fromYear).toBe(1984);
    expect(packed.toYear).toBe(2025);
  });

  it('places values at the leap-safe slot so they round-trip', () => {
    const rows = readDailyCsv(fixtureText(FIXTURES.nbcnBasDaily), 'nbcn');
    const packed = packRows(rows);
    const i = indexFor(packed.fromYear, 1947, 7, 30);
    expect(decodeValue(packed.mean[i])).toBeCloseTo(26.8, 5);
  });

  it('keeps Feb 29 and Mar 1 in separate slots', () => {
    const rows = readDailyCsv(fixtureText(FIXTURES.nbcnBasDaily), 'nbcn');
    const packed = packRows(rows);
    // 2000 was a leap year: both dates exist and must not overwrite each other.
    const feb29 = indexFor(packed.fromYear, 2000, 2, 29);
    const mar1 = indexFor(packed.fromYear, 2000, 3, 1);
    expect(feb29).not.toBe(mar1);
    expect(decodeValue(packed.mean[feb29])).not.toBeNull();
    expect(decodeValue(packed.mean[mar1])).not.toBeNull();
  });

  it('leaves Feb 29 MISSING in a common year', () => {
    const rows = readDailyCsv(fixtureText(FIXTURES.nbcnBasDaily), 'nbcn');
    const packed = packRows(rows);
    const i = indexFor(packed.fromYear, 1999, 2, 29);
    expect(decodeValue(packed.mean[i])).toBeNull();
  });
});
