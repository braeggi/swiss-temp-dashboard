import { describe, expect, it } from 'vitest';
import {
  columnIndex,
  decodeLatin1,
  parseNumberOrNull,
  parseSemicolonCsv,
  parseSwissDate,
} from './csv';

describe('decodeLatin1', () => {
  it('decodes bytes that are invalid UTF-8', () => {
    // 0xE4 is "ä" in latin-1 but an invalid UTF-8 continuation byte.
    const bytes = new Uint8Array([0x47, 0x72, 0xe4, 0x63, 0x68, 0x65, 0x6e]);
    expect(decodeLatin1(bytes)).toBe('Grächen');
  });

  it('strips a UTF-8 BOM if present', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 0x41]);
    expect(decodeLatin1(bytes)).toBe('A');
  });
});

describe('parseSemicolonCsv', () => {
  it('splits header and rows on semicolons', () => {
    const { header, rows } = parseSemicolonCsv(
      'station_abbr;reference_timestamp;ths200d0\nBAS;30.07.2025 00:00;17.5\n',
    );
    expect(header).toEqual(['station_abbr', 'reference_timestamp', 'ths200d0']);
    expect(rows).toEqual([['BAS', '30.07.2025 00:00', '17.5']]);
  });

  it('ignores blank trailing lines and handles CRLF', () => {
    const { rows } = parseSemicolonCsv('a;b\r\n1;2\r\n\r\n');
    expect(rows).toEqual([['1', '2']]);
  });
});

describe('parseSwissDate', () => {
  it('parses DD.MM.YYYY HH:MM', () => {
    expect(parseSwissDate('30.07.2025 00:00')).toEqual({ year: 2025, month: 7, day: 30 });
  });

  it('parses a bare DD.MM.YYYY', () => {
    expect(parseSwissDate('01.01.1864')).toEqual({ year: 1864, month: 1, day: 1 });
  });

  it('throws on an unexpected shape', () => {
    expect(() => parseSwissDate('2025-07-30')).toThrow(/unrecognised date/i);
  });
});

describe('columnIndex', () => {
  it('finds a column', () => {
    expect(columnIndex(['a', 'b'], 'b')).toBe(1);
  });

  it('throws naming the missing column', () => {
    expect(() => columnIndex(['a'], 'tre200d0')).toThrow(/tre200d0/);
  });
});

describe('parseNumberOrNull', () => {
  it('parses numbers', () => {
    expect(parseNumberOrNull('17.5')).toBe(17.5);
    expect(parseNumberOrNull('-2.4')).toBe(-2.4);
  });

  it('returns null for blank or non-numeric values', () => {
    expect(parseNumberOrNull('')).toBeNull();
    expect(parseNumberOrNull('   ')).toBeNull();
    expect(parseNumberOrNull('-')).toBeNull();
  });
});
