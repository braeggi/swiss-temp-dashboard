// src/lib/sources/openMeteoSeries.test.ts
import { describe, expect, it, vi } from 'vitest';
import { openMeteoDaily } from './openMeteo';

const jsonResponse = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as Response;

describe('openMeteoDaily', () => {
  it('keeps only the requested calendar day and tags each with its year', async () => {
    const f = vi.fn().mockResolvedValue(
      jsonResponse({
        daily: {
          time: ['1940-07-29', '1940-07-30', '1941-07-30', '1941-08-01'],
          temperature_2m_mean: [10, 13.3, 14.1, 20],
          temperature_2m_max: [15, 17.7, 18.2, 25],
          temperature_2m_min: [5, 8.0, 9.1, 15],
        },
      }),
    );
    const got = await openMeteoDaily(47.39, 8.04, 7, 30, 1941, f);
    expect(got.mean).toEqual([
      { year: 1940, value: 13.3 },
      { year: 1941, value: 14.1 },
    ]);
    expect(got.max[0].value).toBe(17.7);
  });

  it('requests the archive from 1940', async () => {
    const f = vi.fn().mockResolvedValue(jsonResponse({ daily: { time: [], temperature_2m_mean: [], temperature_2m_max: [], temperature_2m_min: [] } }));
    await openMeteoDaily(47, 8, 1, 1, 2026, f);
    expect(f.mock.calls[0][0]).toContain('start_date=1940-01-01');
  });

  it('skips null values rather than emitting them as zero', async () => {
    const f = vi.fn().mockResolvedValue(
      jsonResponse({
        daily: {
          time: ['1940-07-30', '1941-07-30'],
          temperature_2m_mean: [null, 14.1],
          temperature_2m_max: [17.7, null],
          temperature_2m_min: [8, 9],
        },
      }),
    );
    const got = await openMeteoDaily(47, 8, 7, 30, 1941, f);
    expect(got.mean).toEqual([{ year: 1941, value: 14.1 }]);
    expect(got.max).toEqual([{ year: 1940, value: 17.7 }]);
  });

  it('returns empty arrays when the response has no daily block', async () => {
    const f = vi.fn().mockResolvedValue(jsonResponse({}));
    const got = await openMeteoDaily(47, 8, 7, 30, 2026, f);
    expect(got).toEqual({ mean: [], max: [], min: [] });
  });

  it('throws on a failed request', async () => {
    const f = vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response);
    await expect(openMeteoDaily(47, 8, 7, 30, 2026, f)).rejects.toThrow(/500/);
  });
});
