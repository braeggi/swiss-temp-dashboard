import { describe, expect, it } from 'vitest';
import { buildAnswerHeadline, buildFrequencyTile, buildHeatDaysTile, buildLongTermTile } from './answer';
import type { FrequencyShift } from './returnPeriod';
import type { HeatEpisode, HeatState } from './heatEpisodes';

function episode(overrides: Partial<HeatEpisode> = {}): HeatEpisode {
  return {
    startIndex: 0, endIndex: 2, year: 2026,
    startDate: '2026-07-29', endDate: '2026-07-31',
    days: 3, peakMean: 27, meanOfMeans: 26.3, gapAdjacent: false,
    ...overrides,
  };
}

describe('buildAnswerHeadline', () => {
  it('state A: day number includes today, mentions the live reading', () => {
    const state: HeatState = {
      kind: 'running', episode: episode({ days: 3 }), dayNumber: 4,
      todayProvisional: true, measuredThroughIso: '2026-07-31',
    };
    const h = buildAnswerHeadline(state, 27.4);
    expect(h.heading).toBe('Day 4 of a heat wave');
    expect(h.sub).toContain('3 days completed since 29 July');
    expect(h.sub).toContain('27.4 °C');
    expect(h.sub).toContain('still in progress');
  });

  it('state A without a live reading omits the today clause', () => {
    const state: HeatState = {
      kind: 'running', episode: episode({ days: 3 }), dayNumber: 4,
      todayProvisional: true, measuredThroughIso: '2026-07-31',
    };
    const h = buildAnswerHeadline(state, null);
    expect(h.sub).toBe('3 days completed since 29 July');
  });

  it('state B with a finished wave this year', () => {
    const state: HeatState = {
      kind: 'thisYear', year: 2026, qualifyingDays: 5,
      lastEpisode: episode({ startDate: '2026-06-10', endDate: '2026-06-12', days: 3 }),
    };
    const h = buildAnswerHeadline(state, null);
    expect(h.heading).toBe('Summer 2026 · 5 heat days so far');
    expect(h.sub).toBe('Last heat wave 10 June–12 June, 3 days');
  });

  it('state B with warm days that never formed a wave', () => {
    const state: HeatState = { kind: 'thisYear', year: 2026, qualifyingDays: 2, lastEpisode: null };
    const h = buildAnswerHeadline(state, null);
    expect(h.heading).toBe('Summer 2026 · 2 warm days so far');
    expect(h.sub).toBe('None of them have yet formed a three-day heat wave.');
  });

  it('state C with a past heat wave', () => {
    const state: HeatState = {
      kind: 'lastSummer', year: 2025,
      longestEpisode: episode({ startDate: '2025-08-12', endDate: '2025-08-16', days: 5 }),
    };
    const h = buildAnswerHeadline(state, null);
    expect(h.heading).toBe('Summer 2025 in review');
    expect(h.sub).toBe('Longest heat wave: 5 days, 12 August–16 August');
  });

  it('state C with no heat wave anywhere in the record', () => {
    const state: HeatState = { kind: 'lastSummer', year: null, longestEpisode: null };
    const h = buildAnswerHeadline(state, null);
    expect(h.heading).toBe('No recorded heat wave yet');
  });
});

describe('buildHeatDaysTile', () => {
  it('compares the current year to the record year at the same cutoff', () => {
    const rows = [
      { year: 2003, days: 31, daysWithData: 214 },
      { year: 2026, days: 27, daysWithData: 214 },
    ];
    expect(buildHeatDaysTile(rows, 2026, '1 August')).toBe(
      '27 hot days by 1 August · 2003 had 31 by the same date.',
    );
  });

  it('says so when the current year already holds the record', () => {
    const rows = [
      { year: 2003, days: 20, daysWithData: 214 },
      { year: 2026, days: 27, daysWithData: 214 },
    ];
    expect(buildHeatDaysTile(rows, 2026, '1 August')).toBe(
      '27 hot days by 1 August — the most on record for this date.',
    );
  });

  it('handles a single-day count without pluralising oddly', () => {
    const rows = [{ year: 2026, days: 1, daysWithData: 214 }];
    expect(buildHeatDaysTile(rows, 2026, '1 August')).toBe(
      '1 hot day by 1 August — the most on record for this date.',
    );
  });

  it('falls back when the current year itself is too sparse to count', () => {
    const rows = [{ year: 2026, days: null, daysWithData: 40 }];
    expect(buildHeatDaysTile(rows, 2026, '1 August')).toBe(
      'Not enough data yet this year to count hot days reliably.',
    );
  });
});

describe('buildLongTermTile', () => {
  it('states the shift between the first and last complete decade', () => {
    const change = { from: { decade: 1900, years: 8, perYear: 1.2 }, to: { decade: 2020, years: 6, perYear: 9.4 }, delta: 8.2 };
    expect(buildLongTermTile(change)).toBe('1900s: 1.2 hot days/year · 2020s: 9.4 · +8.2');
  });

  it('states a negative shift with a minus sign', () => {
    const change = { from: { decade: 1900, years: 8, perYear: 9.4 }, to: { decade: 2020, years: 6, perYear: 1.2 }, delta: -8.2 };
    expect(buildLongTermTile(change)).toBe('1900s: 9.4 hot days/year · 2020s: 1.2 · −8.2');
  });

  it('gives the reason when there are too few decades', () => {
    expect(buildLongTermTile(null)).toBe('Not enough complete decades yet to show a long-term shift.');
  });
});

describe('buildFrequencyTile', () => {
  const shift = (over: Partial<FrequencyShift> = {}): FrequencyShift => ({
    early: { fromYear: 1864, toYear: 1893, years: 30, perYear: 2.1 },
    recent: { fromYear: 1996, toYear: 2025, years: 30, perYear: 11.4 },
    threshold: 24.6,
    direction: 'warm',
    factor: 11.4 / 2.1,
    ...over,
  });

  it('leads with the factor, because that is the finding', () => {
    const tile = buildFrequencyTile(shift());
    expect(tile).toMatch(/^5\.4× as often/);
    expect(tile).toContain('2.1');
    expect(tile).toContain('11.4');
  });

  it('names both windows, since "the first thirty years" differs per station', () => {
    const tile = buildFrequencyTile(shift());
    expect(tile).toContain('1864–1893');
    expect(tile).toContain('1996–2025');
  });

  it('says so plainly when the early window never saw such a day', () => {
    // "Infinity× as often" is what a bare ratio would print here.
    const tile = buildFrequencyTile(shift({ early: { fromYear: 1864, toYear: 1893, years: 30, perYear: 0 }, factor: null }));
    expect(tile).not.toMatch(/Infinity|NaN/);
    expect(tile).toMatch(/did not happen/i);
  });

  it('describes a fall as a fall, not as a fraction of a multiplier', () => {
    // Frost days becoming rarer is the same evidence read from the cool end.
    const tile = buildFrequencyTile(shift({
      direction: 'cool',
      early: { fromYear: 1864, toYear: 1893, years: 30, perYear: 42 },
      recent: { fromYear: 1996, toYear: 2025, years: 30, perYear: 18.3 },
      factor: 18.3 / 42,
    }));
    expect(tile).not.toContain('×');
    expect(tile).toMatch(/cold/);
    expect(tile).toContain('44 %');
  });

  it('does not dress up a record that barely moved', () => {
    const tile = buildFrequencyTile(shift({
      recent: { fromYear: 1996, toYear: 2025, years: 30, perYear: 2.15 },
      factor: 2.15 / 2.1,
    }));
    expect(tile).toMatch(/^About as often/);
  });

  it('has nothing to say without a shift to report', () => {
    expect(buildFrequencyTile(null)).toBeNull();
  });
});
