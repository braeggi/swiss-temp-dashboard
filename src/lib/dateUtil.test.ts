// src/lib/dateUtil.test.ts
import { describe, expect, it } from 'vitest';
import { formatDayLabel, isIsoDate, parseIso, todayIso } from './dateUtil';

describe('todayIso', () => {
  it('formats a local date as YYYY-MM-DD', () => {
    expect(todayIso(new Date(2026, 6, 30))).toBe('2026-07-30');
  });

  it('zero-pads single-digit months and days', () => {
    expect(todayIso(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('parseIso', () => {
  it('splits an ISO date', () => {
    expect(parseIso('2026-07-30')).toEqual({ year: 2026, month: 7, day: 30 });
  });

  it('throws on a malformed value', () => {
    expect(() => parseIso('30.07.2026')).toThrow(/ISO date/i);
  });
});

describe('formatDayLabel', () => {
  it('renders a day and month without the year', () => {
    expect(formatDayLabel('2026-07-30')).toBe('30 July');
    expect(formatDayLabel('2026-02-29')).toBe('29 February');
  });
});

describe('isIsoDate', () => {
  it('accepts a valid date', () => {
    expect(isIsoDate('2026-07-30')).toBe(true);
  });

  it('rejects the empty string — what a cleared native date input reports', () => {
    expect(isIsoDate('')).toBe(false);
  });

  it('rejects a differently-formatted date', () => {
    expect(isIsoDate('30.07.2026')).toBe(false);
  });

  it('rejects a partial value', () => {
    expect(isIsoDate('2026-07')).toBe(false);
  });

  // Deliberately true: isIsoDate is a shape check only, not a calendar
  // validator. The only real source of `date` state is a native
  // <input type="date">, which never hands JS a semantically invalid date as
  // a literal string — it reports "" instead (verified by hand: setting the
  // control's value to a non-existent date like 2026-02-29 makes it read back
  // as "", not the literal string). So there is no real caller this app has
  // that could produce "0000-00-00", and re-deriving day-in-month/leap-year
  // rules here would just duplicate — and risk diverging from — logic the
  // platform already gets right.
  it('rejects a structurally-valid-but-impossible date', () => {
    // Superseded intent, kept as a marker: this originally asserted `true`,
    // because validation was shape-only on the reasoning that the sole writer
    // of date state was a native <input type="date">. URL parameters are now a
    // second writer that can carry anything, so calendar validity is enforced.
    expect(isIsoDate('0000-00-00')).toBe(false);
  });
});

describe('isIsoDate — calendar semantics, not just shape', () => {
  it('accepts real dates', () => {
    expect(isIsoDate('2026-07-31')).toBe(true);
    expect(isIsoDate('1864-01-01')).toBe(true);
  });

  it('rejects malformed shapes', () => {
    for (const s of ['', '2026-07', '30.07.2026', '2026-7-3', 'abc', '2026-07-31x']) {
      expect(isIsoDate(s)).toBe(false);
    }
  });

  it('rejects 0000-00-00, which a shape-only check lets through', () => {
    // This one reached slotOfYear(0,0) and threw in the render path.
    expect(isIsoDate('0000-00-00')).toBe(false);
  });

  it('rejects impossible months and days', () => {
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('2026-00-10')).toBe(false);
    expect(isIsoDate('2026-07-32')).toBe(false);
    expect(isIsoDate('2026-07-00')).toBe(false);
    expect(isIsoDate('2026-04-31')).toBe(false);
  });

  it('knows how long February is', () => {
    expect(isIsoDate('2024-02-29')).toBe(true);   // leap
    expect(isIsoDate('2026-02-29')).toBe(false);  // common
    expect(isIsoDate('2000-02-29')).toBe(true);   // divisible by 400
    expect(isIsoDate('1900-02-29')).toBe(false);  // divisible by 100, not 400
  });
});
