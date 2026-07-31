import { describe, expect, it, vi } from 'vitest';
import { clearStationCache, loadPackedStation, mergeRecent } from './packedStation';
import { loadLive } from './smnLive';
import { geocode } from './openMeteo';
import { decodeValue, indexFor } from '../packed';
import type { PackedStation } from '../../types';
import { FIXTURES, fixtureText } from '../../../tests/fixtures/paths';

const station = (): PackedStation => ({
  abbr: 'BUS',
  name: 'Buchs / Aarau',
  canton: 'AG',
  lat: 47.384381,
  lon: 8.07955,
  altitude: 387,
  source: 'smn',
  homogenised: false,
  fromYear: 2024,
  toYear: 2025,
  mean: new Array(2 * 366).fill(-32768),
  max: new Array(2 * 366).fill(-32768),
  min: new Array(2 * 366).fill(-32768),
});

const jsonResponse = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as Response;

const textResponse = (text: string) =>
  ({
    ok: true,
    status: 200,
    arrayBuffer: async () => new TextEncoder().encode(text).buffer,
  }) as Response;

describe('loadPackedStation', () => {
  it('fetches the station file by abbreviation', async () => {
    const st = station();
    const f = vi.fn().mockResolvedValue(jsonResponse(st));
    const got = await loadPackedStation('BUS', f);
    // Strict equality, not toContain: 'data/stations/BUS.json' is a substring of the
    // buggy '/data/stations/BUS.json', so a substring check cannot tell them apart
    // and would not catch a reintroduced leading slash (which breaks subpath deploys).
    expect(f.mock.calls[0][0]).toBe('data/stations/BUS.json');
    expect(got.abbr).toBe('BUS');
  });

  it('throws a useful message on 404', async () => {
    const f = vi.fn().mockResolvedValue({ ok: false, status: 404 } as Response);
    await expect(loadPackedStation('XXX', f)).rejects.toThrow(/XXX/);
  });
});

describe('loadPackedStation caching', () => {
  it('serves a repeat request for the same station from memory', async () => {
    clearStationCache();
    const f = vi.fn().mockResolvedValue(jsonResponse(station()));
    await loadPackedStation('BUS', f);
    await loadPackedStation('BUS', f);
    // A station file is 160-675 KB; refetching it on every switch back is waste.
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('still fetches a different station', async () => {
    clearStationCache();
    const f = vi.fn().mockResolvedValue(jsonResponse(station()));
    await loadPackedStation('BUS', f);
    await loadPackedStation('BAS', f);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('does not cache a failed load', async () => {
    clearStationCache();
    const bad = vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response);
    await expect(loadPackedStation('BUS', bad)).rejects.toThrow();
    const good = vi.fn().mockResolvedValue(jsonResponse(station()));
    await loadPackedStation('BUS', good);
    expect(good).toHaveBeenCalledTimes(1);
  });

  it('hands back an equal station on the cached path', async () => {
    clearStationCache();
    const f = vi.fn().mockResolvedValue(jsonResponse(station()));
    const first = await loadPackedStation('BUS', f);
    const second = await loadPackedStation('BUS', f);
    expect(second.abbr).toBe(first.abbr);
    expect(second.mean).toHaveLength(first.mean.length);
  });
});

describe('mergeRecent', () => {
  it('extends toYear and writes current-year values into the packed arrays', async () => {
    const csv = [
      'station_abbr;reference_timestamp;tre200d0;tre200dx;tre200dn',
      'BUS;30.07.2026 00:00;24;33.5;14.4',
    ].join('\n');
    const f = vi.fn().mockResolvedValue(textResponse(csv));
    const merged = await mergeRecent(station(), f);

    expect(merged.toYear).toBe(2026);
    const i = indexFor(merged.fromYear, 2026, 7, 30);
    expect(decodeValue(merged.mean[i])).toBeCloseTo(24, 5);
    expect(decodeValue(merged.max[i])).toBeCloseTo(33.5, 5);
  });

  it('returns the station unchanged when the recent file is unavailable', async () => {
    const f = vi.fn().mockResolvedValue({ ok: false, status: 404 } as Response);
    const merged = await mergeRecent(station(), f);
    expect(merged.toYear).toBe(2025);
  });

  it('uses the nbcn column names for a homogenised station', async () => {
    const csv = [
      'station_abbr;reference_timestamp;ths200d0;ths200dx;ths200dn',
      'BAS;30.07.2026 00:00;24;33.5;14.4',
    ].join('\n');
    const f = vi.fn().mockResolvedValue(textResponse(csv));
    const st = { ...station(), abbr: 'BAS', source: 'nbcn' as const, homogenised: true };
    const merged = await mergeRecent(st, f);
    expect(f.mock.calls[0][0]).toContain('ogd-nbcn');
    expect(merged.toYear).toBe(2026);
  });
});

describe('loadLive', () => {
  it('parses the now file into readings', async () => {
    const f = vi.fn().mockResolvedValue(textResponse(fixtureText(FIXTURES.smnBasLive)));
    const readings = await loadLive('BAS', f);
    expect(readings.length).toBeGreaterThan(0);
    expect(f.mock.calls[0][0]).toContain('ogd-smn_bas_t_now.csv');
  });

  it('returns an empty array when the file is missing', async () => {
    const f = vi.fn().mockResolvedValue({ ok: false, status: 404 } as Response);
    expect(await loadLive('XXX', f)).toEqual([]);
  });
});

describe('geocode', () => {
  it('restricts results to Switzerland and maps the fields', async () => {
    const f = vi.fn().mockResolvedValue(
      jsonResponse({
        results: [
          {
            name: 'Aarau',
            latitude: 47.39254,
            longitude: 8.04422,
            elevation: 389,
            admin1: 'Canton of Aargau',
            country_code: 'CH',
          },
        ],
      }),
    );
    const got = await geocode('Aarau', f);
    expect(f.mock.calls[0][0]).toContain('countryCode=CH');
    expect(got[0]).toEqual({
      name: 'Aarau',
      lat: 47.39254,
      lon: 8.04422,
      altitude: 389,
      admin1: 'Canton of Aargau',
    });
  });

  it('returns an empty array when the API reports no results', async () => {
    const f = vi.fn().mockResolvedValue(jsonResponse({}));
    expect(await geocode('nowhere', f)).toEqual([]);
  });
});
