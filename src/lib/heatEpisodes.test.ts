import { describe, expect, it } from 'vitest';
import { findHeatEpisodes, HEATWAVE_MIN_DAYS, HEATWAVE_MIN_MEAN, heatState } from './heatEpisodes';
import { SLOTS_PER_YEAR, allocateSeries, encodeValue, slotOfYear } from './packed';
import type { PackedStation } from '../types';

/**
 * A station whose mean series is empty except where `set` writes.
 * max/min are left missing — no test here reads them.
 */
export function meanStation(
  fromYear: number,
  toYear: number,
  set: (write: (year: number, month: number, day: number, mean: number | null) => void) => void,
): PackedStation {
  const mean = allocateSeries(fromYear, toYear);
  const write = (year: number, month: number, day: number, v: number | null) => {
    mean[(year - fromYear) * SLOTS_PER_YEAR + slotOfYear(month, day)] = encodeValue(v);
  };
  set(write);
  return {
    abbr: 'TST', name: 'Test', canton: 'ZH', lat: 47, lon: 8, altitude: 400,
    source: 'smn', homogenised: false, fromYear, toYear,
    mean, max: allocateSeries(fromYear, toYear), min: allocateSeries(fromYear, toYear),
  };
}

/** Write `values` on consecutive days starting at the given date. */
export function writeRun(
  write: (y: number, m: number, d: number, v: number | null) => void,
  year: number,
  month: number,
  startDay: number,
  values: (number | null)[],
): void {
  values.forEach((v, i) => write(year, month, startDay + i, v));
}

describe('findHeatEpisodes', () => {
  it('exposes the Swiss heat-wave definition', () => {
    expect(HEATWAVE_MIN_MEAN).toBe(25);
    expect(HEATWAVE_MIN_DAYS).toBe(3);
  });

  it('finds a run of exactly three qualifying days', () => {
    const st = meanStation(2020, 2020, (w) => {
      writeRun(w, 2020, 7, 10, [26, 27, 26]);
    });
    const eps = findHeatEpisodes(st);
    expect(eps).toHaveLength(1);
    expect(eps[0].days).toBe(3);
    expect(eps[0].startDate).toBe('2020-07-10');
    expect(eps[0].endDate).toBe('2020-07-12');
    expect(eps[0].year).toBe(2020);
  });

  it('does not report a two-day run', () => {
    const st = meanStation(2020, 2020, (w) => {
      writeRun(w, 2020, 7, 10, [26, 27]);
    });
    expect(findHeatEpisodes(st)).toEqual([]);
  });

  it('treats exactly 25.0 as qualifying and 24.9 as not', () => {
    const st = meanStation(2020, 2020, (w) => {
      writeRun(w, 2020, 7, 10, [25, 25, 25]);
      writeRun(w, 2020, 8, 10, [24.9, 24.9, 24.9]);
    });
    const eps = findHeatEpisodes(st);
    expect(eps).toHaveLength(1);
    expect(eps[0].startDate).toBe('2020-07-10');
  });

  it('reports peak and mean of the episode', () => {
    const st = meanStation(2020, 2020, (w) => {
      writeRun(w, 2020, 7, 10, [26, 30, 28, 25]);
    });
    const [ep] = findHeatEpisodes(st);
    expect(ep.days).toBe(4);
    expect(ep.peakMean).toBe(30);
    expect(ep.meanOfMeans).toBeCloseTo(27.25, 5);
  });

  it('a sub-threshold day splits one long run into two', () => {
    const st = meanStation(2020, 2020, (w) => {
      writeRun(w, 2020, 7, 10, [26, 26, 26, 20, 27, 27, 27]);
    });
    const eps = findHeatEpisodes(st);
    expect(eps).toHaveLength(2);
    expect(eps[0].endDate).toBe('2020-07-12');
    expect(eps[1].startDate).toBe('2020-07-14');
  });

  it('returns episodes in chronological order across years', () => {
    const st = meanStation(2018, 2020, (w) => {
      writeRun(w, 2020, 7, 10, [26, 26, 26]);
      writeRun(w, 2018, 8, 1, [27, 27, 27]);
    });
    const eps = findHeatEpisodes(st);
    expect(eps.map((e) => e.year)).toEqual([2018, 2020]);
  });

  it('returns nothing for a station with no qualifying days', () => {
    const st = meanStation(2020, 2020, (w) => {
      writeRun(w, 2020, 7, 10, [10, 12, 11]);
    });
    expect(findHeatEpisodes(st)).toEqual([]);
  });
});

describe('findHeatEpisodes — data gaps (R1)', () => {
  it('a missing day breaks a five-day run into two non-episodes', () => {
    const st = meanStation(2020, 2020, (w) => {
      writeRun(w, 2020, 7, 10, [26, 26, null, 26, 26]);
    });
    // Two runs of two days each. Neither reaches three, so neither is a
    // heat wave — we cannot claim a day we did not measure.
    expect(findHeatEpisodes(st)).toEqual([]);
  });

  it('flags an episode with a gap immediately before it', () => {
    const st = meanStation(2020, 2020, (w) => {
      // Earlier readings are essential: without them the missing 9 July is
      // indistinguishable from "the record starts on the 10th", which is
      // deliberately NOT a gap. The hole has to sit inside the covered span.
      writeRun(w, 2020, 7, 5, [15, 16]);
      writeRun(w, 2020, 7, 9, [null, 26, 26, 26, 20]);
    });
    const [ep] = findHeatEpisodes(st);
    expect(ep.startDate).toBe('2020-07-10');
    expect(ep.gapAdjacent).toBe(true);
  });

  it('flags an episode with a gap immediately after it', () => {
    const st = meanStation(2020, 2020, (w) => {
      writeRun(w, 2020, 7, 9, [20, 26, 26, 26, null]);
      w(2020, 7, 20, 15); // later reading, so the gap is inside the record
    });
    const [ep] = findHeatEpisodes(st);
    expect(ep.gapAdjacent).toBe(true);
  });

  it('does not flag an episode bounded by measured, sub-threshold days', () => {
    const st = meanStation(2020, 2020, (w) => {
      writeRun(w, 2020, 7, 9, [20, 26, 26, 26, 20]);
    });
    const [ep] = findHeatEpisodes(st);
    expect(ep.gapAdjacent).toBe(false);
  });

  it('does not flag the trailing edge of the record as a gap', () => {
    // The current year is full of MISSING for days that have not happened.
    // That is the future, not a hole in the measurements.
    const st = meanStation(2020, 2020, (w) => {
      writeRun(w, 2020, 7, 10, [26, 26, 26]);
    });
    const [ep] = findHeatEpisodes(st);
    expect(ep.gapAdjacent).toBe(false);
  });

  it('does not flag the leading edge of the record as a gap', () => {
    const st = meanStation(2020, 2020, (w) => {
      writeRun(w, 2020, 1, 1, [26, 26, 26, 20]);
    });
    const [ep] = findHeatEpisodes(st);
    expect(ep.startDate).toBe('2020-01-01');
    expect(ep.gapAdjacent).toBe(false);
  });
});

describe('findHeatEpisodes — the continuous walk (R4)', () => {
  it('spans the turn of the year without a special case', () => {
    // Not a real Swiss case, but the walk must not silently drop it.
    // Slot 365 of 2020 is 31 Dec; slot 0 of 2021 is 1 Jan.
    const st = meanStation(2020, 2021, (w) => {
      w(2020, 12, 30, 26);
      w(2020, 12, 31, 26);
      w(2021, 1, 1, 26);
      w(2021, 1, 2, 26);
    });
    const eps = findHeatEpisodes(st);
    expect(eps).toHaveLength(1);
    expect(eps[0].startDate).toBe('2020-12-30');
    expect(eps[0].endDate).toBe('2021-01-02');
    expect(eps[0].days).toBe(4);
    expect(eps[0].year).toBe(2020); // year of the first day
  });

  it('runs straight through the Feb 29 gap in a common year, since it is not a real day', () => {
    // 2021 is not a leap year, so slot 59 (Feb 29) never exists as a
    // calendar day — 28 Feb and 1 Mar are real adjacent days, and a period
    // spanning them is one episode, not two.
    const st = meanStation(2021, 2021, (w) => {
      writeRun(w, 2021, 2, 26, [26, 26, 26]); // 26, 27, 28 Feb
      writeRun(w, 2021, 3, 1, [26, 26, 26]);
    });
    const eps = findHeatEpisodes(st);
    expect(eps).toHaveLength(1);
    expect(eps[0].startDate).toBe('2021-02-26');
    expect(eps[0].endDate).toBe('2021-03-03');
    expect(eps[0].days).toBe(6);
  });

  it('does not count the phantom Feb 29 slot itself as a day', () => {
    // Index span start..end is 6 slots (57..62), but only 5 are real
    // calendar days once the phantom slot 59 is excluded. Getting this
    // wrong means "days" silently overcounts by one whenever an episode
    // crosses a common year's missing Feb 29.
    const st = meanStation(2021, 2021, (w) => {
      writeRun(w, 2021, 2, 27, [26, 26]); // 27, 28 Feb
      writeRun(w, 2021, 3, 1, [26, 26, 26]); // 1, 2, 3 Mar
    });
    const [ep] = findHeatEpisodes(st);
    expect(ep.startDate).toBe('2021-02-27');
    expect(ep.endDate).toBe('2021-03-03');
    expect(ep.days).toBe(5);
  });

  it('runs straight through Feb 29 in a leap year', () => {
    const st = meanStation(2020, 2020, (w) => {
      writeRun(w, 2020, 2, 27, [26, 26, 26]); // 27, 28, 29 Feb
      writeRun(w, 2020, 3, 1, [26]);
    });
    const eps = findHeatEpisodes(st);
    expect(eps).toHaveLength(1);
    expect(eps[0].startDate).toBe('2020-02-27');
    expect(eps[0].endDate).toBe('2020-03-01');
    expect(eps[0].days).toBe(4);
  });
});

describe('heatState — the A/B/C cascade', () => {
  /** Mean series with a run ending on the day before `todayIso`. */
  function runEndingYesterday(days: number): PackedStation {
    return meanStation(2026, 2026, (w) => {
      // 29, 30, 31 July -> "today" in the tests below is 1 August 2026.
      writeRun(w, 2026, 7, 32 - days, new Array(days).fill(26));
    });
  }

  it('A: reports a running episode when today is still above the threshold', () => {
    const st = runEndingYesterday(3);
    const s = heatState(st, findHeatEpisodes(st), '2026-08-01', 26.4);
    expect(s.kind).toBe('running');
    if (s.kind !== 'running') return;
    expect(s.episode.days).toBe(3);      // completed days only (R2)
    expect(s.dayNumber).toBe(4);         // today counted provisionally
    expect(s.todayProvisional).toBe(true);
  });

  it('A: still reports running when the record lags today by two days (NBCN-style)', () => {
    // The episode ends two days before "today" — normal NBCN reporting
    // latency, not a data gap. State A must still fire.
    const st = meanStation(2026, 2026, (w) => {
      writeRun(w, 2026, 7, 29, [26, 26, 26]); // 29, 30, 31 July
    });
    const s = heatState(st, findHeatEpisodes(st), '2026-08-02', 27);
    expect(s.kind).toBe('running');
    if (s.kind !== 'running') return;
    expect(s.episode.days).toBe(3);
    expect(s.measuredThroughIso).toBe('2026-07-31');
  });

  it('A: does not report running when the record is far too stale to trust', () => {
    // The episode ended ten days ago — beyond MAX_REPORTING_LAG_DAYS. This
    // is a station whose feed has stopped, not one reporting with its usual
    // latency, and claiming the wave still runs would overstate the data.
    const st = meanStation(2026, 2026, (w) => {
      writeRun(w, 2026, 7, 20, [26, 26, 26]); // 20, 21, 22 July
    });
    const s = heatState(st, findHeatEpisodes(st), '2026-08-02', 27);
    expect(s.kind).not.toBe('running');
  });

  it('A: does not count today when its partial mean is below the threshold', () => {
    const st = runEndingYesterday(3);
    const s = heatState(st, findHeatEpisodes(st), '2026-08-01', 18);
    // The wave ended yesterday, so this is no longer a running episode.
    expect(s.kind).toBe('thisYear');
  });

  it('A: does not count today when there is no live reading at all', () => {
    const st = runEndingYesterday(3);
    const s = heatState(st, findHeatEpisodes(st), '2026-08-01', null);
    expect(s.kind).toBe('thisYear');
  });

  it('A: two completed days plus a warm today is not yet a heat wave', () => {
    // The definition needs three. Being one short is not a wave — but the
    // year has still seen heat, so this is state B with no episode.
    const st = runEndingYesterday(2);
    const s = heatState(st, findHeatEpisodes(st), '2026-08-01', 27);
    expect(s.kind).toBe('thisYear');
    if (s.kind !== 'thisYear') return;
    expect(s.qualifyingDays).toBe(2);
    expect(s.lastEpisode).toBeNull();
  });

  it('B: falls back to this year when an episode has already ended', () => {
    const st = meanStation(2026, 2026, (w) => {
      writeRun(w, 2026, 6, 10, [26, 26, 26]);
    });
    const s = heatState(st, findHeatEpisodes(st), '2026-08-01', 15);
    expect(s.kind).toBe('thisYear');
    if (s.kind !== 'thisYear') return;
    expect(s.year).toBe(2026);
    expect(s.qualifyingDays).toBe(3);
    expect(s.lastEpisode?.startDate).toBe('2026-06-10');
  });

  it('C: falls back to the last summer that had one', () => {
    const st = meanStation(2025, 2026, (w) => {
      writeRun(w, 2025, 8, 5, [26, 27, 28, 26]);
    });
    const s = heatState(st, findHeatEpisodes(st), '2026-02-14', null);
    expect(s.kind).toBe('lastSummer');
    if (s.kind !== 'lastSummer') return;
    expect(s.year).toBe(2025);
    expect(s.longestEpisode?.days).toBe(4);
  });

  it('C: picks the longest episode of that summer, not the first', () => {
    const st = meanStation(2025, 2026, (w) => {
      writeRun(w, 2025, 6, 1, [26, 26, 26]);
      writeRun(w, 2025, 8, 5, [26, 27, 28, 26, 26]);
    });
    const s = heatState(st, findHeatEpisodes(st), '2026-02-14', null);
    if (s.kind !== 'lastSummer') throw new Error('expected lastSummer');
    expect(s.longestEpisode?.days).toBe(5);
  });

  it('C: reports no episodes at all without throwing', () => {
    const st = meanStation(2025, 2026, (w) => {
      w(2025, 8, 5, 10);
    });
    const s = heatState(st, findHeatEpisodes(st), '2026-02-14', null);
    expect(s.kind).toBe('lastSummer');
    if (s.kind !== 'lastSummer') return;
    expect(s.longestEpisode).toBeNull();
    expect(s.year).toBeNull();
  });
});
